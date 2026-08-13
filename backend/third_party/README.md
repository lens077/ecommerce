# third_party

buf 的模块根钉在 `backend/`（见 `backend/buf.yaml`，v2、无 modules），所有服务的
`make api` 一律从 `backend/` 根跑 `buf generate`——proto 里的
`import "third_party/validate/validate.proto"` 只会解析到**本目录**。

- `validate/` 是 **protovalidate**（`package buf.validate`，PGV 的继任者），不是 envoyproxy PGV；
- 历史上 address/cart/merchant/order/payment 五个服务目录下曾各有一份 `third_party/`
  副本，**从不参与构建**（死副本），其 README 已删；引用第三方 proto 一律指本目录。
