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

---

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
