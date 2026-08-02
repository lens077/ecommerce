# context/project/ecommerce/ — 服务级知识

按**代码目录名**分模块。这一层高频演进、量最大，所以严格靠 INDEX 导航，不要遍历。

## 已有知识的模块

| module | 代码路径 | 内容 |
|---|---|---|
| [gateway](gateway/INDEX.md) | `gateway/` | JWT / 时钟偏移踩坑；重试相乘与健康检查失效 |
| [registry](registry/INDEX.md) | `backend/services/*/internal/pkg/registry/` | Consul TTL 注册与心跳（11 份同一套代码） |
| [behavior](behavior/INDEX.md) | `backend/services/behavior/` | Consul KV 缺键导致 gorse 静默关闭 |
| [consumer](consumer/INDEX.md) | `frontend/apps/consumer/` | MUI spacing ×8 踩坑；购物车重复请求 |

## 尚无知识的模块

以下模块目前没有沉淀（不代表没有约束，只是还没踩到坑或还没写）。
读它们的代码前先看 `Design.md` 对应章节和 `TODO.md` 的状态列。

**后端**：`user` `product` `cart` `order` `payment` `inventory` `search` `address` `merchant` `config`
**前端**：`merchant` `admin` `config-fe`

## 目录约定

```
{module}/
├── INDEX.md            入口
├── architecture.md     架构补充（可选，不与 Design.md 重复）
├── experience/         一坑一文件
└── sop/                标准操作规程（可选）
```

命名与分层判据见 [`context/harness-framework/knowledge-layering.md`](../../harness-framework/knowledge-layering.md)。

⚠️ `config` 指后端配置中心服务（`backend/services/config/`），前端配置中心用 `config-fe`（`frontend/apps/config/`）。
