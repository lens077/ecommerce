---
name: evolution-log
layer: harness-framework
description: harness 本身（硬规则/门禁/Agent 约束）每次改动的原因与触发它的具体事故，防止后人把改对的东西改回去
---

# Harness 演进日志

## 这份日志解决什么

`context/` 记录**规则是什么**，`TODO.md` 记录**做了什么与完成度**（`PROGRESS.md`
已于 2026-08-13 废止归档）。两者都不记录**「这条规则为什么是现在这个样子」**。

缺了这一层的后果很具体：一条规则被改对之后，半年后另一个人（或另一个 AI 会话）
看到它觉得"太松了"或"太啰嗦"，凭直觉改回去，于是当初那次事故会原样重演一遍。
规则的**理由**比规则本身更难重建——规则可以从代码里读出来，理由只存在于当时的对话里。

所以：**凡是改动 harness 本身的东西，都要在这里追加一条。** 判据是"改的是不是约束 AI/团队
行为的机制"：

| 改了什么 | 要不要记 |
|---|---|
| `AGENTS.md` 硬规则、`context/` 里的团队约束 | ✅ 必须 |
| 门禁脚本、structcheck 检查项、基线机制、CI 门禁 | ✅ 必须 |
| 业务代码、部署清单、文档搬家 | ❌ 不记（那是 `TODO.md` 的事） |
| 一次性的调试细节 | ❌ 不记（见 [self-refinement.md](self-refinement.md)） |

## 写法

每条四要素，缺一不可——**尤其不能省「触发事故」**，那是这份日志唯一不可替代的信息：

```
### YYYY-MM-DD 一句话标题
- **改了什么**：改动前 → 改动后
- **为什么**：当时的推理
- **触发事故**：具体是什么事让我们发现旧写法不对（没有事故就别改规则）
- **怎么验证的**：用什么手段确认新写法真的生效
```

倒序排列，最新的在最上面。

> ⚠️ 排序有存量破损：2026-08-20 之后的几条历史条目掉在了文件末尾，没有按倒序归位。
> 新增条目请仍然加在本行下方，不要跟着错。

---

### 2026-08-28 跨服务节点均衡与 Helm 缓存纳入 structcheck

- **改了什么**：25 份 ecommerce Deployment 统一增加 suite-wide `topologySpreadConstraints`；`backend/structcheck` 要求 Pod template 带共同的 `app.kubernetes.io/part-of=ecommerce` 标签，约束必须使用 hostname、`maxSkew=1`、`ScheduleAnyway` 和 `Honor` policies，同时禁止把共同标签加入已有 Deployment 的 immutable selector。测试还逐个读取 10 个子 chart 的 `library-0.1.0.tgz`，确认实际消费的缓存模板包含同一约束。
- **为什么**：10 个 API 都是单副本。如果每个 Deployment 只按自己的 `app` 做 spread，scheduler 看不到其他服务，无法平衡整套工作负载；共同标签才能让不同服务进入同一个计数集合。选择软约束是为了优先压低 skew，同时避免节点资源不足时把发布永久卡住。
- **触发事故**：live 审计发现 ecommerce 的 17 个 ReplicaSet Pod 分布为 node101 `12`、node102 `4`、node103 `1`，虽无业务 `nodeSelector`，scheduler 也不会主动重平衡历史 Pod；此前 Tetragon DaemonSet 又曾被手工 `nodeSelector=node103` 限成 `1/3`，造成另外两个节点的运行时审计盲区。本轮第一次执行 `helm dependency update` 还在只更新 3 个子 chart 后超时，证明只检查 library 源模板仍会放过部分陈旧 tgz。
- **怎么验证的**：`go test -count=1 ./structcheck/...` 通过；10 个 Helm Deployment 渲染后均包含共同标签和约束；22 份 backend、3 份 frontend 清单以及 Helm 全量资源均通过 Kubernetes server dry-run。未获本轮 dev apply 授权，因此这些验证只证明发布候选有效，live 落点仍待受控 rollout 后复核。

### 2026-08-28 TCR Cosign 兼容性只做单服务硬失败探测

- **改了什么**：tag 发布仅对 `user` 服务在 TCR 重复 index 签名与两个平台 SPDX attestation，并立即从 TCR 回验；不加兼容性 fallback，不在探测成功前扩展到其他服务或 Kyverno。
- **为什么**：TCR 个人版没有对 Cosign OCI referrers 的官方兼容性承诺。一次性给所有服务签名会放大失败成本，软失败又会产生「看起来已双签」的错误结论。
- **触发事故**：`1.5.3` 验收确认 GHCR 与 TCR 的 index 及 child digest 完全相同，但 digest 相同只能证明镜像内容一致，不能证明 TCR 能保存和回读 Cosign signature/attestation 工件。
- **怎么验证的**：tag `1.5.4` 的 22 个 jobs 全绿；独立从 TCR 回验 `user` index 得到 1 个有效签名，amd64/arm64 的 SPDX attestation 均通过 Fulcio CA、GitHub Actions OIDC workflow identity、透明日志与 Cosign claims 验证，三个 TCR bundle 均为 Sigstore bundle v0.3。结论只覆盖本次实际 digest，不升级为腾讯云官方兼容承诺。

### 2026-08-28 GHCR keyless 签名绑定 workflow identity

- **改了什么**：Cosign 3.1.3 固定版本并校验官方 checksums；tag 发布对多架构 index digest 做 keyless 签名，对 amd64/arm64 child digest 分别附加 SPDX attestation，并以 GitHub Actions OIDC issuer 与当前 workflow identity 在同一 job 回验。调用方与 reusable workflow 只增加必要的 `id-token: write`。
- **为什么**：签名存在不等于可信，验签必须约束签发者与具体 workflow；平台 SBOM 也必须附到对应 child digest，不能把两份互异的平台内容都模糊附到 index。
- **触发事故**：`1.5.2` 首次远端 SBOM 验收证明 OCI index 除两个平台外还包含 `unknown/unknown` provenance manifest；仅按 tag 或只对 index 附一份 SBOM，会失去平台与内容的确定关联。既有文档还要求 Cosign 版本不低于修复 legacy bundle 绕过漏洞的 3.1.3。
- **怎么验证的**：tag `1.5.3` 的 22 个 jobs 与 10 个签名 artifact 全绿；抽查 `user` index 签名和两个 child digest 的 SPDX attestation 均通过 Fulcio CA、透明日志与 claims 回验，证书 SAN 精确指向 `service-ci.yml@refs/tags/1.5.3`，bundle 为 Sigstore v0.3。

### 2026-08-28 工作负载身份与 token 关闭纳入 structcheck

- **改了什么**：`backend/structcheck` 新增工作负载身份棘轮，要求 10 个服务 dev/prod、frontend、consumer-next dev、relay/indexer 与 search reindex Job 使用预期 ServiceAccount，显式关闭 token automount 与 service links；同时检查 canonical 零信任清单包含全部 SA、恰有一份 CNP，且不引入任何 Role/RoleBinding。
- **为什么**：业务不调用 Kubernetes API，零 RBAC 绑定和不挂 token 才是最小权限。该约束散落在裸清单、Helm library、工具 Job 与两个 frontend 中，只靠人工审阅会再次漂移。
- **触发事故**：live 审计发现 gateway、frontend 与 10 个 API 全部使用 default SA 并挂载 3607 秒 projected token；第一轮修复后又发现 search reindex Job 虽关闭 automount，仍未指定独立 SA，而且并发开发的 consumer-next 仍使用 default SA。Helm 子 chart 因缓存 library tgz 也没有自动继承共享模板改动。
- **怎么验证的**：`go test -count=1 ./structcheck/...`、backend build/vet/test-short、Helm lint/render 与完整 server-side dry-run 全绿；dev 集群滚动后，受管的 15 个 Deployment 均使用独立 SA 且无 `kube-api-access-*`，consumer-next 两副本也完成最小 CNP 与 SSR/ISR 验收。

### 2026-08-28 tag SBOM 按多架构 index digest 分平台生成

- **改了什么**：在 Buildx 推送完成后读取不可变 OCI index digest，Syft 1.51.1 分别为 `linux/amd64`、`linux/arm64` 生成 SPDX 2.3；连同 index digest 清单上传为按服务隔离的 Actions artifact。仅 tag 发布运行，不签名、不发布 attestation。
- **为什么**：对可变 tag 生成 SBOM 无法证明对应哪个制品；对多架构 index 只扫描 runner 默认平台，又会把单平台内容误称为整个发布物。必须同时固定 index digest 和平台。
- **触发事故**：本地 TCR PoC 镜像实际只有 `linux/arm64` 加一个 `unknown/unknown` provenance manifest；若不显式指定平台，Syft 仍可产出一份看似正常的 355-package SBOM，容易被误判为多架构发布物已覆盖。
- **怎么验证的**：指定 `linux/arm64` 生成 SPDX 成功；指定不存在的 `linux/amd64` 返回 1，证明缺平台会硬失败。workflow YAML、shellcheck、zizmor 与完整 PR 供应链门禁均通过；真正双架构产物仍须由下一次远端 tag 运行验收。

### 2026-08-28 PR 供应链扫描改为提交范围与存量棘轮

- **改了什么**：新增独立 PR 门禁，Gitleaks 只扫描 base commit 到 HEAD；zizmor 与 Trivy fs/config 全仓扫描，但只阻断基线外新增的中高风险告警。工具版本与发布物摘要固定，基线只减不增。
- **为什么**：首次接入必须既能阻断新增风险，又不能因既有技术债让所有 PR 永久失败；工作树密钥扫描还会读取被 `.gitignore` 排除的本地凭据副本，不等于 PR 引入。
- **触发事故**：首次真实扫描得到 Gitleaks 107 条、zizmor 43 个定位和 Trivy 40 条 HIGH；直接硬门禁会恒红。随后并行新增的两个前端 Deployment 又产生 5 条基线外 HIGH，证明门禁必须区分存量与新增，且不能用扩基线掩盖真实回归。
- **怎么验证的**：临时 clone 注入随机格式 AWS 密钥和未钉 SHA 的 Action，Gitleaks、zizmor 均返回 1；Trivy 对新增 Deployment HIGH 返回 1。补齐 Pod/Container `securityContext` 后，`./scripts/supply-chain-pr.sh` 三项返回 0，Trivy 存量由 40 条降为 34 条。

### 2026-08-26 链接门禁扩围至设计文档与根双档,canary 补第 11 探针

- **改了什么**：`verify-context.sh` 的 [DEAD-LINK] 扫描源由「AGENTS.md + context/」
  扩为「AGENTS.md + README.md + STACK.md + context/ + docs/design/」（其余五项检查
  范围不变,docs/design 无 frontmatter/INDEX 约定）;canary 沙箱同步纳入三个新扫描源
  与其链接目标桩,新增红探针 `dead-link-design`（10 → 11 探针）;AGENTS.md 锚点
  注释同步。
- **为什么**：mall 宪法原则 I「引用不存在的文档即 CI 失败」在本仓机械化;
  链接检查是纯存在性判定,扩围零误报成本,而 docs/design 恰是矛盾最密的区域。
- **触发事故**：2026-08-26 一天内三轮死链全靠临时 python 脚本抓到——
  README/design README 引用已不存在的 `config-center/design.md`、README 的
  `gateway/README.md` 与 `.freeze/README.md`（两处 08-24 删除时漏清）、我自己
  刚写错的 `../../order/checkout.md` 相对路径;门禁不覆盖的区域,烂的速度比审计快。
  用户随后明确要求「docs/design 添加门禁」。
- **怎么验证的**：扩围后门禁对当前树全绿（存量当日刚清零,恰好接得上硬门禁）;
  canary 11 探针双 locale 全过,其中新探针实测:沙箱 design README 注入坏链 →
  rc=1 且 [DEAD-LINK] tag 正确;CI 两侧无需改动（context-gate 本就每 push 跑）。

### 2026-08-26 共用能力抽取:portable-harness 索引 + 蒸馏器固化 + lens077 根 symlink

- **改了什么**：新增 `scripts/backpass-distill.sh`（Session 反传蒸馏器固化版:三存储
  Claude Code/Codex/**DSH**（zstd 流尽力解析）、剔 skill 注入噪音、(sid,msg) 去重,
  接受任意仓路径参数）;新增 `context/harness-framework/portable-harness.md`
  （可复用能力清单、新项目五步采纳、根 symlink 登记表、不搬清单）;
  lens077 根新增两个相对 symlink:`HARNESS.md`、`backpass-distill.sh`。
- **为什么**：用户要求把可共用能力抽到工作区根让后续项目受益。分发模式沿用
  2026-08-18 判例——根外裸副本重装即丢,正文只住仓内受门禁,根外只放相对链接;
  蒸馏器固化同时偿清审计记录挂的「DSH transcript 蒸馏留待下轮」。
- **触发事故**：第 4 轮任务（瘦身+抽取）执行中被宪法修复任务打断,用户完成度
  质询时回扫发现抽取两件套仅有方案未落地;且首轮反传的蒸馏管线只存在于 /tmp,
  会话结束即失忆——正是「Harness 层改动必须持久化到文件」要求的反面。
- **怎么验证的**：shellcheck 仅余 SC2044 已注释说明;双仓实测
  （ecommerce 近 14 天 1492→647 条/134 会话;lens077 近 3 天 1388→368 条,
  其中 **DSH 源 342 条**提取成功）;经根 symlink 穿透执行同样成功;
  `readlink` 确认两链接均为相对目标（迁移可存活）;两级 INDEX 登记后
  `verify-context.sh` 与 canary 全绿（见本日门禁记录）。

### 2026-08-26 canary 修 locale 依赖:变量紧邻全角字符必须加花括号

- **改了什么**：`verify-context-canary.sh` 第 138 行 `$workdir` 改 `${workdir}`
  并留原因注释——它后面紧跟全角「）」。
- **为什么**：bash 3.2 在 UTF-8 locale 下会把紧邻多字节字符的首字节并进变量名,
  `set -u` 下报 `workdir?: unbound variable`;C locale 则正常。同一脚本因调用方
  环境不同而间歇性红,比恒红更难排查。约定:**变量紧邻非 ASCII 字符一律加花括号**。
- **触发事故**：2026-08-26 收尾复跑 canary 首次撞上该错(此前多次全绿——调用方
  locale 恰好宽松);`LC_ALL=C` 绿、`LC_ALL=en_US.UTF-8` 红,复现清晰。
  全仓扫描 `$var` 紧邻非 ASCII 仅此一处真实命中。
- **怎么验证的**：修复后 `LC_ALL=en_US.UTF-8` 与 `LC_ALL=C` 双跑 canary 均十探针
  全过;`verify-context.sh` 复跑绿。

### 2026-08-26 lint-baseline 的 vp-lint 采集器适配新格式并加失聪自检

- **改了什么**：`run_vp-lint` 解析从旧单行格式(`path:line:col: …`)改为 miette 画框
  格式(消息行 `! plugin(rule): …` 与其后定位行 `,-[path:line:col]` 配对),路径补
  `frontend/` 前缀;新增**失聪自检**——vp 汇总行报 N>0 条而解析出 0 条时,产出
  `PARSE-FAILURE` 哨兵行强制 check 变红;脚本头陷阱清单 3 条 → 4 条。
- **为什么**：采集正则与上游输出格式耦合,格式一变就「解析 0 条 = 恒绿」,与
  freeze/commitlint 同款静默失效。哨兵行把「脱钩」从静默态变成阻断态——
  下次格式再漂移会当场红,而不是等下一次审计撞见。
- **触发事故**：2026-08-26 按 flywheel-audit 清单 #1 红测:向 `main.tsx` 注入
  `debugger` 后 `CHECKERS=vp-lint scripts/lint-baseline.sh check` 返回 rc=0
  「无新增」,而 `vp lint` 本身明确报 `Found 1 warning`——vite-plus 某次升级把
  输出改成画框格式后采集器已恒绿了未知时长(08-08 建立时同款注错实测拦得住)。
  这是本日审计抓到的第三处「建立后无人再考」,同构事故第三次出现,
  按清单 #5 升级为机械约束(失聪自检)。
- **怎么验证的**：三态实测——①注错 → rc=1 且 finding 行正确
  (`frontend/apps/consumer/src/main.tsx` + no-debugger);②还原 → rc=0;
  ③用 perl 临时打断解析正则模拟下一次格式漂移 → rc=1 且出 PARSE-FAILURE 哨兵行;
  全还原后默认全链(go-vet+vp-lint)rc=0。shellcheck 仅余 2 条 SC2329 info
  (函数经 `"run_$1"` 间接调用的既有误报,非本次引入)。

### 2026-08-26 commitlint 整链迁入 frontend workspace,钩子改直调二进制

- **改了什么**：根目录 `package.json`/`pnpm-lock.yaml`/`commitlint.config.mjs` 三件套
  删除（用户裁决保留删除）;规则文件迁为 `frontend/commitlint.config.mjs`（顺手修掉
  头注释里陈旧的 `.husky` 路径）,`@commitlint/cli` + `config-conventional` 进
  frontend devDependencies;`frontend/.vite-hooks/commit-msg` 由 `pnpm exec commitlint`
  改为直调 `commitlint --config "$(dirname "$0")/../commitlint.config.mjs" --edit "$1"`
  （`_/h` 本就把 `frontend/node_modules/.bin` 注入 PATH）;AGENTS.md 硬规则 3 与
  反直觉约定、runbook §6 四处、git-commit.md 三节（真相源路径/工具链表/127 读法,
  corepack 节按新依赖链收窄）、TODO 提交规范行同步改写。
- **为什么**：钩子旧实现依赖 cwd 向上解析到根 workspace;根三件套删除后
  `pnpm exec` 恒红,所有提交被阻断。迁入 frontend 保留机械校验
  （「能判定的约束变成脚本」）,直调二进制还消掉了 pnpm 这层曾出过
  `--no` 事故的间接层;根目录从此无 Node workspace。
- **触发事故**：2026-08-26 用户在并行会话清理根目录三件套（经询问确认保留删除）;
  按「门禁还红吗」清单红测钩子,实测**恒红**:合法消息 `feat(cart): …` 也退出 1,
  报 `ERR_PNPM_RECURSIVE_EXEC_NO_PACKAGE`——与 2025-11 起九个月恒绿事故互为镜像,
  这次是恒红,同样由「注错+注对双向实测」暴露。
- **怎么验证的**：迁移后经真实分发链 `sh frontend/.vite-hooks/_/commit-msg` 三探针:
  坏消息 rc=1、emoji 与 type 错配（`feat: :bug:`）rc=1、合法消息 rc=0;
  `pnpm install` 在 frontend 实装 21.2.2 双包;全仓 grep 确认无残留的
  根路径 `commitlint.config.mjs` 引用;`scripts/verify-context.sh` 复跑全绿。

### 2026-08-26 审计新增「Session 反传」输入（对照 Kun Chen《Your AGENTS.md is a Neural Net》）

- **改了什么**：`flywheel-audit.md` 新增「Session 反传」节（机械蒸馏在前/批量门槛/
  小步带引用/落点分层/人工裁决）与审计清单第 6 项,「评估过不建」表新增 backpass
  工具行;`self-refinement.md` 指针句补「打捞没被当场抓住的教训」;首轮反传的
  梯度产出:新增 `consumer/experience/logout-auto-relogin.md`,修剪 consumer INDEX
  陈旧行「token 存 localStorage」（实况:Web httpOnly cookie / 桌面内存,
  `store/users.test.ts` 锁不变量）。
- **为什么**：文章把项目记忆文件当神经网络训——预算/小步/防遗忘本仓已机械化
  （14KB 门禁、「没有事故就别改规则」、evolution-log）,唯独 loss 只收
  「会话内被当场识别」一路;transcript（本仓 Claude Code 51 个/101MB、Codex 30 个、
  DSH `~/.dsh/sessions/`）从未进过沉淀闭环,离线批量反传正是缺的那路输入。
  工具本体缓用:提案只训单一 AGENTS.md 与本仓分层冲突、采集不覆盖 DSH、
  apply 门控未齐。
- **触发事故**：首轮人工反传实测（近 14 天 341 条用户消息 → 剔除 5 组以 user 角色
  注入的 skill 全文 → 246 条人话）即捞到一条漏网:08-19 会话里用户完整讲解的
  「登出后自己登回去（漏 `stopRenew()`）」教训,代码注释与 TODO 都留痕,
  context/ 没有检索入口——self-refinement 第 ④ 步在那个会话没发生。
  同轮另有两条候选被批量门槛正确拒绝（同一上午重复指令属同一事件;
  另一条属别的项目）,证明门槛在拒噪而非空转。
- **怎么验证的**：候选逐条与代码/TODO/context 三处交叉核实
  （`AppBar.tsx:148` 注释、`TODO.md` 08-19 条、`grep -rn stopRenew context/` 为空;
  INDEX 陈旧行以 `AuthProvider.tsx:41/94/112` 与 `users.test.ts` 实测反证）;
  改完 `scripts/verify-context.sh` 全绿、`scripts/verify-context-canary.sh` 十探针全绿。

### 2026-08-26 门禁接上元评测 canary,方向性审计成文（对照《Agent 自进化飞轮》）

- **改了什么**：新增 `scripts/verify-context-canary.sh`（十探针:干净沙箱必须绿 +
  九类注错必须红且违规 tag 正确;沙箱 = 真身 `context/`/AGENTS.md/TODO.md +
  仓外链接目标动态打桩 + 临时 git 仓,桩清单不手抄,漏了由探针 0 当场暴露）,
  接进两侧 context-gate CI 在 `verify-context.sh` 之后每次 push 跑;新增
  `context/harness-framework/flywheel-audit.md`（四齿对照评测结论、「评估过不建」
  清单、方向性审计的触发/清单/记录）;AGENTS.md 锚点区与 runbook §0.5 各补一行;

- **为什么**：对照腾讯《一篇讲透 Agent 自进化飞轮怎么搭:评测→记忆→落地→控制》
  逐条评测本仓 harness:单次事件驱动的环节（纠错沉淀/门禁建立/授权分级）已规避
  文章多数坑,踩中的集中在**周期兜底缺失**——评估器自身无人复评、跨会话慢变量
  无人巡检。文章的「元评测集」方法论恰好给已内化判据「要验它红过吗」一个机械载体;
  「方向性审计」补的是同步门禁天然看不见的对齐漂移。
- **触发事故**：本次评测核对 git 历史发现:`verify-context.sh` 的九类注错验证只在
  2026-08-18 建立时手工跑过,此后脚本改过两次（gitignore 检测、TODO 预算）,其中
  08-21 的 TODO 预算门禁只验证过绿路径,**红路径从未被考过**——与 commitlint
  九个月、freeze 十七天同构的「建立后再无人考它」状态第三次出现,这次在兑现前拦下。
- **怎么验证的**：canary 本地实跑十探针全过（约 55s,耗时主体是被测门禁的 10 次
  真实运行）;红路径实测——把门禁的 `budget=14000` 临时削成 `99999999` 后 canary
  退出 1 并精确报 `budget-agents: 期望 rc=1,实得 rc=0`,还原后 `git diff` 为空;
  改完 `scripts/verify-context.sh` 全绿（新文件的 INDEX/frontmatter/链接均过）,
  AGENTS.md 预算余量经门禁复核。

### 2026-08-24 删除整套 Frozen Nodes 冻结验收集机制

- **改了什么**：删除 `.freeze/`、`scripts/freeze.sh`、`scripts/verify-freeze.sh`、
  `.github/workflows/freeze-check.yml`、`.gitlab-ci.yml` 的 `freeze-check` job、
  `.github/CODEOWNERS`（四条规则全是 freeze 相关，删完只剩注释，整份删除）；
  AGENTS.md 锚点块去掉 `verify-freeze.sh --all` 一行，并改口称
  `verify-context.sh` 才是 main 上唯一必需的 CI 检查。
- **为什么**：这道门禁从建立起就没有数据。`.freeze/` 里只有 `README.md`，一组冻结集都没有，
  于是 `verify-freeze.sh --all` 无条件返回 rc=0。机制、两侧 CI 接线、CODEOWNERS 保护全都正确，
  唯独缺「考题」本身——而 AGENTS.md 却把它写成 main 上唯一必需的检查。
  留着一道恒绿的门禁比没有门禁更坏：它提供虚假的安全感，让人以为验收集受保护。
  要么补一组真实冻结集，要么整套删掉；用户选了后者。
- **触发事故**：2026-08-24 的环境漂移审计中直接执行 `scripts/verify-freeze.sh --all`，
  输出「`.freeze/` 下暂无冻结集,跳过(OK)」且 rc=0。回查 git 历史，该机制 2026-08-07 建立，
  **十七天里从未冻结过任何一组测试**。同一轮审计还发现另一个同构问题：
  `scripts/argocd-devwindow.sh` 守护的 ArgoCD Application 根本不存在。
  两者是同一种失效——**门禁的存在性被当成了门禁的有效性**。
- **怎么验证的**：删除后 `scripts/verify-context.sh` 仍绿（rc=0）、
  `go test ./structcheck/...` 仍绿；`grep -rn 'freeze' --include='*.yml' --include='*.sh'`
  在 `.github/`、`scripts/`、`.gitlab-ci.yml` 中零命中；`context/team/runbook.md` 与
  `graph-engineering.md` 的冻结小节同步删除，链接门禁未报断链。
  判定这类失效的通用方法已写进 [self-refinement.md](self-refinement.md) 的「教训存档」：
  **要验的不是「门禁装了吗」，而是「它红过吗」。**

### 2026-08-24 规则与真实环境重新对齐（control-tower 接管、GitOps 断线）

- **改了什么**：AGENTS.md 硬规则 4 补明 Config Center 由同级仓 control-tower 承载；
  反直觉约定新增两条（网关与配置中心都不在本仓、GitOps 当前是断的），删除旧的
  okteto/selfHeal 无条件表述；`.service-matrix.yaml` 更正 helm/deploy 两条部署路径的角色、
  redis 回滚路径、Kafka 残留、旧网关目录、不存在的 `192.168.3.202`，并删掉与自身
  `config_validation` 段自相矛盾的 known_gap；`scripts/argocd-devwindow.sh` 从
  「AppProject 不存在就 die」改为「零 Application 就诚实空转 exit 0」；
  `argocd-app.yml` 关掉 `automated` 并加顶部告警；删除本仓 `gateway/` 目录与 `gateway` 远端；
  `.claude/settings.local.json` 权限白名单 20 → 8 条；`skills/README.md` 并入
  `docs/agents/skills.md`；`frontend.yml` 删掉两个必红的构建 job。
- **为什么**：规则文件是 AI 每轮的行为基线，其中的过期事实不是「文档陈旧」而是
  **主动误导**——AI 会照着不存在的地址、不存在的存储、不存在的门禁去执行。
  尤其 `runbook.md` 曾写「凭据只在 Consul KV」，与 AGENTS.md 硬规则 4 直接冲突，
  而 runbook 是 agent 最先读的那份。
- **触发事故**：2026-08-24 全面审计发现两条**照做就会失败**的命令：
  ① `scripts/argocd-devwindow.sh off`（okteto 内环的第一条命令）因 AppProject 不存在
  直接 `exit 1`，照文档做的人卡在入口还以为是自己环境坏了；
  ② `node-graceful-shutdown.md` 的验证循环写 `for node in node1 node2`，
  而真实节点是 node101/102/103，命令必然报错。
  同时发现 `helm/values.yaml` 钉着 `1.4.0` 而集群实跑 `:dev`，
  且 chart 渲染出的资源名与标签方案与集群完全不同——若照原计划 apply
  `argocd-app.yml`（`prune: true` + `selfHeal: true`），会并排起一套 1.4.0 影子服务，
  且因 chart 里 `CONSUL_ENABLED=true`，影子 pod 会注册进 Consul 并被
  control-tower 网关解析到，**把真实流量导过去**。这是本轮唯一被拦下的线上事故风险。
- **怎么验证的**：所有更正都以实测为准而非文档推断——`kubectl get applications -A`
  返回 No resources found、`kubectl get ns redis` 返回 NotFound、全集群 grep
  strimzi/kafka 零命中、逐个 Pod 核对 `config-center` ns 跑的是
  `control-tower-config:sha-a27f90a`。改完 `scripts/verify-context.sh` 绿、
  `go test ./structcheck/...` 绿、`shellcheck scripts/argocd-devwindow.sh` 无告警。
  影子服务风险用 `helm template` 渲染后与 `kubectl get deploy/svc -o json` 逐项比对确认。
  完整实测记录见 `.scratch/env-resync/ground-truth.md`。

### 2026-08-18 lint-baseline 采集管道滤掉 go 模块下载噪音

- **改了什么**：`run_go-vet` 采集管道在归一化前加
  `grep -vE '^go: (downloading|extracting|finding) '`；脚本头陷阱清单 2 条 → 3 条。
- **为什么**：采集必须 `2>&1` 合流（vet 诊断本来就走 stderr），但 go 的模块下载进度
  也走 stderr——两种输出无法按流向区分，只能按内容滤。`go: downloading/extracting/finding`
  行是模块机制的机械噪音，永远不是 vet 诊断（诊断形态是 `file:line:col:`、`# pkg` 或 `vet:`）。
- **触发事故**：Backend CI 自 08-13 起连续两轮全红（08-13 merchant「新增 11 条」/user
  「新增 10 条」，08-18 十服务全红、cart「新增 14 条」），逐条看全是 `go: downloading …`。
  本机模块缓存热**从不复现**，CI runner 冷缓存**必现**；且 test job 红连带堵死
  update-manifests 的 GitOps 回写——一个幻影告警把镜像发布链路挂了 5 天，
  期间 main 上的后端改动（含 protovalidate 接线）从未构建成镜像。
- **怎么验证的**：合成输入直喂采集管道——downloading/extracting 行被滤掉、
  真 vet 行（`…cart.go:10:2: unreachable code`）正常归一化存活；
  `CHECKERS=go-vet scripts/lint-baseline.sh check` 本地绿。CI 侧经用户授权
  workflow_dispatch(services=cart) 在冷缓存 runner 复验：test 2m49s 绿、镜像
  sha-b482be9 构建推送、manifest 回写全链路通（run 32153791376）——修复前同环境必红。
  注意 `scripts/` 不在 backend.yml 触发路径里，改门禁脚本不会自动触发 Backend CI。

### 2026-08-18 根外 AGENTS.md 从手工同步副本改为相对 symlink

- **改了什么**：`~/lens077/AGENTS.md` 由「仓内文件加 `ecommerce/` 链接前缀的生成副本」改为
  指向 `ecommerce/AGENTS.md` 的**相对** symlink。原「改仓内必须手工同步根外、验证靠
  去前缀逐字比对」的流程作废（2026-08-12 条目所记的同步方法随之退役，该条目按惯例不改）。
- **为什么**：手工同步副本有两个死法——改了忘同步（静默漂移、无验证器兜底，与 PROGRESS.md
  双文档纪律同款死因）、迁移/重装时整个丢失（它不在任何 git 仓里）。symlink 把两个一起消掉：
  内容永远一致，且**相对**目标保证整个工作区挪路径后链接依然有效。deepseek-harness 仓内
  `CLAUDE.md -> AGENTS.md` 是同款做法。**代价（已接受）**：放弃链接目标的 `ecommerce/`
  前缀改写——从 ~/lens077 读时 markdown 链接需自行补前缀；影响有限，因为正文内联代码形式
  的路径（`context/team/...`）本来就从未加过前缀，读者/agent 本来就要做这层推断。
- **触发事故**：2026-08-14 机器重装恢复后根外副本整个消失，直到 08-18 参照 deepseek-harness
  增强 harness 时才被发现——丢了 4 天没有任何机制报警。先恢复成生成副本，用户随即拍板改 symlink。
- **怎么验证的**：`readlink` 确认目标是相对路径 `ecommerce/AGENTS.md`（正是 08-14 那次
  `~/github/lens077` → `~/lens077` 迁移能存活的形态）；穿透读取与仓内文件 `diff` 为空；
  确认 `~/lens077/` 下无 `context/` 同名目录，裸相对链接不会静默解析到错误文件。

### 2026-08-18 context/ 知识库自身接上结构门禁（参照 deepseek-harness）

- **改了什么**：无 → `scripts/verify-context.sh` 六项检查（AGENTS.md + context/ 的链接可达性、
  INDEX 覆盖孤儿检测、frontmatter 与 name/layer/module 路径一致性、experience 的
  「症状/关键陷阱」硬要求、evolution-log 四要素、AGENTS.md ≤14000 字节预算）+
  `scripts/context-format-baseline.txt` 存量基线（反向棘轮：修好必须删行、陈旧条目必须删）+
  两侧 CI（`.github/workflows/context-gate.yml`、`.gitlab-ci.yml` 的 `context-gate`，
  与 freeze-check 同款每 push/PR 全量跑）+ AGENTS.md 锚点块一行。顺手修掉门禁首跑抓到的
  存量：`graph-engineering.md` 补 frontmatter、`duplicate-cart-queries.md` 的
  「⚠️ 合并时差点静默改掉徽标数字」重标为规范的「关键陷阱：…」标签。
- **为什么**：本仓判例已两次证明「纯文档约束必然静默漂移」（08-07 internal/pkg 同构、
  08-08 服务清单四处手抄），处理办法也定型了——能判定的约束变成脚本、存量走基线棘轮。
  但 context/ 知识库**自身**的约定（INDEX 登记、frontmatter、experience 四段）一直是纯文档约束，
  没享受同等待遇。deepseek-harness（TypeScript monorepo + Cordis 插件架构）把这层做成了
  doc-sync 门禁族（verify-md-links / verify-agent-note-format / verify-doc-budgets 等
  三十余个脚本），本条是它的最小移植。**否决的替代**：dsh 的字数预算全套、双语配对校验、
  归档冻结清单、生成式目录（gen-*-catalog）不搬——单人仓收益不抵维护成本，且生成式目录
  在本仓已有对等物（`.service-matrix.yaml` + structcheck）；只取「链接、覆盖、格式、预算」
  四类可机械判定且当场抓到真漂移的。
- **触发事故**：用户要求阅读 `~/lens077/deepseek-harness` 源码并参考它增强本仓 harness。
  门禁写完首跑即抓到 2 处已存在的静默漂移（`graph-engineering.md` 整个 frontmatter 缺失——
  08-08 从根目录搬进来时就没加；config 模块两篇 experience 非坑体裁、无四段结构），
  证明缺口真实而非假设性加固。
- **怎么验证的**：九类故意写错的输入逐一注入——坏链接 / 孤儿文件 / 缺 frontmatter /
  name 与 layer 双重不匹配 / 新 experience 缺陷阱段 / 已合规文件塞回基线（反向棘轮）/
  基线指向不存在的文件 / evolution-log 条目抹掉「触发事故」/ AGENTS.md 灌超 14000 字节——
  全部 rc=1 且违规 tag 正确，还原后全绿。脚本避开 Bash 3.2 禁区（无关联数组/mapfile，
  mktemp 用 BSD/GNU/busybox 三方兼容写法），GitLab 侧 alpine 显式装 GNU grep/sed/gawk
  防 busybox 行为差异。
  **GitHub 首跑即抓到第 3 处存量漂移并暴露门禁自身盲区**：`pangolin-tunnel.md` 链接
  仓库根 `ai-helper.sh`，该文件被 `.gitignore` 刻意排除——本机磁盘上有所以本地跑绿，
  CI checkout 的提交树里没有所以红。文档改为纯文字引用；门禁补「目标存在但被
  gitignore 也算 DEAD-LINK」（`git check-ignore -q`），使本机运行与 fresh clone 等价，
  注入指向 ignored 文件的链接实测拦截。

### 2026-08-13 废止 PROGRESS.md 与双文档进度纪律

- **改了什么**：`docs/PROGRESS.md` 归档为 `docs/reviews/PROGRESS_ARCHIVE_20260813.md`（带废止横幅），
  删除制度文件 `progress-and-todo.md`；**`TODO.md` 成为唯一进度真相源**。「声称完成前先回扫代码
  （假成功/panic 按未实现计）」的口径保留在 `context/team/runbook.md` 提交流程与
  `.cursor/rules/git-commit.mdc`。同步改引用：AGENTS.md、README 导航、DEVOPS.md 阶段验收、
  runbook、两份 INDEX、git-commit.mdc、STACK.md 目录注释。
- **为什么**：两份文档记同一进度，口径靠人肉双写维持。TODO.md 每次改动都被硬规则强制更新，
  PROGRESS.md 没有独立的强制时机也没有验证器兜底，必然滞后；滞后的评估视图带着
  「最后更新：今天」的头部提供过期数字，比没有更糟。
- **触发事故**：08-08 后 PROGRESS.md 再无实质更新——08-12 的提交只改了日期行（更新日志停在
  v1.19/08-08，且那次改动自己都没进日志）；08-07 全仓服务数 11→10 修正 12 处时漏掉本表 3 处；
  08-13 文档整理发现其可观测性描述（告警 0 条/2 盘/网关无 meter/11 服务）整体落后实况一轮。
  「每次改动两份都要更新」的硬性要求在无验证器兜底下 5 天内自然断裂。
- **怎么验证的**：全仓 grep `PROGRESS`/`progress-and-todo`，活文档侧引用清零
  （仅剩 TODO/evolution-log 历史条目与 reviews 归档自身）。

### 2026-08-13 把团队规范投影为 Cursor project rules

- **改了什么**：无 → `.cursor/rules/*.mdc`（12 条：1 条 alwaysApply 路由 + 按 glob 拆分的 proto / Go 测试 / Redis / 定时任务 / 前端 connect-query / MUI spacing / 提交 / shell / okteto / 本地环境 / 中文文案）。正文是蒸馏，完整约束仍只写在 `context/`。
- **为什么**：`AGENTS.md` 是跨工具基线，每轮整份注入；Cursor 的 `.mdc` 可按打开的文件类型注入，把「改 proto 必须有 validate」「transport 必须单例」这类文件级约束送到真正改那些文件的会话里，而不把 Redis / okteto 全文塞进每个前端小改。
- **触发事故**：用户要求把当前项目规则记入 Cursor 规则。此前仓库没有 `.cursor/` 目录，文件级约定只存在于 `context/`，Cursor 会话除非主动去读，否则看不到。
- **怎么验证的**：12 个 `.mdc` 均有 YAML frontmatter；alwaysApply 仅 `knowledge-routing.mdc` 一条；其余靠 glob / description 触发；规则正文指向 `context/` 对应文件，不复制长文。

### 2026-08-12 将全自动权限处理与实质性选择分流到项目级 Codex 规则

- **改了什么**：`ecommerce/AGENTS.md` 新增硬规则 #7：`Full Auto` /「全自动」会话不再用
  权限确认打断用户，但遇到会实质改变结果的互斥选项仍弹选择对话框；新增
  `.codex/config.toml`，启用 Default 模式的选择对话能力，并给自动审批器写入相同分流策略；
  同步更新父级 `lens077/AGENTS.md`，仅保留其目录层级所需的链接前缀差异。
- **为什么**：权限确认与产品/实现决策不是同一类交互。全自动模式应消除前者的人工停顿，
  但不能因此替用户猜测会改变结果的选择；同时，规则只写在用户级 `~/.codex` 中无法随
  ecommerce 项目传播，也不能保证从项目目录启动的新会话继承项目约定。
- **触发事故**：上一轮只更新了用户级 `~/.codex/AGENTS.md` 与 `~/.codex/config.toml`，
  用户随后明确指出还要修改 ecommerce 内的 Codex 规则，并把 ecommerce 的项目级
  `AGENTS.md` 同步到 `lens077`；原实现的作用域不完整。
- **怎么验证的**：对两份 `AGENTS.md` 做去除父级 `ecommerce/` 链接前缀后的逐字比较；
  从 ecommerce 根运行 `codex features list`，确认项目配置可解析且
  `default_mode_request_user_input` 为 `true`；另用 `git diff --check` 检查文本格式。

### 2026-08-12 将 E3 提升为 Codex 全局执行偏好并启用本地记忆

- **改了什么**：`~/.codex/AGENTS.md` 从只有通用安全策略，扩为所有仓库默认继承的 E3
  执行规则；仓内 `AGENTS.md` 补上「便宜失败不算效率、无可信验证器或风险高时保守一级」；
  `~/.codex/config.toml` 开启官方 `features.memories`，让合资格会话可在后台生成本地记忆。
- **为什么**：E3 不能只在一个仓库里生效；它的关键也不是一味少读，而是把正确性当约束，
  以最小可验证路径起步，再按失败证据扩张。论文的模拟降本数字不能当跨任务承诺，故全局规则
  同时保留真实模型收益更温和、并非每个任务都获益的边界。
- **触发事故**：用户明确要求读完 arXiv:2607.13034 后把结论同步到 Codex 全局文件、项目
  Agent 和记忆。检查发现项目已有 E3 规则，但 `~/.codex/AGENTS.md` 完全没有 E3，且本地
  `~/.codex/memories/` 为空、记忆功能仍是默认关闭；离开本仓或开启新会话后无法继承或回忆。
- **怎么验证的**：通过 arXiv HTML 正文逐节核对问题定义、E3 算法、消融、稳健性与真实
  gpt-4o 案例；改后检查两份 `AGENTS.md` 的 E3 关键句，运行 `codex features list`，确认
  配置被解析为 `memories stable true`。记忆生成由 Codex 在会话空闲后异步执行，不把空目录
  或手写文件冒充已经生成的记忆。

### 2026-08-12 引入 E3 执行策略（估计→最小执行→失败才扩张）与过度阅读护栏

- **改了什么**：`AGENTS.md`（仓内 + `~/github/lens077/` 工作区副本）新增「执行策略：E3」
  常驻节——动手前估计任务规模 L1/L2/L3，走最小路径，验证失败才逐级扩张，并按规模路由
  plan mode / 子代理 / reasoning effort；新增 `context/harness-framework/e3-execution.md`
  （出处、与锚点命令的对接、hook 文档与再验证方法）；用户级 `~/.claude/settings.json`
  新增 PreToolUse hook `~/.claude/hooks/e3-overread-guard.py`——同会话首次编辑前完整读
  第 6 个不同文件时拦下该次 Read 并提醒（重发即可继续；每会话最多一次；编辑后静默；
  解析失败一律放行）。
- **为什么**：agent 默认的「先读全仓求稳」在最简单的任务上冗余最大，而指令层的约束
  会被忘，所以指令（AGENTS.md，Codex 也读）+ 机械护栏（hook，仅 Claude Code）各管一半。
  护栏刻意做成一次性、可绕过、fail-open——吸取 2026-08-07 那条的教训：预防性规则缺少
  真实事故校准时容易写过头，先把误伤成本压到「重发一次 Read」。
- **触发事故**：无本仓事故，属预防性引入。触发点是 arXiv:2607.13034 的实测：模拟基准上
  max-context-first 策略在单文件小改上 ACRR 达 22 倍；真模型实验里被指示「先读全部
  再动手」的 gpt-4o 在欺骗性仓库级任务上三跑全败（步数耗尽/改错/撞限流）——过度阅读
  不只是慢，会把步数和限流预算烧进失败。同理**禁止**在指令文件里写「先通读代码库 /
  be thorough」类措辞。
- **怎么验证的**：五组故意输入直喂 hook 脚本——①同会话连读 6 个不同文件：前 5 放行、
  第 6 个 exit 2 且 stderr 输出提醒 ②第 7 次读放行（每会话只提醒一次）③先 Edit 再读
  6 个全放行 ④同一文件重复读不计数 ⑤非 JSON 输入放行（fail-open）。接线后在真实会话
  里 Read 一次，确认 `$TMPDIR/e3-guard-<session_id>.json` 即时生成且内容正确——hook
  真的在跑，不是静默失效。

### 2026-08-08 静态检查引入基线棘轮，软门禁伤疤集中显形

- **改了什么**：新增 `scripts/lint-baseline.sh`（snapshot/check/list 三模式，B−A 只拦新增）
  与 `scripts/harness-scars.sh`（三处放行集中显形）；`go-vet` 基线接进 `service-ci.yml`，
  伤疤面板接进 `deploy-consistency.yml`、`make deploy`、`make deploy-status`。
- **为什么**：存量告警多 → 不敢开门禁 → 告警继续涨，这是个死结。基线对比把它拆开：
  存量冻结放行、只拦新增。它真正的作用不是技术上的，而是**剥夺「这是历史问题」这句万能解释**——
  是不是历史问题由基线文件说了算，不由跑的人（或 AI）说了算。
  配套的反向棘轮（基线条目被修好后必须刷新，否则失败）是为了防止基线只增不减变成永久免罪符。
- **触发事故**：`TODO.md` 长期挂着「CI 门禁未接入，48 条 warning 未清」，卡了很久没动。
  本次实测发现**这 48 条其实早就清干净了**（`vp lint` 与 `go vet` 都是 0 告警），
  但因为没人敢确认，门禁一直没开。**过期的债务记录本身就是一种阻塞。**
- **怎么验证的**：四态实测——①注入 `debugger`/`eval` → 阻断（exit 1）②snapshot 冻结 → 放行但打印伤疤
  ③删掉问题不刷基线 → 反向棘轮报错（exit 1）④刷新基线 → 全绿。伤疤面板另用注入一条
  matrix 例外验证能抓到，验证后已还原。

### 2026-08-08 硬规则 #6 从「只拦」改成「拦 + 放」的对称写法

- **改了什么**：`AGENTS.md` 硬规则 #6 由单句「不可逆动作只能由用户明示触发」扩成五条：
  哪些算不可逆动作 → **什么算授权（算了就直接执行，不要二次确认）** → 什么不算授权
  → 仍需先说明的例外 → subagent 永不执行。`context/team/runbook.md` §0 与根外
  `~/github/lens077/AGENTS.md` 同步。
- **为什么**：原文只写了规则的一半。它列举了哪些动作需要授权、并特意说明「帮我实现 X」
  不构成授权，**却从没写授权给出之后该怎么办**。这种不对称下，拒绝在文本里永远是安全的、
  执行永远是有风险的，最优策略就退化成「什么都拦」。
  补上的关键一句：重复确认「既拖慢工作，也让用户下次懒得看提示，**反而削弱真正该拦的那次**」。
- **触发事故**：用户明确反馈「当我明确允许执行时你需要放行，而不是什么都阻止」。
- **怎么验证的**：`diff` 确认仓内与根外两份 AGENTS.md 的 #6 逐字一致；同时确认
  `~/.claude/settings.json` 的 `ask` 分层（kubectl apply / helm / git push 等）本就正确，
  过度阻拦的根因在文档措辞而非权限配置——所以只改文档，没动权限。

### 2026-08-08 服务清单收敛到真相源，扇出改为收集失败

- **改了什么**：`.service-matrix.yaml` 新增 `deployment_coverage` 段；新增
  `TestDeploymentListsMatchMatrix` 三向校验（陈旧残留 / 缺口需带原因例外 / 过期例外必须删）；
  `backend/Makefile` 的 `SERVICES` 去掉已拆仓的 `config`、补回 `behavior`，
  扇出循环由 `|| exit 1` 改为收集全部失败再汇总退出。
- **为什么**：同一份服务清单被手抄了四份（Makefile / compose / helm values / deploy 目录），
  手抄必然漂移，而且漂移是**静默**的。
- **触发事故**：`make k8s-dev-all` 每次都在 `config` 处中断（它已随配置中心拆仓、`deploy/` 已删），
  导致排在后面的 `payment` **永远 apply 不到**，而报错长得像普通的 kubectl 报错，没人会多看一眼。
  同时发现 `behavior` 在四条部署入口里全部缺席。
- **怎么验证的**：三个故意写错的输入——①把 `config` 塞回 SERVICES ②从 compose 删掉 behavior
  ③删掉 helm 的例外声明——全部报红，验证后还原。扇出容错另用不存在的服务名验证
  「后面的服务仍被 apply、整体仍退出非零」。

### 2026-08-07 新增硬规则 #6：不可逆动作需用户明示触发

- **改了什么**：`AGENTS.md` 新增硬规则 #6（commit/push/合入/deploy/仓外写删只能由用户明示触发，
  subagent 永不执行）。
- **为什么**：AI 在「帮我实现 X」这类宽泛指令下会顺手执行不可逆动作，而这类动作出错的代价
  远高于写错代码。
- **触发事故**：harness 瘦身那轮复盘时识别出的风险面（当时未发生实际事故，属预防性加固）。
- **怎么验证的**：无（纯文档约束）。**这一条后来被证明写得不完整**，见上面 2026-08-08 那条——
  预防性规则缺少真实事故校准时，容易只写单向。

### 2026-08-07 结构性约束从文档沉降为 CI 门禁

- **改了什么**：新增 `backend/structcheck/`，随 `go test ./...` 进 CI：matrix↔服务目录双向对齐、
  matrix 内部一致性、matrix↔网关接线、`internal/pkg` 同构性棘轮（基线
  `homogeneity_baseline.txt`，只许删行）。
- **为什么**：写在文档里的约束是**可解释执行**的——AI 与人都能找到看上去合理的理由绕过去，
  而验证成本高到没人会每次去查。能判定的约束就该变成脚本。
- **触发事故**：实测发现 10 个服务的 `internal/pkg` 基础设施副本已真实漂移 14 个文件，
  其中 `registry/consul.go` 有 8 个变体——address 的 Consul check 空指针防护从未同步到其余服务。
  这类漂移在纯文档约束下已经存在了很久，没有任何人发现。
- **怎么验证的**：注入一处漂移确认报红；同日还修掉了门禁自身的一处误报
  （服务名恰好是普通单词时归一化替换失效，导致 3 个逐字节相同的文件被误判）。

### 2026-08-20 CI 触发从 push-path 改回仅 tag（并升级为版本化发布链）

- **改了什么**：`backend.yml` 触发改为仅 semver tag `X.Y.Z`（`workflow_dispatch` 留作显式手动例外）；
  detect 的 diff 基线从 `event.before` 改为上一 semver tag；镜像与 `helm/values.yaml` 回写
  升级为版本 tag（`X.Y.Z` + `sha-<7>` 双标）。规范落
  `context/team/git-commit.md`「发布 tag 与 CI 触发」，AGENTS.md 反直觉约定挂索引。
- **为什么**：把发布节奏交还给打 tag 的人。push-path 触发下"提交即发布"，
  文档/matrix 类提交也会引发十服务全量构建与部署。
- **触发事故**：2026-08-20 当天两连击——①推送选型回填（含 `.service-matrix.yaml`）触发全量
  构建，CI 机器人随即回写镜像 tag 直推 GitHub main；②该机器人提交使本地与远端历史分叉，
  下一次推送被拒，只能 merge 收敛（`7438fd2`）。每次涉及共享路径的推送都会重演这个循环。
- **怎么验证的**：`yq` 解析两份 workflow 通过；推送本变更到 main **未**触发运行（新 on: 块生效）；
  随后打首个新制 tag `1.4.0` 实测全链（tag → 矩阵构建 → 版本镜像 → values 回写）。

### 2026-08-21 token 成本治理:对照腾讯《Multi-Agent 降本》复盘的六处改动

- **改了什么**:①`TODO.md` 瘦身 199KB→92KB——「实现进度对照」说明列裁剪为首句、
  「技术选型定稿回填」与「会话记录」整段移出,原文全量存入
  `docs/progress-archive/2026-08-21-todo-evidence.md`(不可变历史归档,非并行真相源);
  ②`verify-context.sh` 新增 TODO.md ≤ 96000B 预算门禁(与 AGENTS.md 预算同款反向棘轮);
  ③新增 `scripts/verify-quick.sh`:后端链与 `pnpm ready` 并行跑、绿只打一行红只打失败段,
  接入 AGENTS.md 锚点区与 runbook §0.5;④runbook §0 的硬规则 #6 副本压成指针
  (全文只留 AGENTS.md 一处);⑤新增 `harness-framework/subagent-dispatch.md`
  (子代理只回结构化摘要/按角色裁剪能力/按角色分层模型);⑥kaneo MCP 从 `~/.claude.json`
  用户级常驻注册移除,收窄为按需挂载(仓库 `.claude/kaneo-mcp.json` + skill 前置说明);
  impeccable PostToolUse 钩子加 `frontend/` 路径过滤包装(`.claude/hooks/`)。
- **为什么**:主会话/每轮常驻的字节在后续所有轮次被重复计费。TODO.md 被硬规则 #3 绑进
  每个提交回合,是单文件最大的重复计费源;kaneo Schema 与 impeccable 全路径触发是
  「用不上也常驻」;锚点串行+全量输出是修复循环里的重复噪音。方法论对照
  腾讯技术工程《靠 10 个优化点把 Multi-Agent 工作流成本降 50%以上》(2026-08)的
  「只看到需要的/减少无关/减少重复」三原则。
- **触发事故**:2026-08-21 对照该文复盘时量出 `TODO.md` 已膨胀到 199,057B、
  单行最长 3.8KB(验收证据长文与会话问答堆在进度真相源里),17 行超 2000 字符;
  同时发现 kaneo MCP 在所有项目的每轮对话常驻 Schema 而仅 kaneo-sync 一个 skill 使用。
  无单次爆炸事故,属于「滚雪球到量变临界」的主动治理。
- **怎么验证的**:瘦身脚本跑完后 `TODO.md` 92,103B、超长行清零,抽查表格行与归档原文
  完整性通过;`scripts/verify-context.sh` 全绿(含新门禁与新文件的 INDEX/frontmatter 检查);
  `scripts/verify-quick.sh` 实跑(后端+前端并行)通过;hook 包装用后端路径 stdin
  冒烟测试确认跳过;`~/.claude.json` 改前有备份(`.bak-20260821`),剩余 5 个 server 完好。

### 2026-08-23 structcheck 网关核对改 import control-tower routes 包

- **改了什么**：①`TestGatewayWiringMatchesMatrix` 的数据源由「读 `gateway/configs/config.yaml`
  文件」改为 import `github.com/lens077/control-tower/routes`（go:embed 导出的路由模板,
  dev/pre 两环境都核对）;前缀映射为「去掉首 `/` 尾 `*` 即一级 proto 包名」;
  删除 `gatewayTargetsNotInMatrix` 例外表(config-service 路由已随 `/config*` 删除而消失)。
  ②新增 `TestGatewayAnonymousMatchesMatrix`:matrix `gateway.anonymous_paths` 与路由模板
  `anonymous` 双向相等(匿名清单单一真相源落进门禁)。③service-ci.yml 与
  deploy-consistency.yml 增加私有 module 凭据步骤(`GH_MODULES_TOKEN` + insteadOf),
  缺 Secret 时显式报错而非静默挂起。
- **为什么**:网关重写迁入合一仓 control-tower 后,`gateway/configs/config.yaml` 只剩
  旧网关的冻结副本,继续核对它=核对将死之物;路由真值改经 module 版本流动,
  「路由变更必须同 PR 升依赖版本,否则 structcheck 红」形成自动闭环,
  替代对抗评审中被否的「注释纪律双写」方案(评审 P1-4/§8-1 合并裁决)。
- **触发事故**:无单次事故,属网关迁移(control-tower 方案 v2 P4)的配套改造;
  评审阶段 codex-sol 指出旧方案「structcheck 被人工双写取代」会静默漂移,
  claude-fable 提出 go:embed+import 载体,终裁采纳合并方案。
- **怎么验证的**:`cd backend && go test -count=1 ./structcheck/...` 全绿
  (含新增匿名核对,10 条逐字对齐);故意把 matrix 一条 gateway_prefix 改错后测试变红、
  改回后复绿;CI 凭据步骤在本地以空环境变量演练报错路径。

### 2026-08-23（补记）control-tower 转 public，CI 私仓凭据步骤撤除

- **改了什么**：同日撤掉 service-ci.yml 与 deploy-consistency.yml 的
  「Configure private Go modules」步骤（上一条的③），改为注释说明默认 GOPROXY 可拉。
- **为什么**：用户当日把 github.com/lens077/control-tower 设为 public,
  凭据步骤从必需变成误伤源(硬性 exit 1 会红掉本可通过的 CI)。
- **触发事故**：无;跟随仓库可见性变更的即时纠偏。
- **怎么验证的**：本地清掉 GOPRIVATE 后 `go mod download github.com/lens077/control-tower`
  经默认代理成功;structcheck 复跑绿。

### 2026-08-28 TODO 预算 canary 改为动态越界

- **改了什么**：`verify-context-canary.sh` 的 `budget-todo` 注错不再固定追加 4000B，改为按
  当前 `TODO.md` 大小动态追加到 96001B，保证无论真文件经过多少次瘦身都能越过 96KB 门槛。
- **为什么**：canary 测的是「预算门禁能否拦截超限」，注错量应由门槛与当前大小决定；固定增量
  把测试错误地绑定到了 2026-08-21 当时约 92KB 的文件体积。
- **触发事故**：2026-08-28 Tetragon 文档 PR 的 GitHub `verify-context` 主检查通过，但元评测
  `budget-todo` 期望 rc=1、实际 rc=0；原因是 TODO 再次瘦身后追加 4000B 仍未达到 96KB，导致
  CI 把健康的预算门禁误判为失效并阻塞合并。
- **怎么验证的**：本地运行 `scripts/verify-context-canary.sh`，干净沙箱保持绿色，十类注错均被
  对应 tag 拦截；随后运行 `scripts/verify-context.sh` 复核真实仓库仍为绿色。
