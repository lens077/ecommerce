# context/project/ecommerce/ — 服务级知识

按**代码目录名**分模块。这一层高频演进、量最大，所以严格靠 INDEX 导航，不要遍历。

## 已有知识的模块

| module | 代码路径 | 内容 |
|---|---|---|
| [gateway](gateway/INDEX.md) | `../control-tower/services/gateway` | Casdoor 有状态 Session + OpenFGA 现行约束；JWT / 时钟偏移历史踩坑；健康检查被「兜底」代码清零 |
| [registry](registry/INDEX.md) | `backend/services/*/internal/pkg/registry/` | 存量 Consul TTL 注册与心跳；目标发现为生产 K8s Service DNS、开发 Docker Compose 服务名 |
| [config](config/INDEX.md) | `backend/services/*/internal/pkg/config/` + `../control-tower/services/config` | 一份配置三个副本；热更新的生效边界 |
| [behavior](behavior/INDEX.md) | `backend/services/behavior/` | 缺配置块导致 gorse 静默关闭 |
| [events](events/INDEX.md) | `backend/pkg/outbox/` + `backend/tools/outbox-relay/` | 存量 NATS 链与目标 Kafka + Outbox/Relay/Inbox + DLQ 的迁移边界、幂等与恢复约束 |
| [consumer](consumer/INDEX.md) | `frontend/apps/consumer/` | MUI spacing ×8 踩坑；购物车重复请求 |
| [merchant](merchant/INDEX.md) | `frontend/apps/merchant/` | ECharts 路由 chunk 的异步加载与拆分 |
| [frontend-api](frontend-api/INDEX.md) | `frontend/packages/api/` + `apps/*/src/api/` | Connect Query 数据拉取 SOP；transport 单例约束 |

## 尚无知识的模块

以下模块目前没有沉淀（不代表没有约束，只是还没踩到坑或还没写）。
读它们的代码前先看 `docs/design/` 对应服务目录和 `TODO.md` 的状态列。

**后端**：`user` `product` `cart` `order` `payment` `inventory` `search` `address` `merchant`
**前端**：`admin`、`desktop`（Tauri 壳）。配置中心前端已随 config 服务迁进 control-tower，本仓不再有 `config` app。

## 目录约定

```
{module}/
├── INDEX.md            入口
├── architecture.md     架构补充（可选，不与 docs/design/ 重复）
├── experience/         一坑一文件
└── sop/                标准操作规程（可选）
```

命名与分层判据见 [`context/harness-framework/knowledge-layering.md`](../../harness-framework/knowledge-layering.md)。

⚠️ `config` 指业务服务的配置加载层；配置控制面本体是合一仓 **control-tower** 的 `config` 服务
（`../control-tower/services/config`），**已切流上线**。集群里 `config-center` 这个 ns 与
Deployment 名只是没改的遗留标签，镜像早已是 `control-tower-config`——不要据此以为旧的
独立 config-center 还在跑。

⚠️ `gateway` 模块指的也是 control-tower 的网关（`../control-tower/services/gateway`）。
本仓原 `gateway/` 目录是 2026-08-23 退役的旧 kratos 分叉，已于 2026-08-24 删除，**不要往里链接**；历史见 tag `backup/pre-control-tower-20260823`。

⚠️ `frontend-api` 指前端的 API 访问层（`frontend/packages/api/`），**不是** `backend/api/` 的 proto 契约。
它和 `registry` 一样属于「跨多个代码目录的同一套代码」，所以按职责命名而不是按单一目录命名。
