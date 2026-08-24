# behavior

**代码路径**：`backend/services/behavior/`　**proto**：`backend/api/behavior/v1/behavior.proto`

行为埋点 + 推荐服务。接收前端 `@ecommerce/tracker` 上报的行为事件，投喂 gorse，
并对外提供推荐与相似商品。

## RPC

| RPC | 状态 |
|---|---|
| `Track` | 已部署，**仍未被调用过** |
| `Recommend` | 同上 |
| `SimilarItems` | 同上 |

⚠️ **「Deployment 起着」不等于「跑通了」**。2026-08-24 复核：behavior 已上线 2d16h，
但四个 Pod 的日志里 `rpc completed` **只有 `/telemetry.v1.TelemetryService/CollectWebVitals`**
（同进程复用的另一个服务），`/behavior.v1.BehaviorService/*` 三个过程一条都没有。
真正的堵点在调用方：consumer 前端还没接 tracker（见下）。

gorse 侧语义与 product 目录同步已实测。共享客户端在 `backend/pkg/gorse/`。

## experience

| 症状 | 文件 |
|---|---|
| 推荐功能"没生效"但服务正常启动、无报错 | [consul-kv-missing-key-silent-disable.md](experience/consul-kv-missing-key-silent-disable.md) |

## 已知缺口（同步自 TODO.md）

- ~~缺 `recommend:` 块~~ **已解决**：Consul KV 于 2026-08-08 退役，配置改由 Config Center
  `behavior/<env>/bootstrap.yaml` 承载；且 2026-08-18 起 `recommend` 是
  `required = true` 的硬门禁，缺它服务**根本起不来**。线上日志有
  `gorse client initialized {"endpoint": "https://gorse.apikv.com"}`，可证该段已配齐。
- ⚠️ 但 `api_key` 按硬规则 4 在仓库里留空，真值必须灌进 Config Center，
  否则业务调用全 401（见 TODO.md）。这是「配置存在」与「配置可用」的差别。
- gorse 里还有 `smoke-a/b/c` 测试数据待清理
- 用户画像（`/api/users` labels）尚未投喂
- consumer 前端尚未接入 tracker

## 相关

- proto 字段校验规范见 [`context/team/proto-design.md`](../../../team/proto-design.md)
  （`behavior.proto` 是本仓 buf.validate 用得最完整的一个，可作范本）
