# context — 知识路由

规范本体分四层，本文件只做路由；逐篇清单在各层自己的 `INDEX.md`。

| 层 | 放什么 | 何时写 |
|---|---|---|
| [team/](team/INDEX.md) | 所有人共用的工程约定、环境查法、提交规范 | 约定变化时 |
| [harness-framework/](harness-framework/INDEX.md) | 门禁机制、执行策略、消费边界 | 改 harness 时 |
| [decisions/](decisions/INDEX.md) | 已做决策与替代方案；按 proposed / implemented 分目录 | 做不可逆或影响面大的决定时 |
| [project/](project/INDEX.md) | 本项目的领域知识、模块经验 | 沉淀项目特有事实时 |

规则：

- 一篇文档只属于一层；跨层的内容拆开写，用链接连接。
- 新增文档必须同时登记到本层 `INDEX.md`，否则 `ORPHAN` 会红。
- 文档首行是 `---` 的 frontmatter，至少写 `name`（等于文件名）、`layer`（等于所在目录）、`description`。
