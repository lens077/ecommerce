# Graph Harness 与图式 Agent 工程：术语、来源与生产就绪审计

> 访问日期：2026-09-03。本文优先使用论文原文、作者原文和产品官方文档。除非另有说明，文中的「论文」指 Hu Wei 的 arXiv:2604.11378v1。本文不把 2026 年博客中的二手归因视为术语来源证据。

## 结论摘要

### 已核实事实

1. **Hermes Agent 是品牌和具体开源产品**：Nous Research 将其描述为自改进 AI agent；它不是 `agent harness`、`Agent Loop` 或 `Graph Harness` 的通用同义词。[H1]
2. **`agent harness` 是宽泛的工程术语，不是单一标准**。Vivek Trivedy 给出的工作定义是「模型之外的代码、配置和执行逻辑」，包括状态、工具执行、反馈循环、约束、沙箱、编排和中间件。[T2]
3. **`harness engineering` 的唯一首创者无法从第一方证据确定**。Mitchell Hashimoto 于 2026-02-05 明确说「我不知道是否已有行业公认术语」，并说自己逐渐称其为 `harness engineering`；这证明他独立公开使用并定义了该词，但不是首创声明。[T1] OpenAI 于 2026-02-11 用同名标题报告实践；Vivek Trivedy 于 2026-03-10 给出更宽的系统定义。[T2][T3]
4. **Agent Loop 是通用架构模式**，通常指模型在「推理/行动/观察」或等价工具循环中动态决定下一步。ReAct 是该范式的重要论文来源，但把整个 Agent Loop 唯一归因给 ReAct 会过度简化此前的 agent/OODA/控制循环历史。[R1]
5. **Graph Harness / Structured Graph Harness（SGH）是 arXiv:2604.11378 提出的论文术语和设计提案**：显式静态 DAG、不可变计划版本、规划/执行/恢复三层分离、严格恢复升级。论文自称 position paper，明确没有生产实现和实验结果；它不是标准，也不是已验证产品。[P1]
6. **`graph engineering` 仍是新兴、非标准化的实践标签**。现有第一方框架文档分别定义自己的图运行时，但没有共同的 SGH 数据模型、状态机、恢复协议、认证测试或治理机构。因此目前不存在可核实的跨框架「Graph Harness 社区标准」。[L1][A1][T4][AN1]

### 推断

- 「harness」是包含工具、状态、约束、运行时等的外层系统；「loop」是该系统中的迭代控制形状；「graph」是跨节点的显式控制/依赖结构。三者是可组合层，不是互斥代际。
- 论文 SGH 的静态 DAG 与 LangGraph/AutoGen GraphFlow 的通用有环、条件和动态路由能力并不等价。某框架能画图或执行 DAG，不代表满足 SGH。
- Temporal 能提供 durable execution 的关键底座，但不会自动提供 SGH 的计划不可变性、节点输出契约、恢复升级和副作用分级。

### 建议

- 对外使用「基于 LangGraph/AutoGen/Temporal 的图式 agent 工作流」等可验证描述；只有逐项通过本文清单 A 时才称「SGH-compatible」。
- 将「生产就绪」与「论文合规」分开：生产系统通常需要循环、动态路由、补偿、部署版本治理和可观测性，可能故意不符合静态 SGH。

## 1. 术语边界

| 术语 | 性质 | 可核实含义 | 不应混称 |
|---|---|---|---|
| Hermes Agent | 品牌、具体开源产品 | Nous Research 的自主 agent 产品，含工具、记忆、skills、委派等。[H1] | 不是通用 agent harness 类别或 SGH 标准 |
| agent harness | 通用工程术语，边界未标准化 | 模型外部使其成为可运行 agent 的代码、配置、状态、工具、沙箱、编排、反馈和约束。[T2] | 不等于某个模型或某个品牌 |
| Harness Engineering | 新兴实践术语 | Hashimoto 的窄义是把反复错误固化成 `AGENTS.md` 指引或程序化验证工具；Trivedy/OpenAI 的宽义扩展到模型周围整个运行环境与反馈系统。[T1][T2][T3] | 没有权威标准定义；不可无证据宣称某人「发明」 |
| Agent Loop | 通用架构模式 | 模型根据上下文调用工具、观察结果、继续或输出终态；ReAct 将 reasoning 和 acting 交错并通过环境 observation 更新轨迹。[R1] | 不是产品；也不天然表示单线程、无持久化或无并行工具调用 |
| Graph Harness / SGH | 论文提案术语 | arXiv:2604.11378 的静态 DAG 设计点与正式状态机/恢复协议。[P1] | 不是 LangGraph 别名，不是行业标准，不是实现 |
| graph engineering | 新兴实践标签 | 设计显式节点、边、状态、调度、恢复和演化的 agent 图系统；目前缺少统一第一方规范。 | 不等于知识图谱、GraphRAG 或 ML computation graph；也不自动等于 SGH |

### 术语争议和不确定性

- Hashimoto 原文避免了首创声明，甚至主动承认可能已有其他名称。[T1] 因此「coined by Mitchell/Vivek/OpenAI」均不能由现有第一方材料唯一证明。
- Trivedy 的「Agent = Model + Harness」是作者提出的清晰工作定义，不是标准组织定义。[T2]
- 论文交替写 `Graph Harness` 与 `Structured Graph Harness`，摘要中甚至出现括号式并列；本文用 SGH 指其完整形式要求，而不是任何图编排器。
- `graph engineering` 也已有知识图谱工程的旧义。本文仅讨论 agent 执行/组织图语境。

## 2. `agent harness` / `harness engineering` 来源追溯

### 2.1 Mitchell Hashimoto：可核实的早期第一方定义

2026-02-05 的《My AI Adoption Journey》把 Step 5 命名为「Engineer the Harness」。其定义有三个关键点：[T1]

- agent 要有快速、高质量工具，能自动判断自己何时错误；
- 每当 agent 犯错，就工程化一个方案，使同类错误不再重复；
- 具体载体分两类：更好的隐式提示（如 `AGENTS.md`）和实际程序化工具（截图、筛选测试等）。

**归因边界**：这是明确的公开使用和定义，但作者原话是「I don't know if there is a broad industry-accepted term for this yet」。所以最可信表述是「Hashimoto 在 2026-02-05 独立公开使用并定义了这个说法」，不是「已证明由他首创」。

### 2.2 OpenAI：实践报告，不是来源声明

OpenAI 于 2026-02-11 发布《Harness engineering: leveraging Codex in an agent-first world》。文章把工程师工作描述为设计环境、表达意图、构建反馈循环，并记录仓库知识索引、机械化架构约束、结构测试、UI/日志/指标可读性、agent-to-agent review 和持续清理等实践。[T3]

**归因边界**：文章标题证明 OpenAI 当时采用该术语，但文章没有给出首创史，不可用来证明 OpenAI 发明该词。其数字是 OpenAI 的自报案例，不是独立实验。

### 2.3 Vivek Trivedy / LangChain：宽定义

Vivek Trivedy 于 2026-03-10 定义「Agent = Model + Harness」，把 harness 视为模型之外的代码、配置和执行逻辑，列出 system prompts、工具/skills/MCP、文件系统/沙箱/浏览器、subagent/handoff/model routing、compaction/continuation/lint hooks 等。[T2]

这比 Hashimoto 的「防止重复错误」更宽：前者定义完整 agent 系统边界，后者强调持续改进方法。二者相关但不能无条件互换。

### 2.4 Anthropic：`harness` 用法早于 2026 年命名讨论

Anthropic 于 2025-11-26 发布《Effective harnesses for long-running agents》，用 initializer agent、coding agent、进度文件和 Git 历史解决跨 context-window 接续问题，并直接把 Claude Agent SDK 称为通用 agent harness。[AN2] 这至少证明 `agent harness` 的第一方公开用法早于 Hashimoto 的 `harness engineering` 表述；但它同样没有宣称发明该术语。

### 2.5 ReAct 与 Agent Loop

ReAct 论文提出让语言模型交错生成 reasoning traces 和 task-specific actions；action 与环境交互取得 observation，再支持后续 reasoning/acting，并在多个 benchmark 给出实验。[R1] 这为现代工具 agent loop 提供了重要、可引用的学术形式化。但：

- ReAct 是 prompting paradigm，不是通用 harness 规范；
- 论文没有提出 `harness engineering`；
- 将所有 agent loop 的历史起点唯一写成 ReAct，是论文作者之外的扩大推断。

## 3. SGH 论文精读

来源：arXiv:2604.11378v1，2026-04-13，Hu Wei。[P1]

### 3.1 正式定义与三项设计承诺

执行系统定义为：

`E = (S, U, P, O, Delta)`

- `S`：节点全局状态；
- `U(S)`：ready set；
- `P`：从 ready set 选择/调度节点的 policy；非确定系统中它是 relation；
- `O = {success, failure, retry, escalate}`：结果空间；
- `Delta`：状态转移并重新计算 ready set。[P1 §3.1]

执行计划为：

`Pi = (id, version, V, E, sigma, kappa)`

其中 `V/E` 是静态 DAG，`sigma` 为每节点配置（action、retry policy、side-effect level），`kappa` 为计划级输出契约。[P1 §5.1]

三项设计承诺：

1. 同一 plan version 生命周期内 `(V,E)` 不可变；结构变化只能通过 replan 生成 `version + 1`。
2. Planner、Runtime、Recovery 三层独立：规划生成并验证计划；运行时只执行、不改图；恢复层诊断并选择恢复动作。
3. 恢复必须严格按 `local_retry -> local_patch -> request_replan` 升级，禁止跳级。[P1 §§5–6]

另有 context partition：执行上下文 `C_exec` 与诊断上下文 `C_diag` 在节点执行期不相交；失败史只能经新计划版本进入执行上下文。[P1 §5.4]

### 3.2 调度模型

- Agent Loop 被描述为 `|U| <= 1`、policy 隐式且非确定的 single-ready-unit scheduler。
- SGH 是存在 `|U| > 1` 的 multi-ready-unit scheduler；ready set 由固定 DAG 依赖和节点状态计算，默认以拓扑策略并行 dispatch 所有 ready nodes。
- 论文的连续体有三轴：ready-set cardinality、policy explicitness、policy determinism。
- `all_of` 要求所有 predecessor `executed`；`any_of` 表示候选路径中满足成功语义后推进并 skip 兄弟。[P1 §7]
- **规格存在语义张力**：论文在 §§3.3、10.1 声称排除「只需一支成功并取消其余支路」的 competitive parallelism / `first_of`；但 §7 的 `any_of` 又要求并发 dispatch 全部候选，并在首个候选 `executed` 后把仍处于 `pending`、`ready`、`running` 或 `failed_retryable` 的兄弟转为 `skipped`。对 `running` 节点这样处理在工程上近似竞速取消，却没有配套 compensation 语义。因此不能把这一段当作无歧义的跨实现 join 标准；实现必须自行固定解释并测试副作用边界。

### 3.3 节点状态机

状态集合：[P1 Def. 6.1, App. A.1]

`pending, ready, running, waiting_human, blocked, executed, failed_retryable, failed, cancelled, skipped`

终态：`executed, failed, cancelled, skipped`；终态吸收、不可离开。关键转移包括：依赖满足 `pending -> ready`；dispatch `ready -> running`；输出满足节点契约 `running -> executed`；瞬态错误进入 `failed_retryable`；结构错误进入 `failed`；高副作用需审批则进入 `waiting_human`；预算耗尽进入 `failed`；`any_of` 兄弟完成可 `skipped`。

### 3.4 终止与健全性条件

**终止**：[P1 Def. 6.2, Prop. 6.1, Thm. 6.2]

- 前提是有限、无环、节点可达的有效 DAG；
- 每节点有有限 timeout `tau_v` 和 retry budget `b_v`；
- `waiting_human` 也有有限 timeout；
- 在这些条件下，论文声称主循环以概率 1 在有界时间终止。

**重要审计意见**：论文 proof sketch 把状态数有限近似为转移次数自然有界，但有 `failed_retryable -> pending -> ready -> running` 回环；真正使回环有界的是重试预算，而不是仅靠有限状态数。因此应将结论理解为「在实现正确执行预算、timeout、公平推进等假设下的设计级保证」，而不是已由实现或模型检查器验证的产品保证。

**健全性**：[P1 Thm. 6.3]

- `running -> executed` 由节点输出契约 `kappa_v` 守卫；
- 若每个验证器正确接受 passing output 的概率为 `p_v`，且验证错误独立，则所有输出真正正确的概率下界为 `product(p_v)`；
- 这不是绝对 correctness。语义验证、特别是 LLM-as-judge 的 false positive 会形成「validation gap」。

### 3.5 恢复升级协议

| 级别 | 动作 | 典型触发 | 作用域 |
|---|---|---|---|
| 1 | `local_retry` | 网络、timeout 等瞬态错误 | 当前节点，不改图 |
| 2 | `local_patch` | contract violation、认证错误 | 修改当前节点配置，不改图 |
| 3 | `request_replan` | 缺失依赖、计划结构无效 | 结束当前计划版本，生成新 `(V',E')` |

每节点有 `recovery_state in {pristine, retried, patched}`；API 前置条件拒绝未经 retry 的 patch，以及未经所有失败节点 patch 的 replan。论文也明确：绕过 API 直接改状态的实现不享受该保证。[P1 Def. 6.3, Prop. 6.4]

### 3.6 副作用分类

论文的正式计划配置要求每节点带 side-effect level，并提出：读操作可更自由重试；写、删、外部通知等高副作用操作不得 speculative parallel dispatch，retry budget 更紧，必要时进入 `waiting_human`。[P1 Principle 4, App. A.2]

**不确定性**：论文说明了高/低和示例，却没有给出可互操作的完整枚举、效果代数、幂等键协议或 compensation interface。生产落地仍需自行定义 effect taxonomy。

### 3.7 限制与实证状态

- 明确是 **position paper + design proposal**，不是标准、SDK 或生产实现；没有实验结果。[P1 Abstract, §1, §11]
- 七组实验设计只是未来协议，`G_graph > 0` 等都是可证伪预测，不是已验证结论。
- 70 项开源项目 survey 未 peer review，样本选择和人工分类有主观性；附录虽声称双 reviewer 与 `kappa=0.84`，但 supplementary full evidence 的独立复核仍有限。
- 静态 DAG 不适合开放探索、动态目标、创作修订；规划错误会并行传播；冷启动规划成本高；线性 DAG 会退化为 single-ready-unit。
- 不支持 `first_of`、递归 subgraph expansion、parent-chain rollback、动态拓扑修改。
- 并发调度、WAL/snapshot、故障恢复、分布式日志、幂等、leader election 仅是 implementation considerations，不是已交付能力。

## 4. 官方框架核对

### 4.1 LangGraph

**事实**：[L1][L2][L3]

- Graph API 的核心是 `State`、`Nodes`、`Edges`；节点可包含 LLM 或普通代码。
- 底层 Pregel 使用 actors/channels 与 BSP supersteps：Plan 选 actor、Execution 并行执行、Update 在 step 边界发布 channel 更新；无 actor 可选或到达 max steps 时停止。
- checkpoint/persistence 支持 durable execution、state history、resume 和 time travel。
- `interrupt()` 持久化状态并暂停；resume 时节点从头重跑，不是从调用行继续，因此 interrupt 前副作用必须幂等，或应移到 interrupt 后/独立节点。
- replay 从 checkpoint 之后重新执行节点，包括 LLM/API/interrupt；它不是只读 cache。需用 idempotency key、upsert、read-before-write 等保护副作用。

**判断**：LangGraph 能承载部分 SGH 机制，但默认支持循环、条件边和动态控制，且不内建 SGH 的三层分离、计划版本不可变与三级恢复。因此「使用 LangGraph」不推出「SGH 合规」。

### 4.2 Microsoft AutoGen GraphFlow

**事实**：[A1]

- `DiGraph` 控制 agents 的执行顺序，支持 sequential、parallel fan-out、conditional branching、join 和带安全退出的 loops。
- 节点是 agent，edge 是允许的执行路径；可用 activation group 的 `all/any` 表达依赖。
- 文档明确标注 **experimental**，API、行为和能力可能变化。
- execution graph 与 message filtering 分开；图控制谁何时执行，不自动限制 agent 接收哪些消息。

**判断**：GraphFlow 是具体实验性实现，不是跨框架规范；其允许有环与条件路径，也不等于论文的静态 DAG SGH。

### 4.3 Temporal durable execution

**事实**：[T4][T5]

- Workflow Execution 通过持久化 Event History 恢复；resume 通过从头重放 workflow code 重建状态。
- Workflow code 必须对相同历史作确定决策；外部 I/O、数据库、LLM、文件操作放入 Activities。
- replay 复用已记录 Activity result，不再次执行已完成 Activity；新执行或 Activity retry 仍要求业务层理解 retry/幂等语义。
- 安全部署需要 replay testing、patching 或 worker versioning，以保持历史兼容。

**判断**：Temporal 提供比一般 agent 框架更强的 durable execution 语义，但它是通用工作流平台，不定义 agent graph 标准或 SGH 恢复层。

### 4.4 Anthropic workflow patterns

**事实**：[AN1]

Anthropic 区分：workflow 由预定义代码路径编排 LLM/tools；agent 由 LLM 动态控制过程和工具。官方列出 prompt chaining、routing、parallelization（sectioning/voting）、orchestrator-workers、evaluator-optimizer，并建议只在能证明改善时增加复杂度；agent loop 需要环境 ground truth、human checkpoints 和 max iterations 等停止条件。

**判断**：这些是组合模式，不是 schema、state machine 或兼容性标准。它们证明图形化工作流形状早于「Graph Harness」命名，但不能证明 SGH 已成社区标准。

### 4.5 是否存在跨框架 Graph Harness 标准

**事实**：上述官方材料的核心对象不同：LangGraph 是共享 State/Pregel runtime；GraphFlow 是 agent `DiGraph`；Temporal 是 deterministic replay/Event History；Anthropic 是架构模式目录。没有共同命名空间、计划 tuple、节点状态、join 语义、恢复 API、side-effect taxonomy 或 conformance suite。[L1][A1][T4][AN1]

**推断**：截至访问日，没有可核实的跨框架 Graph Harness/SGH 社区标准。MCP 等协议解决工具/上下文互操作，也不等于执行图标准。

### 4.6 同名研究线不能混为一谈

2026 年还出现了名称相近但研究对象不同的项目：

- **Harness-G** 是 Hou 等人的《Harness-G: A Graph-Structured Harness for Search Agents》（arXiv:2607.27652）及其作者仓库。它研究强化学习搜索 agent 的检索接口：把自由文本 query 改成在段落—句子—实体图上的有限、可验证动作，并报告六个 QA benchmark 的实验结果。[HG1] 它不是通用任务调度器，也不实现 SGH 的 plan tuple、十状态机或三级恢复。
- `yashs33244/loops_vs_agents` 自称 SGH reference implementation，但不是论文作者仓库，GitHub 元数据中没有论文作者关联，且访问时为零 star、零 fork 的个人实验。[P2] 它可以作为代码样例，不能当作官方实现、互操作标准或社区采纳证据。

因此，「Graph Harness 已有论文与代码」仍需追问是哪条研究线、谁维护、解决哪个问题，以及是否有复现实验；名称相近不能建立标准血缘。

## 5. 清单 A：严格 SGH 论文合规条件

以下条件全部满足，才适合称「符合 arXiv:2604.11378 所提 SGH」；均来源于 [P1]。

- [ ] 计划使用 `Pi=(id, version, V, E, sigma, kappa)` 或语义等价结构，且 `V/E` 为有限静态 DAG。（Def. 5.1）
- [ ] 同一 plan version 内拓扑不可变；任何增删节点/边只能创建新版本。（Def. 5.2）
- [ ] 执行前验证 acyclicity、entry/exit reachability、join consistency、每节点 output contract、side-effect consistency。（App. A.2）
- [ ] Planner、Runtime、Recovery 职责和接口分离；Runtime 不修改图、不自行决定恢复。（§5.3）
- [ ] `C_exec` 与 `C_diag` 执行期不相交；失败史只经新计划版本回流。（Def. 5.3）
- [ ] ready set 由固定依赖和正式节点状态计算；有独立分支时支持 multi-ready-unit dispatch。（Defs. 3.1, 3.3）
- [ ] 节点实现完整十状态机，四个终态吸收。（Def. 6.1, App. A.1）
- [ ] 每节点有有限 timeout、retry budget；human wait 也有 finite timeout。（Def. 6.2）
- [ ] `running -> executed` 必须由 `kappa_v` 合同验证守卫，并记录验证方法。（§6.1）
- [ ] 只支持论文定义的 `all_of` / `any_of`；不得冒充支持被排除的 `first_of` competitive cancellation。（§7, §10.1）
- [ ] 恢复严格执行 `local_retry -> local_patch -> request_replan`，有 recovery state 和禁止跳级的机械前置条件。（Def. 6.3, Prop. 6.4）
- [ ] replan 生成新 plan version，而非原地改 `V/E`。（Def. 5.2, Table 10）
- [ ] 每节点配置 side-effect level；高副作用不得 speculative parallel dispatch，采用更紧 retry/人工审批。（Principle 4）
- [ ] 不使用递归 subgraph expansion、parent-chain rollback 或运行时动态拓扑。（§10.1）
- [ ] 声称终止/健全性时同时披露全部假设：有限有效 DAG、预算/timeout、公平推进、验证器可靠性与独立性。（Thms. 6.2, 6.3）
- [ ] 不宣称论文已有实证性能、生产实现或标准地位。（Abstract, §11）

## 6. 清单 B：框架中立的 production graph-agent readiness

这不是 SGH 论文标准，而是从官方框架语义推导的生产建议；每项标出事实来源与建议性质。

- [ ] **显式 State/Node/Edge 契约**：定义输入输出 schema、边 guard、并发写 reducer/merge 规则。[L1]（建议）
- [ ] **选择明确的调度与 join 语义**：说明 sequential/parallel/conditional/loop、`all/any`、取消传播和最大步数。[L2][A1]（建议）
- [ ] **持久化且可恢复**：为运行实例分配稳定 ID，持久化 checkpoint 或 Event History，并验证进程崩溃后可 resume。[L3][T4]（建议）
- [ ] **明确 replay 边界**：文档化哪些节点重跑、哪些结果复用、升级代码如何保持历史兼容；把 replay tests 放入发布门禁。[L1][T4][T5]（建议）
- [ ] **副作用安全**：外部效果带 effect/idempotency key，必要时采用 outbox、dedup、upsert、compensation 或 reconciliation；interrupt/retry 前的效果必须幂等。[L3][T4]（建议）
- [ ] **有界执行**：为循环、retry、fan-out、token、成本、墙钟时间和 human wait 设置上限及 terminal reason。[AN1][L2]（建议）
- [ ] **人工介入是耐久状态**：approval/review 可暂停、持久化、超时、取消、恢复；恢复行为需可测试。[L3][AN1]（建议）
- [ ] **验证与执行分离**：对关键产物用确定性 tests/schema/policy gate，LLM judge 只作有误差的补充；记录验证器版本和证据。[AN1][P1]（建议）
- [ ] **可观测与可归因**：统一 `graph_id/run_id/node_id/attempt/effect_id`，记录状态转移、输入输出引用、route reason、成本、延迟和恢复动作。[T3][T4]（建议）
- [ ] **拓扑与运行历史版本化**：可回答「哪版图、代码、prompt、模型、工具产生此效果」，并有 rollout/rollback/migration 方案。[T3][T5]（建议）
- [ ] **隔离与最小权限**：每节点限定工具、凭据、网络、文件和消息可见范围；不要假设 execution graph 自动等于 message/security graph。[A1][T2]（建议）
- [ ] **错误分类和升级**：区分 transient、contract、business、structural、human/policy failure；先局部恢复，再受控升级或人工处理。[P1][T4]（建议）
- [ ] **图级测试**：除节点单测外，覆盖 edge/guard、fan-out/fan-in、竞争写、取消、重复投递、crash/resume、replay、timeout 和图版本迁移。[L2][T5]（建议）
- [ ] **适用性证据**：用 eval 证明图的额外延迟/成本确实换来成功率、可控性或恢复收益；简单任务保留单调用/loop 路径。[AN1][P1]（建议）
- [ ] **框架成熟度披露**：例如 AutoGen GraphFlow 官方仍标 experimental；生产采纳需 pin version、回归测试和退出方案。[A1]（事实与建议）

## 7. ecommerce 双轨审查

### 7.1 审查对象与总判定

审查对象不是业务服务图，而是仓库内约束 AI 工作的协作 harness。必须分清四层：

| 层 | 当前事实 | 不能据此声称 |
|---|---|---|
| ecommerce 仓库 harness | `AGENTS.md`、`context/`、`TODO.md`、验证脚本、CI、hooks、skills 组成「文件 + 脚本 + CI」协作环境。`context/harness-framework/cordis-evaluation.md:15` 已明确这一边界。 | 仓库内已经有常驻 agent runtime 或通用图执行引擎 |
| 外部 DSH / Claude Code / Codex | 提供 agent loop、会话、工具调用、subagent，以及各自的 resume/fork 能力。`cordis-evaluation.md:17,36` 明确这些属于外部运行时。 | 这些能力已经由 ecommerce 自己实现或可跨运行时互操作 |
| `.service-matrix.yaml` | 业务微服务、外部依赖、网关与部署覆盖的结构真相源；文件头也限定它不记录执行计划。 | agent task graph、ready set 或 graph checkpoint |
| GitHub/GitLab CI | 有真实可执行 DAG、matrix fan-out、`needs` join 和退出码。 | 设计→实现→审查→恢复的 agent DAG |

**严格 SGH 判定：不满足，而且当前架构目标本来就不适用。** ecommerce 没有 `Pi=(id,version,V,E,sigma,kappa)`、图 runtime、节点状态机、ready-set scheduler、三级恢复或 graph checkpoint。现有决策还明确否决在本仓自建常驻 agent runtime；正确姿态是由外部运行时消费同一套仓库规则（`cordis-evaluation.md:21-36`）。

**Production readiness 判定：仓库级 harness 成熟，图运行时就绪度不足。** 验证锚点、独立 reviewer、知识治理和门禁元评测很强；但这些是未来图运行时的 node contract / verifier 基础，不是图运行时本身。

### 7.2 16 维度证据表

状态口径：`满足` 表示核心语义有机器执行；`部分` 表示只有局部机制或文档约定；`不满足` 表示缺少 agent 图对应结构。

| # | 维度 | 判定 | 仓库证据与机器边界 | 关键缺口 |
|---:|---|---|---|---|
| 1 | 显式节点、边、入口、终点 | 部分 | `context/harness-framework/graph-engineering.md:22-30` 以 prose 定义 Loop 0–4；`.github/workflows/backend.yml:100,128` 的 `needs` 是机器 CI DAG。 | 无统一 agent graph manifest、稳定 node ID、edge type 和 run terminal。 |
| 2 | 版本化不可变计划 | 部分 | `TODO.md:3-17` 是可改写的进度真相源，Git/归档提供历史；`.service-matrix.yaml:18` 的 `version` 只属于业务拓扑。 | 无 run 级 `plan_id/version/hash`，也没有把验证结果绑定到计划版本。 |
| 3 | Typed shared state | 不满足 | `context/harness-framework/subagent-dispatch.md:15-20` 只规定自然语言摘要和路径交接；Go struct/workflow input 只约束业务或 CI。 | 无 `RunState`、`NodeInput/Output`、`ArtifactRef`、`Failure` schema、版本和 validator。 |
| 4 | 节点状态机 | 不满足 | Loop 0–4 定义角色，不定义生命周期；TODO/issue/CI 各有自己的状态。 | 无合法转移、attempt、terminal absorption、非法迁移检测。 |
| 5 | ready-set 与确定调度 | 不满足 | E3 与 `subagent-dispatch.md:41` 只建议何时并行；CI `needs` 的 readiness 不覆盖 agent 工作。 | 无依赖→ready-set 计算、调度策略、并发上限、公平性或资源匹配。 |
| 6 | fan-out / join | 部分 | `scripts/verify-quick.sh:45-81` 用 PID 并行并 `wait` 汇合；CI matrix/`needs` 机器执行。 | 无通用 agent `all/any/quorum` join、取消传播、部分成功或 typed merge。 |
| 7 | Planner / Runtime / Recovery 分层 | 不满足 | `graph-engineering.md:27-30` 分离设计、实现、评审；E3 规定失败后扩张，但均由同一外部 agent 解释。 | 无独立接口、权限、上下文隔离、冻结计划或 recovery controller。 |
| 8 | 错误分类与有界恢复 | 部分 | E3「一次扩一级」、CI 个别三次重试和脚本退出码是局部边界。 | 无 transient/contract/business/structural 分类、attempt budget、退避和 retry→patch→replan 机械升级。 |
| 9 | 输出契约与验证锚点 | 满足 | `AGENTS.md:51-65`、`context/team/runbook.md:64-124`、`scripts/verify-quick.sh` 和 context canary 均要求「命令真绿」，CI 实际执行。 | 结果尚未封装为带 run/node/plan/artifact ID 的 proof，无法证明验证针对正确图版本。 |
| 10 | 独立 reviewer / context isolation | 满足（运行时外置） | `graph-engineering.md:27-36` 要求 fresh、跨模型族；`runbook.md:120-124` 接入 `/adversarial-review`。 | 仓库本身不能证明 session 确实 fresh、模型确实异构、review 对应同一 diff。 |
| 11 | 副作用分类、权限、幂等、补偿 | 部分 | `AGENTS.md:21-29` 分类不可逆动作并定义授权；CI/Claude 有局部权限；subagent 永不执行不可逆动作。 | 无 node effect type、effect/idempotency key、compensation handler、授权事件和跨运行时统一 policy。 |
| 12 | checkpoint / resume / replay | 不满足（仓库层刻意外置） | `cordis-evaluation.md:36` 把 append-only session、resume/fork/replay 识别为 DSH 能力；backpass 只是离线蒸馏。 | 无 graph state snapshot、resume token、确定性 replay 和 crash-recovery test。 |
| 13 | event trace / provenance | 部分 | Git、CI、evolution-log、SBOM/Cosign 与 `delivery-efficiency.md:37-53` 提供制品和结论溯源。 | 无统一 `graph_id/run_id/node_id/attempt/effect_id`、route reason、prompt/model/tool digest。 |
| 14 | 预算与停止条件 | 部分 | E3 路由开销；`verify-context.sh:21-24` 对规则文件做机器预算；审计有周期。 | 无每 run 的 step/token/cost/time/fan-out/retry/human-wait 上限及 terminal reason。 |
| 15 | 图版本兼容与迁移 | 不满足 | 业务 matrix/proto 有局部版本与 breaking checks，evolution-log 记录 harness 理由。 | 无 graph schema version、旧 checkpoint migration、节点重命名/删除规则或 replay compatibility gate。 |
| 16 | run 完成证明与闭环 | 部分 | 脚本和 CI 有退出码；Loop 2/3/4、提交与沉淀形成流程闭环。 | 无 completion manifest，不能机器断言计划节点、review、验证、artifact、provenance 全部齐备。 |

汇总：**满足 2 项，部分 8 项，不满足 6 项。** 这里的「满足」只表示仓库协作机制在该维度成熟，不代表通过严格 SGH 清单。

### 7.3 最强能力

1. **验证器优先于模型自报**：`graph-engineering.md:45-50`、`runbook.md:120-124` 和 `verify-quick.sh` 已形成可执行 output contract 的雏形。
2. **验证器也被验证**：`scripts/verify-context-canary.sh:4-17` 持续注错证明门禁会红，解决了普通 graph 框架常忽略的 validator reliability。
3. **上下文与 reviewer 隔离**：fresh、异构双审能减少执行者自我合理化，适合未来成为独立 verifier nodes。
4. **知识和进度真相源清楚**：`context/INDEX.md`、`TODO.md`、`.service-matrix.yaml` 各司其职，且 Git 提供审计历史。
5. **副作用已有授权边界**：不可逆动作和 subagent 禁令虽未类型化，至少比无 effect model 的通用 agent loop 更安全。

### 7.4 阻断 SGH 的核心缺口

按依赖顺序，而不是按视觉完整度排序：

1. **没有可解析图规范**：先定义 graph/plan schema，其他状态机和调度都无附着点。
2. **没有 typed run state 与节点状态机**：自然语言交接无法支持确定 ready-set、恢复和 replay。
3. **没有 runtime 与 append-only event log**：Git/CI 证明制品历史，但不能重建一次 agent run。
4. **没有有界恢复控制器**：E3 是 agent 行为策略，不是机械拒绝跳级的 recovery API。
5. **没有 graph checkpoint/replay 与副作用协议**：一旦崩溃恢复或重试写操作，就存在重复副作用风险。
6. **没有 graph version compatibility**：现在引入 checkpoint 而不先定义版本迁移，会很快制造不可恢复历史。

### 7.5 建议路线与不应做的事

**不建议直接把 ecommerce 改造成 SGH runtime。** 这会违背 `cordis-evaluation.md` 已定稿的边界，并把业务仓库绑到尚无社区标准的实验架构。更稳妥的研究路线是：

1. 在 ecommerce 之外建立 `graph-harness-lab`，或做成 DSH 独立 plugin；ecommerce 只作为真实任务 fixture，并继续输出 `AGENTS.md`、`context/` 与验证命令。
2. 第一阶段只实现低副作用图：`research -> evidence_check -> adversarial_review -> report`，不要从 deploy、push 或数据写入开始。
3. 先冻结一个最小 `GraphSpec v0`：plan identity/version、typed node I/O、edge/join、十状态或经论证的简化状态机、timeout/retry、effect class、output contract。
4. 再实现 deterministic ready-set、append-only event log、checkpoint/resume 和 completion manifest；随后加 retry/patch/replan 与 replay compatibility tests。
5. 用同一批真实任务做 Loop 与 Graph A/B：成功率、验证通过率、wall time、token/cost、人工介入、重复副作用、恢复成功率。没有收益证据就保留现有 Loop 路径。

不应把 `.service-matrix.yaml` 改名或复用成 agent graph；不应复活已经删除的 `.freeze/`；不应把存档 `graph-engineering.md` 当可执行规格；也不应仅因使用 LangGraph/AutoGen 就宣称符合 SGH。

## 8. 来源

所有来源访问日期均为 2026-09-03。

- [H1] Nous Research, *Hermes Agent Documentation*: https://hermes-agent.nousresearch.com/docs/
- [T1] Mitchell Hashimoto, *My AI Adoption Journey*（2026-02-05）: https://mitchellh.com/writing/my-ai-adoption-journey
- [T2] Vivek Trivedy / LangChain, *The Anatomy of an Agent Harness*（2026-03-10）: https://www.langchain.com/blog/the-anatomy-of-an-agent-harness
- [T3] OpenAI, *Harness engineering: leveraging Codex in an agent-first world*（2026-02-11）: https://openai.com/index/harness-engineering/
- [R1] Yao et al., *ReAct: Synergizing Reasoning and Acting in Language Models*（ICLR 2023）: https://arxiv.org/abs/2210.03629 ; project page: https://react-lm.github.io/
- [P1] Hu Wei, *From Agent Loops to Structured Graphs: A Scheduler-Theoretic Framework for LLM Agent Execution*, arXiv:2604.11378v1: https://arxiv.org/abs/2604.11378v1 ; full HTML: https://arxiv.org/html/2604.11378v1
- [P2] `yashs33244/loops_vs_agents`, unofficial SGH implementation experiment: https://github.com/yashs33244/loops_vs_agents
- [HG1] Hou et al., *Harness-G: A Graph-Structured Harness for Search Agents*, arXiv:2607.27652: https://arxiv.org/abs/2607.27652 ; author repository: https://github.com/7HHHHH/Harness-G
- [L1] LangChain, *LangGraph Graph API overview*: https://docs.langchain.com/oss/python/langgraph/graph-api
- [L2] LangChain, *LangGraph runtime (Pregel)*: https://docs.langchain.com/oss/python/langgraph/pregel
- [L3] LangChain, *LangGraph Interrupts*: https://docs.langchain.com/oss/python/langgraph/interrupts ; time travel: https://docs.langchain.com/oss/javascript/langgraph/use-time-travel
- [A1] Microsoft, *AutoGen GraphFlow (Workflows)*: https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/graph-flow.html
- [T4] Temporal, *Temporal Workflow*: https://docs.temporal.io/workflows ; Workflow Execution: https://docs.temporal.io/workflow-execution
- [T5] Temporal, *Safe deployments / replay testing*: https://docs.temporal.io/develop/safe-deployments
- [AN1] Anthropic, *Building effective agents*（2024-12-19）: https://www.anthropic.com/engineering/building-effective-agents
- [AN2] Anthropic, *Effective harnesses for long-running agents*（2025-11-26）: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

## 9. 证据质量说明

- arXiv 是作者原文，但 v1 preprint 不等于 peer review 或标准化。
- 官方产品文档证明供应方承诺和预期语义，不等于第三方可靠性验证。
- OpenAI 的百万行代码与生产效率数字是第一方案例自报，仅用于描述其 harness 实践，不用于证明普遍因果。
- 2026 年第三方博客中「某人 coined」的说法没有被纳入事实链；本文仅保留可由当事人原文支持的时间点和表述。
