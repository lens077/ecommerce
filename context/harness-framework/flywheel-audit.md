---
name: flywheel-audit
layer: harness-framework
description: 对照腾讯《Agent 自进化飞轮》的四齿评测结论 + 方向性审计约定（触发/清单/记录）——事件驱动的进化缺周期兜底，本文补巡检侧
---

# 飞轮审计 —— 评测结论与方向性巡检

出处：腾讯技术工程《一篇讲透 Agent 自进化飞轮怎么搭：评测→记忆→落地→控制》
（2026-08，作者 yannisyang / ethanytzhou，`mp.weixin.qq.com/s/5VDN-T9K8Wr-DaQ15-I6CA`）。

[self-refinement.md](self-refinement.md) 管**单次纠错**的沉淀（文章的「同步评测」侧）；
本文管**跨会话的慢变量**（文章的「Dreaming / 方向性审计」侧）——单次看是偶发个例、
放在一起才显形的系统性短板，没有周期巡检就永远不会被发现。文章的判词：
「每一步都过了门禁，但没有人检查这一百步加在一起还朝不朝着目的地走。」

## 2026-08-26 四齿对照结论（首次系统评测）

| 齿 | 文章的坑 | 本仓对应物 | 判定 |
|---|---|---|---|
| 信号 | 弱评估器：LLM 打分有系统性偏差 | 「放行以命令真绿为准，不以模型自报为准」；LLM 评审只在 `/adversarial-review`，跨模型族 + fresh 隔离会话（生成/评估分离） | ✅ 规避 |
| 信号 | 评测成本失控 → 分层评测 | `verify-quick.sh` 轻量并行；structcheck / verify-context 按触发条件全量 | ✅ 规避 |
| 信号 | **评估器本身没人评测**（元评测集） | 判据「要验它红过吗」已内化，但注错验证是一次性手工动作，门禁改动后不重考 | ❌ 踩中 → 已修：canary，见下 |
| 记忆 | 治理 > 存储：版本/溯源/冲突/预算 | git + evolution-log 四要素；「同一约束只写一处」；AGENTS.md 14KB、TODO.md 96KB 预算门禁；INDEX 分层渐进披露 | ✅ 规避，强于文章基线 |
| 记忆 | 负空间知识（什么不能做）难捕获 | experience 的「关键陷阱」段由门禁机械强制 | ✅ 规避 |
| 记忆 | 时效衰减：过期知识没人清理 | 「过期知识比没有知识更危险」只靠读到时修，是被动的 | ⚠️ 部分踩中 → 进审计清单 #3 |
| 落地 | 版本化一切：变更日志 + 来源 + 关联验证 | evolution-log 四要素，且「没有事故就别改规则」严于文章 | ✅ 规避 |
| 落地 | **无回流则进化是一次性活动**；Dreaming 巡检跨会话模式 | 进化全部由单次事件驱动（踩坑 / 用户纠错 / 外部文章对照），无周期兜底 | ❌ 踩中 → 本文审计约定 |
| 控制 | 审核疲劳：什么都弹审 → 人不看直接过 | 硬规则 #6「授权即执行，不二次确认」（08-08 真实事故校准）；hook 一次性提醒 + fail-open；权限白名单 20→8 | ✅ 规避，同一洞察 |
| 控制 | 规则级记忆写入前必须有人确认 | self-refinement 第 ④ 步「主动提议，确认后写入」 | ✅ 规避 |
| 控制 | **对齐漂移**：步步过门禁、步步偏方向 | e3-execution 有「预期管理」意识，但无审计制度 | ❌ 踩中 → 本文审计约定 |

## 已落地的修复：门禁的元评测

`scripts/verify-context-canary.sh`——十探针：干净沙箱必须绿（防恒红）+ 九类注错
必须红且违规 tag 正确（防恒绿），接进两侧 context-gate CI 每次 push 跑。
把「它红过吗」从一次性手工验证变成持续证明——commitlint 九个月、freeze 十七天
两次恒绿事故的判据，至此有了机械载体。改 `scripts/verify-context.sh` 后本地必跑。

## Session 反传（对照 Kun Chen《Your AGENTS.md is a Neural Net》，2026-08）

映射：AGENTS.md 与 `context/` 分层是权重（按注入成本分层的权重矩阵）；预算 = 模型
大小（本仓已是机械门禁）；每次会话是 forward pass；backward pass 本仓原本只有
[self-refinement.md](self-refinement.md) 一路——**会话内被当场识别**的纠错。没被
当场抓住的 loss（重发现、违反了没被指出、规则本身错了、教了但没沉淀）只存在于
transcript 里：`~/.claude/projects/<仓slug>/`、`~/.codex/sessions/`、`~/.dsh/sessions/`。
审计清单第 6 项把这路输入补上。

反传纪律（沿用文章门槛，与本仓既有规则合并）：

- **机械蒸馏在前**：只抽用户文本消息，先剔除以 user 角色注入的 skill 全文
  （08-26 首轮实测的最大噪音源），蒸馏阶段不跑模型；
- **批量门槛**：立新规则要求 gap 出现在 ≥2 个**独立**会话（同一事件的连发消息不算两次）；
  单次事故不立新规，但**已发生事故的漏沉淀要补**——那是执行既有 self-refinement，不是立新规；
- **小步**：每轮 ≤5 条 edit，每条带 transcript 引用，并与代码/文档交叉核实后才算证据；
- **落点分层**：按 [knowledge-layering.md](knowledge-layering.md) 判层，不往 AGENTS.md 堆规则本体；
- **人工裁决后才落笔**。

## 评估过、刻意不建的（重新评估条件写明，别凭直觉补齐）

| 文章机制 | 不建的理由 | 重新评估条件 |
|---|---|---|
| `.learnings/` 临时记录层 + 三层晋升 | 单人仓会话内即可判定模式性，一步写进 `context/`；临时层会成为第二真相源 | 多 agent 并发沉淀，或「忘记沉淀」实际发生 ≥2 次 |
| 记忆 TTL / 使用频率衰减 | 几十个文件量级下 INDEX 分层检索足够；衰减机制自身要维护 | `context/` 文件数破百，或审计连续两次抓到过期知识误导执行 |
| harness 改动灰度发布 | 影响面 = 单人，`git revert` 即回滚 | 团队规模 >1 |
| LLM-as-Judge 自动打分 | 评测可信度 > 系统复杂度；规则校验 + 异构双审已覆盖 | 出现规则判不了、人工又审不过来的开放式产出 |
| backpass 工具本体（kunchenguid/backpass） | 方法论按「Session 反传」节采纳；工具不接：提案只训单一 AGENTS.md，与 knowledge-layering 分层落点冲突；采集不覆盖 DSH（`~/.dsh/sessions/`）；发布仅数天（v0.1.4），apply 尚有作者自认的未门控写入偏差 | 支持自定义采集目录与输出落点、apply 门控补齐，或主力 harness 进其覆盖列表 |

## 方向性审计约定

**触发**：每逢「对照外部方法论复盘」顺带做一次；没有外部触发时，距上次不超过 6 周。
这是软约定——单人仓不为它建门禁（freeze 教训：没人喂数据的门禁比没有更坏），
靠下方记录表的日期兜底：读到本文发现超期，就是该做的信号。

**清单**（逐项要有实测证据，不做口头自查）：

1. **门禁还红吗**——canary 绿由 CI 自动证明；structcheck 与 lint-baseline 各注错一次实测
2. **方向性指标**——AGENTS.md / TODO.md 字节趋势、`context/` 文件数与新增分布、
   `scripts/harness-scars.sh` 面板的存量债务（只许收敛不许新增）
3. **规则 ↔ 实况对齐**——抽 2~3 条文档里的可执行命令实测「照做会不会失败」（08-24 审计的做法）
4. **Skill 复评**——`docs/agents/skills.md` 逐行核对：装没装、还用不用、指引是否仍与现实相符
5. **同构事故检测**——evolution-log 近期条目里同一失效模式是否第三次出现；是 → 规则没治本，升级为机械约束
6. **Session 反传**——按「Session 反传」节的纪律，从 transcript 离线挖一轮没被当场抓住的 loss（漏沉淀/重发现/规则被违反或本身错了）

## 审计记录（倒序）

| 日期 | 触发 | 主要发现 | 产出 |
|---|---|---|---|
| 2026-08-27 | 排查 Antigravity 反复弹登录（清单 #3 时效衰减实例） | `read_page`/`web_search` 走 modsearch 引擎链，Firecrawl keyless 撞 IP 日限冷却后落到 `agy`，触发 Google OAuth；`skills.md` 的 agent-reach「运行时缺」与 08-26 复评备注双双过期（其 web 路径当日被四个会话高频正常调用） | 配 Firecrawl 免费 key + `state clear`（仓外 `~/.modsearch/`）；删 skills.md 的 agent-reach 行；本表与上文复评段同步纠偏 |
| 2026-08-26 | 清单 #1「门禁还红吗」红测批次 | commit-msg 钩子因根三件套删除**恒红**（合法消息也拒）；lint-baseline 的 vp-lint 采集器因上游改画框格式**恒绿**（注错不拦）；structcheck 注错正常变红。方向性指标：同构漂移基线 10 条、lint 基线 0、部署例外 0、`context/` 49 文件 | commitlint 整链迁入 frontend；`run_vp-lint` 重写 + 失聪自检（均见 evolution-log 同日条目）；DSH transcript 蒸馏未完成，留待下轮 |
| 2026-08-26 | 对照 Kun Chen《Your AGENTS.md is a Neural Net》，首轮 session 反传 | 近 14 天 341 条用户消息蒸馏出 246 条人话（最大噪音源 = 以 user 角色注入的 skill 全文）；抓到 1 条漏沉淀（登出自动登回教训只在代码注释与 TODO）+ 1 条陈旧权重（consumer INDEX「token 存 localStorage」）；2 条候选被批量门槛正确拒绝 | `consumer/experience/logout-auto-relogin.md`；INDEX 修剪；「Session 反传」节 + 清单 #6；backpass 工具评估为缓用 |
| 2026-08-26 | 对照《Agent 自进化飞轮》评测（本文建立） | 门禁注错验证是一次性动作，TODO 预算门禁红路径从未被考；进化无周期兜底；agent-reach 指引与实测有出入 | canary + CI 接线；本审计约定；skills.md 复评备注 |
| 2026-08-24 | （追认）环境漂移全面审计 | 两条照做即失败的命令；freeze 恒绿假门禁；影子服务切流风险 | 删 freeze 整套；规则与实况重对齐（见 evolution-log） |
| 2026-08-21 | （追认）对照腾讯《Multi-Agent 降本》复盘 | TODO.md 膨胀至 199KB；看板 MCP 常驻；锚点串行噪音 | 六处 token 治理（见 evolution-log） |
