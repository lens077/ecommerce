# behavior

**代码路径**：`backend/services/behavior/`　**proto**：`backend/api/behavior/v1/behavior.proto`

行为埋点 + 推荐服务。接收前端 `@ecommerce/tracker` 上报的行为事件，投喂 gorse，
并对外提供推荐与相似商品。

## RPC

| RPC | 状态 |
|---|---|
| `Track` | 编译通过，待端到端实跑 |
| `Recommend` | 同上 |
| `SimilarItems` | 同上 |

gorse 侧语义与 product 目录同步已实测。共享客户端在 `backend/pkg/gorse/`。

## experience

| 症状 | 文件 |
|---|---|
| 推荐功能"没生效"但服务正常启动、无报错 | [consul-kv-missing-key-silent-disable.md](experience/consul-kv-missing-key-silent-disable.md) |

## 已知缺口（同步自 TODO.md）

- Consul KV `ecommerce/behavior/dev.yml` **仍缺 `recommend:` 块**，且当前内容是 cart 的派生版
  （带无用的 `store:` / `search:`）
- `ecommerce/product/dev.yml` 同样缺 `recommend:`
- gorse 里还有 `smoke-a/b/c` 测试数据待清理
- 用户画像（`/api/users` labels）尚未投喂
- consumer 前端尚未接入 tracker

## 相关

- proto 字段校验规范见 [`context/team/proto-design.md`](../../../team/proto-design.md)
  （`behavior.proto` 是本仓 buf.validate 用得最完整的一个，可作范本）
