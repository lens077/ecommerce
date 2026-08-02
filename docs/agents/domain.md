# Domain Docs

各个工程 skill 在探索代码前，应该怎么读本仓库的领域文档。

本仓库是 **multi-context**（11 个后端 Go 服务 + 5 个前端 app），但**不使用** skill 的默认布局
（根目录 `CONTEXT-MAP.md` / `CONTEXT.md` / `docs/adr/`）。这些角色已经由既有的 `context/`
三层知识库承担。**不要新建 `CONTEXT.md`、`CONTEXT-MAP.md` 或 `docs/adr/`** —— 那会造成
两处口径漂移，正是 `context/INDEX.md` 明令避免的。

## 概念映射

| skill 里的说法 | 本仓库的实际位置 |
|---|---|
| 根目录 `CONTEXT-MAP.md` | [`context/INDEX.md`](../../context/INDEX.md) |
| 每个 context 的 `CONTEXT.md` | `context/project/ecommerce/{module}/`（入口是该目录的 `INDEX.md`） |
| 系统级 `docs/adr/` | `context/team/` + `context/harness-framework/` |
| context 级 `src/<ctx>/docs/adr/` | `context/project/ecommerce/{module}/adr/`（按需懒建） |
| （无对应）| [`.service-matrix.yaml`](../../.service-matrix.yaml) —— 服务拓扑事实表 |

`{module}` 用**代码目录名**（`gateway` / `behavior` / `consumer`），不是服务的中文名。

## 探索前先读这些

1. [`context/INDEX.md`](../../context/INDEX.md) —— 总入口，按「团队 → 框架 → 项目 → 模块」
   逐层缩小范围。
2. `context/team/` —— 团队级约束，所有工作都要遵循（proto 设计、提交规范、本地环境地址）。
3. 与本次改动相关的模块目录 `context/project/ecommerce/{module}/`，含其 `experience/` 踩坑记录
   和 `adr/`（若存在）。
4. [`.service-matrix.yaml`](../../.service-matrix.yaml) —— 需要服务注册名、网关前缀、依赖关系、
   外部依赖、Consul KV 键、前端端口时查这里。

**不要全仓 grep 找规范或拓扑。** 走上面的路径。

某个文件不存在时**静默继续**，不要提示缺失、也不要建议提前创建。`/domain-modeling`
（经 `/grill-with-docs`、`/improve-codebase-architecture` 到达）会在术语或决策真正被确定下来时
懒创建它们。

## 使用词表里的词

输出中提到某个领域概念时（issue 标题、重构提案、假设、测试名），用 `context/` 里已定义的说法。
不要漂移到知识库明确回避的同义词。

需要的概念还不在词表里，本身就是个信号 —— 要么你在发明这个项目不用的语言（重新考虑），
要么确实有缺口（记下来交给 `/domain-modeling`）。

## 与 ADR 冲突时要挑明

输出与既有 ADR 或 `context/` 里的既定结论相抵触时，显式指出，不要静默覆盖：

> _与 `context/team/proto-design.md` 的结论相抵触 —— 但值得重开讨论，因为……_

## 结论怎么回流

踩到坑之后，先判断是「模式性教训」还是「一次性 diff」：前者写进 `context/` 对应层
（判定规则见 `context/harness-framework/knowledge-layering.md`，闭环见
`context/harness-framework/self-refinement.md`），后者不写。

结构性事实（每次都得现搜一遍的那种）进 `.service-matrix.yaml`；
需要解释「为什么」的经验进 `context/`。
