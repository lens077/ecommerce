# context/ — 知识库索引

三层知识体系。AI 按 **团队 → 框架 → 项目 → 模块** 的路径逐层缩小范围，不需要遍历全仓。
每一层都有 `INDEX.md` 作为入口。

```
context/
├── team/                       团队级（最稳定）—— 所有工作必须遵循
├── harness-framework/          框架工程级（中频）—— AI 协作机制本身
└── project/ecommerce/          服务级（高频、量最大）—— 各模块的架构与踩坑
```

## 团队级 · [context/team/](team/INDEX.md)

| 文件 | 一句话 |
|---|---|
| [git-commit.md](team/git-commit.md) | Conventional Commits + 提交前必须先更新 TODO.md |
| [proto-design.md](team/proto-design.md) | 写 proto 前先读设计文档，每个字段都要有 buf.validate 约束 |
| [local-env.md](team/local-env.md) | 本地集群地址：Consul 用 `192.168.3.112:8500`，不要用 consul.app.com |

## 框架工程级 · [context/harness-framework/](harness-framework/INDEX.md)

| 文件 | 一句话 |
|---|---|
| [knowledge-layering.md](harness-framework/knowledge-layering.md) | 一条知识该写进哪一层的判定规则 |
| [self-refinement.md](harness-framework/self-refinement.md) | 纠错 → 判断模式性 → 沉淀 → 下次复用的闭环 |

## 服务级 · [context/project/ecommerce/](project/ecommerce/INDEX.md)

按模块分目录，每个模块下的 `experience/` 放踩坑记录。目前有记录的模块：

| 模块 | 代码路径 | experience |
|---|---|---|
| gateway | `gateway/` | [JWT nbf 时钟偏移导致登录死循环](project/ecommerce/gateway/experience/jwt-nbf-clock-skew-loop.md) |
| config | `backend/services/*/internal/pkg/config/` | [一份配置三个副本](project/ecommerce/config/experience/three-copies-of-one-config.md)、[热更新的生效边界](project/ecommerce/config/experience/config-hot-reload-boundaries.md) |
| behavior | `backend/services/behavior/` | [Consul KV 缺 recommend 块导致 gorse 静默关闭](project/ecommerce/behavior/experience/consul-kv-missing-key-silent-disable.md) |
| consumer | `frontend/apps/consumer/` | [MUI sx spacing 被 ×8](project/ecommerce/consumer/experience/mui-spacing-tokens-8x.md) |

## 结构真相源 · [`.service-matrix.yaml`](../.service-matrix.yaml)（仓库根）

不属于「知识」而属于「事实表」的东西放这里，供 AI 与 CI 查表：11 个后端服务的
Consul 注册名、网关路径前缀、依赖关系、外部依赖、KV 键、前端 4 个 app 的端口。

判据：**AI 每次都要现搜一遍的结构性事实** → 进 matrix；**需要解释「为什么」的经验** → 进 `context/`。

⚠️ `depends_on` 是代码里真的接线了，`depends_on_planned` 是设计要求但尚未接线。别混。

## 检索约定

- **不要全仓 grep 找规范**。先看本文件 → 进对应层的 `INDEX.md` → 再进具体文件。
- **不要全仓 grep 找服务拓扑**。查 `.service-matrix.yaml`。
- 找模块知识时路径是 `context/project/ecommerce/{module}/`，`{module}` 用**代码目录名**（`gateway` / `behavior` / `consumer`），不是服务的中文名。
- 找不到对应知识 ≠ 没有约束。先读 `Design.md` / `TODO.md`，读完把结论沉淀回来（见 self-refinement）。

## 与 `~/.claude` memory 的关系

`context/` 是**唯一真相源**（可 diff、可 review、可 rollback、换 AI 工具不丢）。
`~/.claude/.../memory/` 只保留一句话摘要 + 指向本目录的链接，避免两处口径漂移。
