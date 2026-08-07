# context/project/ecommerce/ — 服务级知识

按**代码目录名**分模块。这一层高频演进、量最大，所以严格靠 INDEX 导航，不要遍历。

## 已有知识的模块

| module | 代码路径 | 内容 |
|---|---|---|
| [gateway](gateway/INDEX.md) | `gateway/` | JWT / 时钟偏移踩坑；重试相乘与健康检查失效 |
| [registry](registry/INDEX.md) | `backend/services/*/internal/pkg/registry/` | Consul TTL 注册与心跳（10 份同一套代码） |
| [config](config/INDEX.md) | `backend/services/*/internal/pkg/config/` + `../config-center` | 一份配置三个副本；热更新的生效边界 |
| [behavior](behavior/INDEX.md) | `backend/services/behavior/` | Consul KV 缺键导致 gorse 静默关闭 |
| [consumer](consumer/INDEX.md) | `frontend/apps/consumer/` | MUI spacing ×8 踩坑；购物车重复请求 |
| [frontend-api](frontend-api/INDEX.md) | `frontend/packages/api/` + `apps/*/src/api/` | Connect Query 数据拉取 SOP；transport 单例约束 |

## 尚无知识的模块

以下模块目前没有沉淀（不代表没有约束，只是还没踩到坑或还没写）。
读它们的代码前先看 `docs/design/` 对应服务目录和 `TODO.md` 的状态列。

**后端**：`user` `product` `cart` `order` `payment` `inventory` `search` `address` `merchant`
**前端**：`merchant` `admin`（配置中心前端已随 config-center 迁出本仓）

## 目录约定

```
{module}/
├── INDEX.md            入口
├── architecture.md     架构补充（可选，不与 docs/design/ 重复）
├── experience/         一坑一文件
└── sop/                标准操作规程（可选）
```

命名与分层判据见 [`context/harness-framework/knowledge-layering.md`](../../harness-framework/knowledge-layering.md)。

⚠️ `config` 指业务服务的配置加载层；配置中心本体在独立仓 `../config-center`。

⚠️ `frontend-api` 指前端的 API 访问层（`frontend/packages/api/`），**不是** `backend/api/` 的 proto 契约。
它和 `registry` 一样属于「跨多个代码目录的同一套代码」，所以按职责命名而不是按单一目录命名。
