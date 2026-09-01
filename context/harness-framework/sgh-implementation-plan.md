---
name: sgh-implementation-plan
layer: harness-framework
description: SGH（Structured Graph Harness，arXiv:2604.11378v1）执行层实施草案：DSH 侧三个 package 设计、ecommerce-solo-v1 兼容 profile、conformance 测试与七阶段实施顺序。设计草案，尚未实现
---

# SGH-compatible 个人仓库实施方案

> 状态：设计草案，尚未实现。
>
> 目标：为个人维护的 ecommerce 仓库提供一个可验证的 Structured Graph Harness（SGH）执行层，并以 `arXiv:2604.11378v1` 为明确兼容基线。
>
> 论文：https://arxiv.org/abs/2604.11378v1

## 1. 结论

个人仓库适合先做一个小而严格的 SGH 实现，但必须先明确两点：

1. 只增加文档、TODO、CI DAG 或流程图，不能称为 SGH-compatible。
2. SGH 目前不是正式标准，也没有认证机构；兼容性只能通过公开的 profile、conformance matrix 和自动测试自证。

建议使用带版本限定的表述：

```text
SGH-compatible with arXiv:2604.11378v1, ecommerce-solo-v1 profile
```

在完整支持 `any_of`、恢复升级、持久运行状态和副作用约束之前，只能使用：

```text
SGH core subset based on arXiv:2604.11378v1
```

不要使用没有版本和 profile 限定的「SGH compliant」或「社区认证 SGH」表述。

## 2. 实现放在哪个仓库

SGH runtime 主体建议建在：

```text
/Users/sumery/lens077/deepseek-harness
```

项目图模板和项目级契约建议放在：

```text
/Users/sumery/lens077/ecommerce
```

两个仓库的职责如下：

```text
ecommerce
  图模板、节点输入、输出契约、验证命令、仓库规则
                    │
                    ▼
DeepSeek Harness Structured Graph plugin
  Plan → Validate → Schedule → Execute → Recover → Persist
                    │
                    ▼
现有 DSH tools / skills / subagents / shell
```

- ecommerce 仍是「规则和任务提供方」。
- DeepSeek Harness 负责 agent runtime。
- `ecommerce/context/harness-framework/cordis-evaluation.md` 的「ecommerce 不内置常驻 runtime」结论仍然成立；只需补充「ecommerce 选择外部 SGH runtime」。
- 如果把 runtime 直接写进 ecommerce，就需要推翻现有决策，并在 ecommerce 的 evolution log 中记录触发原因、变更内容和验证方式。

规划、执行和恢复只需要是三个独立模块与上下文，不需要部署成三个进程或微服务。

## 3. DeepSeek Harness 当前已有的相关能力

DeepSeek Harness 已经是 Cordis plugin 架构：

- `/Users/sumery/lens077/deepseek-harness/docs/architecture.zh.md:11` 说明模型适配器、工具、会话日志和 agent loop 都是可替换 plugin。
- `/Users/sumery/lens077/deepseek-harness/docs/architecture.zh.md:17` 说明运行中的 DSH 是一棵 plugin tree。
- `/Users/sumery/lens077/deepseek-harness/docs/architecture.zh.md:59` 说明 Session Event 是可在重新加载后保留的持久事实。
- `/Users/sumery/lens077/deepseek-harness/docs/architecture.zh.md:102` 定义了 capability seam 的 Service Definition、Service Provider 和 Consumer 三种角色。

DSH 也已经有动态 workflow：

```text
packages/workflow/workflow
packages/workflow/workflow-worker-thread
packages/workflow/tool-workflow
```

但它不是 SGH：

- `packages/workflow/workflow/README.md:5` 明确说明它执行模型生成的 JavaScript orchestration script。
- `packages/workflow/workflow/src/runtime-types.ts:19` 的 `WorkflowStartRequest` 接收 `script: string`，控制流仍然藏在脚本里。
- `packages/workflow/workflow/README.md:56` 明确说明当前没有 journaling 或 resume。

因此，不应只在 `workflow-worker-thread` 中添加一个 `plan.ts`，然后继续由 JavaScript 脚本决定执行顺序。那仍然是动态 workflow，只是多了一个叫 `Plan` 的对象。

正确做法是保留现有动态工作流，同时增加新的 capability seam：

```text
ctx.workflowEngine
  现有动态 JavaScript workflow

ctx.structuredGraphEngine
  新增静态、可验证、版本化的 SGH runtime
```

## 4. DSH 中建议新增的 package

复用现有 `packages/workflow/` 分组，不新建无必要的顶层分组：

```text
/Users/sumery/lens077/deepseek-harness/packages/workflow/
├── structured-graph/              # Service Definition、公共类型和共享不变量
├── structured-graph-local/        # 本地执行 Provider
└── tool-structured-graph/         # 面向模型的 Consumer
```

为了不默认改变官方 `base` 组合，可以再增加一个显式启用的 bundle：

```text
/Users/sumery/lens077/deepseek-harness/packages/bundle/sgh/
├── package.json
└── cordis.patch.yml
```

个人 profile 选择加载该 bundle。初期不要直接把实验实现塞进 `packages/bundle/base`。

### 4.1 `structured-graph`

建议目录：

```text
packages/workflow/structured-graph/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts          # ctx.structuredGraphEngine 和 run handle interface
│   ├── types.ts          # Plan、Node、Edge、RunState、事件类型
│   ├── validate.ts       # DAG、join、contract、预算验证
│   └── invariant.ts      # 状态转移和事件序列不变量
└── tests/
    ├── validate.spec.ts
    └── invariant.spec.ts
```

该 package 负责稳定 interface，而不是执行细节。`Plan` 的 TypeScript 定义放在：

```text
packages/workflow/structured-graph/src/types.ts
```

浏览器安全的类型应像现有 `@deepseek-ai/dsh-workflow/types` 一样，通过 package subpath 单独导出，避免 UI 为读取运行记录而导入 Host 依赖。

### 4.2 `structured-graph-local`

建议目录：

```text
packages/workflow/structured-graph-local/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts
│   ├── engine.ts
│   ├── scheduler.ts
│   ├── state-machine.ts
│   ├── recovery.ts
│   ├── executor.ts
│   └── run-store.ts
└── tests/
    ├── scheduler.spec.ts
    ├── state-machine.spec.ts
    ├── recovery.spec.ts
    ├── resume.spec.ts
    └── conformance.spec.ts
```

该 package 负责：

- 验证并接收不可变 Plan。
- 根据依赖和节点状态计算 ready-set。
- 按确定性顺序调度节点。
- 调用 DSH subagent、tool 或 command adapter。
- 执行 timeout、retry budget 和恢复升级。
- 写入持久事件。
- 从事件重建运行状态并 resume。

### 4.3 `tool-structured-graph`

建议目录：

```text
packages/workflow/tool-structured-graph/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts
│   ├── types.ts
│   └── invariant.ts
└── tests/
    └── tool-structured-graph.spec.ts
```

可以向模型公开以下工具。名称只是建议，实施时需要经过 DSH 工具目录和命名检查：

```text
graph_validate
graph_run
graph_inspect
graph_resume
graph_cancel
```

模型工具只是 Consumer。计划验证、状态机和恢复规则必须留在 `ctx.structuredGraphEngine` 后面，不能在工具里重复实现。

## 5. `Plan` 是数据结构，不是目录结构

下面这段是字段层级图：

```text
Plan
├── id
├── version
├── parent_plan_id
├── content_hash
├── nodes[]
│   ├── id
│   ├── action_ref
│   ├── input_contract
│   ├── output_contract
│   ├── timeout
│   ├── retry_budget
│   ├── join_mode
│   └── side_effect_level
├── edges[]
└── output_contract
```

它表示：

- 一个 Plan 有一个 `id`。
- 一个 Plan 有一组 `nodes`。
- 每个 node 有自己的 `actionRef`、contract、timeout 和副作用等级。
- `nodes[]` 表示数组，不是 `nodes/` 目录。
- `├──` 只是可视化层级，不代表要创建同名文件。

它最终会表现为：

1. TypeScript interface；
2. runtime validator；
3. 一份可序列化的 JSON 数据；
4. 可选的人类可写 YAML 图模板。

### 5.1 与 SGH 论文形式定义的对应关系

论文中的计划为：

```text
Pi = (id, version, V, E, sigma, kappa)
```

对应关系如下：

| 论文符号 | 工程字段 |
|---|---|
| `id` | `plan.id` |
| `version` | `plan.version` |
| `V` | `plan.nodes` |
| `E` | `plan.edges` |
| `sigma` | 每个 node 的 action、contract、retry、timeout、side effect 配置 |
| `kappa` | `plan.outputContract` |

`contentHash`、父计划引用和 Git provenance 是生产增强字段，不是论文原始六元组的一部分。

### 5.2 DSH 中建议的实际 TypeScript 类型

DSH 现有代码使用 camelCase，因此正式类型不使用 `parent_plan_id`、`action_ref` 等 snake_case。

```ts
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'

export type PlanId = string
export type NodeId = string

export type JoinMode = 'all_of' | 'any_of'

export type SideEffectLevel =
  | 'pure'
  | 'read'
  | 'workspace_write'
  | 'external_write'
  | 'irreversible'

export interface PlanReference {
  readonly id: PlanId
  readonly version: number
  readonly contentHash: string
}

export interface GraphNode {
  readonly id: NodeId
  readonly actionRef: string

  readonly inputContract: ObjectJsonSchema
  readonly outputContract: ObjectJsonSchema

  readonly timeoutMs: number
  readonly retryBudget: number
  readonly joinMode: JoinMode
  readonly sideEffectLevel: SideEffectLevel
}

export interface GraphEdge {
  readonly from: NodeId
  readonly to: NodeId
}

export interface StructuredGraphPlan {
  readonly id: PlanId
  readonly version: number
  readonly parent?: PlanReference
  readonly contentHash: string

  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge[]
  readonly outputContract: ObjectJsonSchema
}
```

DSH 已有可复用的 `ObjectJsonSchema` 和 runtime validator：

```text
/Users/sumery/lens077/deepseek-harness/packages/core/tools/src/json-schema.ts
```

SGH plugin 应复用这套 JSON Schema 子集，不要重新发明另一套不兼容的 contract 方言。

`contentHash` 由 runtime 计算，不要求图模板作者手写。profile 必须明确 canonicalization 和 hash 范围；至少应排除 `contentHash` 字段本身，避免循环定义。

## 6. 不可变 Plan 与动态 RunState 必须分开

Plan 只保存静态执行承诺。运行中的节点状态、attempt、输出和失败不能写回 Plan。

错误示例：

```ts
plan.nodes[0].status = 'running'
plan.nodes[0].output = result
```

建议单独定义运行状态：

```ts
export type NodeStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'waiting_human'
  | 'blocked'
  | 'executed'
  | 'failed_retryable'
  | 'failed'
  | 'cancelled'
  | 'skipped'

export interface NodeRunState {
  readonly nodeId: NodeId
  readonly status: NodeStatus
  readonly attempt: number
  readonly startedAt?: string
  readonly finishedAt?: string
  readonly outputRef?: string
  readonly failureRef?: string
}

export interface GraphRunState {
  readonly runId: string
  readonly plan: PlanReference
  readonly nodes: Readonly<Record<NodeId, NodeRunState>>
  readonly terminalReason?: string
}
```

三类数据的职责如下：

```text
Plan
  静态、不可变、带版本和 hash

GraphRunState
  动态、由 append-only 事件投影得到

Artifacts
  节点输出、日志和验证结果，单独存储并通过引用关联
```

终态为：

```text
executed
failed
cancelled
skipped
```

终态必须是吸收态，runtime 必须拒绝从终态继续转移。

## 7. ecommerce 中保存什么

建议由 SGH plugin 建立一个新的项目约定，例如：

```text
/Users/sumery/lens077/ecommerce/.dsh/graphs/
├── research-review.graph.yaml
├── code-change.graph.yaml
└── verification.graph.yaml
```

注意：`.dsh/graphs/` 当前不是 DSH 已有的自动发现目录。只有新增 plugin 明确实现扫描、优先级和冲突规则后，该目录才具有语义。不能只创建目录，就声称 DSH 已经会读取它。

这里保存的是可复用「图模板」，不是每次运行生成的最终 Plan。

示例：

```yaml
name: research-review
version: 1

nodes:
  - id: research
    actionRef: subagent.research
    inputContract:
      type: object
      properties:
        question:
          type: string
      required: [question]
    outputContract:
      type: object
      properties:
        reportPath:
          type: string
      required: [reportPath]
    timeoutMs: 600000
    retryBudget: 1
    joinMode: all_of
    sideEffectLevel: workspace_write

  - id: review
    actionRef: subagent.review
    inputContract:
      type: object
      properties:
        reportPath:
          type: string
      required: [reportPath]
    outputContract:
      type: object
      properties:
        approved:
          type: boolean
      required: [approved]
    timeoutMs: 300000
    retryBudget: 0
    joinMode: all_of
    sideEffectLevel: read

edges:
  - from: research
    to: review

outputContract:
  type: object
  properties:
    approved:
      type: boolean
  required: [approved]
```

执行链为：

```text
GraphTemplate
  ↓ 解析、补齐、验证
StructuredGraphPlan(id, version, hash, 完整契约)
  ↓ 写入不可变事件
GraphRunState
  ↓ 状态转移事件
CompletionManifest
```

## 8. Plan 和运行状态保存在哪里

每次运行生成的 `plan.json` 不建议提交到 ecommerce。

个人版优先复用 DSH 现有的 append-only Session Event 日志，而不是一开始额外引入数据库：

```text
structured-graph/plan-created
structured-graph/plan-validated
structured-graph/node-transition
structured-graph/recovery-applied
structured-graph/plan-replaced
structured-graph/run-ended
```

每个事件至少携带：

```text
runId
planId
planVersion
planHash
nodeId（节点事件）
attempt（节点事件）
timestamp
reason
artifact references
```

这样可以：

- 使用 DSH 已有 session persistence。
- 在进程重启后从事件重建状态。
- 把 run 与父 agent session 关联。
- 为后续 Web 图视图提供同一事件来源。
- 避免在第一版同时维护 Session Event 和 SQLite 两套真相源。

只有在出现以下需求时，才提取独立 `GraphRunStore` seam：

- run 必须脱离父 session 独立存在；
- 需要跨 session 查询大量历史；
- Session Event 体积或检索方式不足；
- 需要独立 retention、归档或迁移策略。

届时可以增加 SQLite Provider 和内存测试 Provider。没有第二个真实实现需求前，不要提前制造一个只有单一 adapter 的浅 seam。

## 9. 必须补齐的 SGH 核心能力

### 9.1 定义兼容 profile

新增 `ecommerce-solo-v1` profile，明确：

- 对齐 `arXiv:2604.11378v1` 哪些章节；
- 哪些能力完整实现；
- 哪些能力暂未支持；
- 如何解释论文中的 `any_of` / `first_of` 语义张力；
- 什么条件下允许对外写「SGH-compatible」；
- 哪些是生产增强，而不是论文原始要求。

个人版建议：

- `any_of` 仅允许 `pure` / `read` 节点；
- 禁止带写副作用的竞速分支；
- `running` 兄弟节点的取消、忽略和 artifact 处理必须固定为一种可测试语义；
- 未完整实现并测试 `any_of` 前，只声明 SGH core subset。

### 9.2 验证不可变计划

运行前必须验证：

- DAG 无环；
- 每个节点可从入口到达；
- 每个节点可到达出口；
- edge 引用的节点存在；
- node id 唯一；
- `all_of` / `any_of` 配置合法；
- timeout 和 retry budget 有限；
- input/output contract 属于 DSH 支持的 JSON Schema 子集；
- action reference 能解析；
- side-effect level 与调度模式兼容。

运行开始后：

- `(V,E)` 不可修改；
- 重规划生成新 Plan version；
- 原 Plan 仍保留在事件日志；
- 新旧 Plan 通过父引用关联；
- Plan hash 与 Git commit 或 workspace snapshot 绑定。

### 9.3 实现节点状态机与 ready-set

核心规则：

- `pending → ready` 只能由依赖和 join 规则触发；
- `ready → running` 只能由 scheduler dispatch 触发；
- `running → executed` 必须通过 output contract；
- transient failure 进入 `failed_retryable`；
- budget 耗尽或结构失败进入 `failed`；
- 高副作用审批进入 `waiting_human`；
- 非法状态转移必须由 runtime 拒绝；
- 多个 ready nodes 按稳定顺序调度；
- 并行节点不能无规则地同时写同一 workspace；
- 每个状态变化写入 append-only event log。

调度逻辑必须独立于模型。模型负责节点内容，不能自行宣布依赖已经满足或选择下一个可执行节点。

### 9.4 Planner、Runtime、Recovery 分离

建议 interface：

```text
Planner
  plan(intent | template) -> Plan

Runtime
  validate(plan) -> ValidatedPlan
  run(validatedPlan) -> RunResult
  resume(runId) -> RunResult

Recovery
  diagnose(failure, diagnosticContext) -> RecoveryDecision
```

初版可以：

- 使用手写 GraphTemplate 代替 LLM Planner；
- 使用确定性错误分类代替 LLM diagnoser；
- Planner、Runtime、Recovery 在同一进程内运行；
- 通过独立模块、类型和上下文实现职责隔离。

上下文必须分离：

- 节点执行只看到输入、允许的 artifact、剩余预算和允许的工具；
- Recovery 才能看到失败史、旧计划和诊断信息；
- 失败史不能直接塞回原节点执行 session；
- 需要把诊断结果传给后续执行时，必须通过 replan 产生新版本；
- 每个 LLM 节点优先使用 fresh/隔离 session，而不是复用 captain 的完整上下文。

### 9.5 实现有界恢复协议

恢复只能依次升级：

```text
local_retry
    ↓
local_patch
    ↓
request_replan
```

每个节点记录：

```text
recoveryState:
  pristine | retried | patched
```

runtime 必须拒绝：

- 未 retry 就 patch；
- 未 patch 就 request replan；
- 超出 retry budget 后继续执行；
- timeout 后仍保持 `running`；
- `waiting_human` 永久不结束；
- 绕过恢复接口直接改状态。

初版可以使用确定性错误分类：

| 类型 | 示例 | 默认恢复 |
|---|---|---|
| `transient` | 网络、临时进程失败 | local retry |
| `contract` | 输出 schema 或验证命令失败 | local patch |
| `structural` | 依赖缺失、计划错误 | request replan |
| `policy` | 权限或人工审批未通过 | waiting human / cancel |

### 9.6 类型化副作用

复用 ecommerce 的授权纪律，但把它变成 Plan 中的机器字段：

```text
pure
read
workspace_write
external_write
irreversible
```

建议规则：

- `pure` / `read` 可以并行和安全重试；
- `workspace_write` 必须持有 workspace write lock；
- 并行 writer 必须证明目标不冲突，否则串行执行；
- `external_write` 必须携带 `effectId` / idempotency key；
- `irreversible` 必须进入 `waiting_human`；
- subagent 永远不能执行 `irreversible`；
- retry 前必须判断副作用是否已经发生；
- 失败后使用 compensation 或 reconciliation，不能假设「调用失败即未执行」。

### 9.7 完成证明

运行结束时生成 Completion Manifest：

```text
runId
planId
planVersion
planHash
gitSha
terminalReason
nodeResults
verificationResults
reviewArtifact
startedAt
finishedAt
```

Completion Manifest 缺少必需节点、验证结果或 review artifact 时，run 不能进入成功终态。

不再把「聊天结束」「父 agent 输出最终消息」或「进程退出码为 0」单独等同于整个 SGH run 完成。

## 10. 必须有的 Conformance Tests

在自称 compatible 前，自动测试至少覆盖：

1. 拒绝环、不可达节点和非法 join。
2. 拒绝未知 action、非法 contract 和无限预算。
3. 同一 Plan 和相同节点结果产生相同调度轨迹。
4. 非法状态转移被拒绝。
5. 终态不可离开。
6. 多 ready-node 正确并行。
7. `all_of` 和 profile 选定的 `any_of` 语义。
8. timeout、retry budget 和 human-wait timeout。
9. recovery 不能跳级。
10. local patch 不改变 `(V,E)`。
11. replan 必须生成新版本并保留旧版本。
12. 输出契约失败不能进入 `executed`。
13. crash 后 resume 不重复已完成节点。
14. 写副作用重试不会重复提交。
15. Session Event 完整回放与实时追加得到相同 RunState。
16. Completion Manifest 缺验证或 reviewer 时不能成功。
17. 每条论文要求都能映射到一个实现位置和自动测试。

建议提供一个命令，例如：

```text
sgh conformance
```

输出：

```text
conformance.json
conformance.md
```

其中包含：

- profile 版本；
- SGH 论文章节；
- 实现位置；
- 测试位置；
- pass/fail/unsupported；
- 已知语义解释和偏差。

## 11. 个人仓库可以省掉什么

可以省：

- 分布式调度器；
- Redis、Kafka、Kubernetes worker；
- 高可用和多副本；
- 多租户和组织级 RBAC；
- Web 图编辑器和监控大盘；
- 动态子图、递归图和图优化器；
- 多种 Planner 或 Model Provider；
- 独立云数据库；
- 第一版的 SQLite RunStore；
- 第一版的 LLM Planner 和 LLM Recovery Diagnoser。

不能因为是个人仓库而省：

- 不可变计划版本；
- DAG 验证；
- 节点状态机；
- ready-set；
- Planner、Runtime、Recovery 的职责与上下文分离；
- 有界 retry、timeout 和 human wait；
- 恢复升级协议；
- 输出契约；
- 副作用安全；
- 可审计事件；
- resume 语义；
- conformance tests。

## 12. 推荐实施顺序

### 阶段 1：兼容 profile 和测试向量

先完成：

- `ecommerce-solo-v1` profile；
- Plan、Node、Edge 和 RunState 类型；
- JSON Schema 约束；
- `any_of` 解释；
- conformance test cases；
- 一张最小手写只读图。

不要先写 LLM Planner。

### 阶段 2：纯 runtime

使用 fake action adapter，实现：

- Plan validator；
- 节点状态机；
- deterministic ready-set scheduler；
- `all_of`；
- timeout 和 retry budget；
- append-only 内存事件投影。

### 阶段 3：恢复和副作用

实现：

- retry → patch → replan；
- recovery state；
- `waiting_human`；
- side-effect policy；
- workspace write lock；
- effect/idempotency key。

### 阶段 4：DSH 持久化接入

实现：

- Structured Graph Session Event；
- 从完整事件日志重建 RunState；
- 从中断前缀 resume；
- Completion Manifest；
- cold replay 与 live append 等价测试。

### 阶段 5：DSH 执行 adapter

接入：

- `ctx.subagents`；
- scoped tools；
- fresh node session；
- node output schema；
- cancellation signal；
- artifact references。

先运行低副作用图：

```text
research → evidence_check → adversarial_review → report
```

### 阶段 6：ecommerce 试点

再增加：

```text
inspect → plan → edit → verify → review → report
```

必须先通过 crash、retry、idempotency 和 workspace writer 冲突测试，再开放代码修改节点。

### 阶段 7：兼容声明

发布以下三向映射后，才使用带版本限定的 SGH-compatible 标签：

```text
论文要求 ↔ 实现位置 ↔ 自动测试
```

## 13. 最终完成标准

满足以下条件后，才认为第一版完成：

- fresh checkout 可以加载 SGH bundle；
- 可以验证一份项目 GraphTemplate；
- 可以编译并保存不可变 Plan；
- 相同输入和节点结果产生相同调度轨迹；
- 非法 DAG、状态转移和恢复跳级会被拒绝；
- 进程中断后可以从事件日志 resume；
- resume 不会重复已经确认的副作用；
- 所有成功节点都通过 output contract；
- Completion Manifest 绑定 Plan hash 和 Git SHA；
- conformance matrix 中没有未披露的 unsupported 项；
- 文档只使用带论文版本和 profile 的兼容声明。

最重要的起点不是写 Planner，而是：

> 先固定 profile 和 conformance tests，再用手写静态图完成一个纯 runtime。

这条路径最适合个人仓库，也最不容易最后只得到一套「看起来像图」的文档。
