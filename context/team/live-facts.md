---
name: live-facts
layer: team
description: 分离设计契约、仓库实现与运行观测；环境按需只读核验，不让快照进入长期入口
doc-sync: required
affects:
  - scripts/env-check.py
  - scripts/verify-doc-sync.py
  - scripts/verify-context.sh
  - frontend/.vite-hooks/commit-msg
  - .github/workflows/context-gate.yml
  - .gitlab-ci.yml
---

# 环境事实与文档一致性

## 为什么需要边界

2026-08-29 曾把 scheduler 故障时的 Pod 分布写成健康基线。2026-09-26 再核对时，环境手册仍混用不同集群的入口，且本文还声称 `[LIVE-FACT]` 日期门禁有效——它实际上已在 2026-09-17 删除。**核对日期只能证明有人写了日期，不能证明内容正确。**

不恢复日期正则，不为每次观测新建归档。把机器能验证的事实交给机器，把会过期的结果从长期入口移开。

## 一种事实只在一个地方负责

| 类型 | 权威来源 | 文档写法 |
|---|---|---|
| 目标、约束、取舍 | TECH / 对应设计与决策 | 写应当满足的契约、前置条件和验收；不把目标写成已上线 |
| 仓库实现 | 源码、proto、清单、锁文件 | 可提取部分用生成区 `--check` / embed；拓扑查 matrix，清单双渲染用 parity |
| 进度与缺口 | TODO | 只写尚需做什么；不复制 Pod、VIP、版本和部署流水账 |
| 本机/集群运行观测 | 该目标的实时查询 | 在会话/临时诊断输出带目标、时间、命令和结果，不进入 AGENTS/INDEX 的常驻上下文 |

**节点数、CPU 架构、K8s 版本、组件是否安装、CA 指纹也会随重建变化**，不是永久结构事实。声明版本与实跑版本分开；依赖安装了不等于业务已接线；对象 Ready 不等于协议、权限、业务和恢复验收完成。

## 环境核验：低成本、按需、未知不冒充成功

入口与通路只在 [local-env.md](local-env.md) 维护。`python3 scripts/env-check.py` 默认仅本机；集群/GitOps/观测/路由分区显式选择。每条子命令有超时；只保留白名单字段，不读 Secret 或打印完整环境变量、配置、错误正文。

- `observed`：本次查询成功；允许为空，但只能据此断言该次查询范围内的对象不存在。
- `unknown`：没查到可靠结果（缺工具、权限、网络、CRD 或格式），退出非零；不得改写为「未部署」或「健康」。
- 不自动缓存，不写仓库。当前任务同一 context 可复用刚取得的结果；换环境、部署、重建、网络变化或判断依赖实时安全条件时重查。
- 默认不开全环境巡检；普通代码修改只读对应约束。排障先查一个分区，有异常才追组件日志/指标。
- 故障期间可以采诊断证据，但不把它提升为容量或稳态基线。一次健康采样也不证明 restart 稳定、24 小时可靠或备份可恢复。

要保存临时输出时放仓外或被忽略的 `.runtime/`，复用前核对目标和时间；不要建立按日期增长的环境文档目录。受管文档不得依赖这些临时文件作为长期事实。

## Git 差异门禁：强制评估文档责任，不强制凑字

使用现有 frontmatter `affects:` 的准确文件/目录列表。只有显式带 `doc-sync: required` 的文档参与阻断；未标记的登记继续由 `spec-impact.sh` 提示。按真实事故逐步登记，不为覆盖率把全仓所有文件列一遍。

```bash
python3 scripts/verify-doc-sync.py                          # 工作树 + 暂存区 + 未跟踪，相对 HEAD
python3 scripts/verify-doc-sync.py --staged                 # 只看索引；未暂存文档不能代过
python3 scripts/verify-doc-sync.py --base <sha> --head HEAD  # 两个固定树的差异
python3 scripts/verify-doc-sync.py --base <ref> --merge-base # PR：唯一 merge-base 到 head
```

相关代码变更时，**对应文档**须有正文变化；只改空白、HTML 注释或 frontmatter 不算，改无关 README 不算。比较旧、新映射的并集，删 `doc-sync` 或挪走映射不能豁免同次代码变更。删除文档也需要理由/替代归属，不按「有删除 diff」放行。

内部重命名、测试增强或生成物回写确实不改契约时，在该代码提交的消息中写准确路径和具体理由：

```text
Doc-Impact: none docs/TECH.md | 仅调整内部变量名，公开协议与部署契约未变
```

此理由至少 12 个字符，但**长度不是真实性验证**。每个需要豁免的文档分别写；提交消息需审查。理由只覆盖带它的代码提交，不覆盖后续新增代码。CI 按整次 push/MR 比较，允许代码与对应文档分组提交；本机 commit-msg 当场检查，分组代码提交若不带文档仍需说明理由。

本机钩子有一个已知盲区：`--staged` 以 HEAD 为基准，`git commit --amend` 和 rebase reword 时，被改写提交里原有的源码改动不在检查范围内，本地会放行。钩子拿不到可靠的 amend 信号，这部分由 CI 的 push/MR 范围检查兜底。所以本地放行不等于已经通过。

GitHub/GitLab 轻门禁显式传事件 base，不偷偷退到 `HEAD~1`；事件 base 为空或不可达（force-push 丢弃旧提交、新分支首推）时退回默认分支的 merge-base，默认分支也解析不出才失败；不连集群。回退用的 `origin/<默认分支>` 由两边 CI 在门禁前显式 `git fetch`：脚本本身不联网，也不依赖 checkout 的隐式行为（GitLab runner 默认只拉当前 ref）。缺这个引用时报「fallback base … is missing」，这是 CI 配置问题，不是文档责任问题。首批范围是 TECH、环境手册与本文的关键契约。扩大范围时同批补红/绿测试。**门禁不证明手写语义一致**：改日期或无关正文仍可能过，语义由审查验，不能据绿灯宣称「全仓零漂移」。

## 机器可判定部分强制相等

- `env-check.py --check`：工具要求从 go.mod/package.json 投影，逐字比较；`--print-contract` 打印新块，不隐式改文件。
- `doc-embed.py --check`：DDL/proto/函数摘录与源相等。生成器失败必须使调用方失败，不能只过滤特定错误文字。
- `generate-alerting-catalog.py --verify-body`：告警目录的正文与自带摘要相等，纯标准库，CI 可跑，只证明没被手改。源在同级 kubernetes 仓，源码漂移只有本地 `--check` 能发现；改了上游规则或探针，就在本仓再生成。
- `verify-context.sh`：链接、路径、索引、格式、预算等结构条件；**没有 `[LIVE-FACT]` 日期门禁**。
- `verify-deploy-parity.sh` / structcheck：清单与结构事实一致；它们仍不证明 live 应用过清单。
- `config-seed -drift`：显式读取远端配置，与 matrix 对照；属于按需环境验证，不把读凭据塞进离线 CI。

红测验门禁会拒绝，绿测验正常工作不会被误拦。不能靠删断言、放宽基线或把未知当成功让门禁变绿。取舍见 [决策记录](../decisions/implemented/2026-09-26-doc-contracts-and-runtime-evidence.md)。

**强制边界在托管平台**：本地 hook 可被 `--no-verify` 跳过。要阻止不合规合入，须在实际接收变更的远端要求 `verify-context`/`context-gate` 成功，限制绕过与直推，并审查门禁脚本和 `doc-sync/affects` 范围的改动。仓库接线不等于这些仓外保护已经配置；本轮未修改或验证远端分支保护。
