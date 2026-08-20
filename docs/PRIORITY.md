# 优先级（按最终目标排序）

> **本文件不是新的进度真相源**。进度真相仍以 [`TODO.md`](../TODO.md) 为准，本文件只回答一个问题：
> **同一时刻只能做一件事时，先做哪个。**
> 每条都带 `TODO.md` 出处行号；两边冲突时以 `TODO.md` 为准，并回来订正本文件。
>
> 生成时间：2026-08-20。依据 `TODO.md` 全文 + `PRODUCT.md` 目标定义 + 抽样代码核实。

---

## 一、最终目标与排序依据

**最终目标**（`PRODUCT.md` §Product Purpose）：按真实商业产品标准交付一个**淘宝/京东式 B2B2C 综合商城**，三端并重。
成功判据 = **消费者顺畅完成购买决策，商家高效完成经营闭环**。

`TODO.md` §四把它拆成四阶段：①核心交易 MVP → ②商家与平台能力 → ③性能与高可用 → ④营销与分析。
**当前实况：卡在第一阶段，且交易闭环是断的**——下单是假成功、库存扣减是空操作、地址服务可越权。

排序依据（按此五条判定，不服可直接改这五条，下面的排序会跟着变）：

1. **正在骗人的 > 没做的**。假成功/越权已经在线上产出错误结果，比"未实现"危险得多——不会在联调暴露，只在上量后以超卖、丢单、数据泄露爆发。`payment` 显式返回 `Unimplemented` 是本仓的正确示范。
2. **公网可达的安全问题不排队**。弱口令 + 明文 + `0.0.0.0/0` 的组合不管功能做到哪一步都得先堵。
3. **挡住闭环的 > 锦上添花的**。第一阶段交付物优先于第二阶段能力。
4. **代价低、收益大的插队**。例：删掉 address 的 ES 依赖是半小时的活，换回一个 CrashLoop 的服务，且它是交易闭环必经的一环。
5. **已完成的保留在原层级划删除线**，用来显示每条线走到哪、下一步接在谁后面。

---

## 二、优先级总览

| 层级 | 主题 | 未完成 | 为什么在这个位置 |
|---|---|---|---|
| **P0** | 立即止血：公网凭据与越权 | 8 | 现在就能被人拿库、读改删他人隐私地址 |
| **P1** | 假成功：调用成功但结果是错的 | 10 | 上量即超卖/丢单；比未实现更难发现 |
| **P2** | 恢复完整可用与发布链路 | 6 | 集群 8/10、前端流水线全是死引用 |
| **P3** | 核心交易闭环（第一阶段 MVP） | 14 | 最终目标的必经之路 |
| **P4** | 交付与基础设施稳定 | 17 | 保住已有成果不退化（告警已断、证书 10-27 到期） |
| **P5** | 可观测性补齐 | 13 | 出事能不能查出来 |
| **P6** | 第二阶段：商家与平台能力 | 9 | B2B2C 的另一半，但闭环不通做它没意义 |
| **P7** | 工程债与文档 | 10 | 不挡路，但会持续拖慢上面每一条 |

---

## P0 · 立即止血：公网凭据与越权

> 判据：**不需要任何前置条件，现在就能被利用**。这批不该排在任何功能之后。

- [ ] **node1 PostgreSQL 对全网开放 + 明文 + `***REMOVED-PASSWORD***` 弱口令** — 比 Redis 更糟（Redis 至少已上 TLS + 40 位随机密码）。同一张 `*.apikv.com` 证书可直接用于 `ssl_cert_file`，改法参照已完成的 Redis 那条；密码一并轮换。<sub>TODO L445</sub>
- [ ] **Redis 61246 对 `0.0.0.0/0` 开放**，且 `protected-mode no` 仍在 — 用户明确要求测试期公网可达，但公网 Redis 会被持续扫描。上线前必须把 `CidrBlock` 收窄回实际来源。<sub>TODO L443</sub>
- [ ] **address 服务全线越权（安全 BLOCKER）** — 已代码核实：`GetAddressByID` / `UpdateAddress` / `DeleteAddress` / `SetDefaultAddress` 四条 SQL **只按 `address_id` 过滤，无 user 归属校验**（`internal/data/queries/query.sql:13,45,53,69`），`CreateAddress` 的 `user_id` 直接取自请求体；网关又整段放行 `AddressService/*`。任何登录用户遍历到 UUID 即可读改删他人隐私地址。修法：user 一律取自网关注入的身份头 + 所有查询加 `AND user_id = ?` + 网关策略收敛到 RPC 粒度。<sub>TODO L64, L304</sub>
- [ ] **商家审批全表 UPDATE** — `merchant.sql:23` 没有 WHERE 子句，repo 层还丢弃了 `ApplicationId`：批准一份申请 = 把**所有**待审申请一起改成 approved。<sub>TODO L65, L306</sub>
- [ ] **登录 token 落日志** — 删掉 `user/internal/data/user.go:39` 的 `u.l.Debug(token.AccessToken)`。一行改动。<sub>TODO L308</sub>
- [ ] **fluent-bit PII 脱敏形同虚设（P0 安全）** — 手机号 Lua 模式用了不支持的 `{n}` 量词=空操作；`Merge_Log On`+`Keep_Log On` 保留原始明文 `log` 字段，连有效的 email 脱敏也被绕过，**完整未脱敏 JSON 整条进 Loki**。还漏掉 payment 的 `form_data`、RUM 的 `user_id`、debug 日志里的 bearer token。<sub>TODO L386</sub>
- [ ] **凭据轮换（历史泄露）** — 11 份含明文凭据的配置文件曾被 git 跟踪（PG/Redis/ES 密码、Casdoor `client_secret`、证书）；各服务 `*-db-secret` 的口令同样在历史里。停止跟踪 ≠ 已安全，**必须轮换**。<sub>TODO L16, L108</sub>
- [ ] **Casdoor 密码策略只有 `AtLeast6`**，且无 IP 限制。<sub>TODO L286</sub>

**同层级已完成**

- [x] ~~**网关无条件剥离入站 `x-md-global-*` 再按验签重注入**~~ — 2026-08-19 落地（`middleware/jwt/jwt.go:226` `stripInboundIdentity`，在白名单判断之前），补了回归测试 + 反证。此前 10 条免鉴权路径上客户端自带的身份头会原样到下游，等于任何人可自称任何人。<sub>TODO L18</sub>
- [x] ~~**前端 PKCE 直连 + 令牌移出 localStorage**~~ — `client_secret` 不再出现在浏览器；access/refresh 双双不落盘；桌面端 state 由写死 `appName` 改随机（此前等于没有 CSRF 防护）。<sub>TODO L18</sub>
- [x] ~~**删掉 `localStorage.user`**~~ — PII 无限期留盘且登出带不走，还是未经验证的输入。改从 JWT 派生。顺带修掉"登出后会自己登回去"（漏 `stopRenew()`）与 `setAccount({})` 什么都清不掉。<sub>TODO L256</sub>
- [x] ~~**彻底登出**~~ — 跳 Casdoor `end_session_endpoint` 并带 `id_token_hint`；登录入口两套机制混用（SDK 老路径不生成 code_verifier）一并修掉。<sub>TODO L408</sub>
- [x] ~~**gorse / MinIO / harbor 鉴权与 TLS**~~、~~**node1 Redis TLS + 强随机密码**~~、~~**公网 docker 端口随机化**~~ — 2026-08-19 完成。<sub>TODO L405-407, L441-442, L444</sub>

---

## P1 · 假成功：调用会「成功」但结果是错的

> 判据：**不会在联调暴露**，只在上量后以超卖、丢单的形式爆发。
> 全文见 `docs/reviews/ADVERSARIAL_REVIEW_20260806.md`。

- [ ] **库存 `Reserve` 静默无操作** — 已代码核实仍是四处叠加：①传 `Version: stock.Version+1` 而 SQL 是 `AND version = @version`，**WHERE 比对未来版本号 → 永远命中 0 行**；②`_, reserveErr :=` 丢弃行数，0 行不报错；③`Quantity: stock.Available-item.Quantity` 传给 `available = available - @quantity`，语义颠倒；④错误分支传恒为 nil 的 `err` 而非 `reserveErr`。净效果：**返回成功、库存不变、change_log 写入伪造流水**。注释声称的事务/回滚并不存在。接上 TCC-Try 即必然超卖。<sub>TODO L57, L297</sub>
- [ ] **库存 `ReleaseReserve` 是 `panic("implement me")`**（`inventory.go:89`）— 接上取消/超时补偿即每单必炸。实现或至少改成显式 `Unimplemented`。<sub>TODO L299</sub>
- [ ] **`CreateOrder` 返回假成功** — 已代码核实：service 层把 `req` 整个注释掉、硬编码 `CartItemIDs: nil, AddressID: 0`（`service/order.go:31`），application 层直接返回空响应。而**结算页已真实接线**，用户会看到「下单成功」但系统里没有订单、购物车未清、库存未占。**先改成显式 `CodeUnimplemented` 止血**，再实现主体。<sub>TODO L55, L300</sub>
- [ ] **`CompleteOrder` 不落库** — `SaveOrder` 只打一行 debug 日志就返回 nil，`OrderCompleted` 事件却照发。持久化成功前不得发布事件。<sub>TODO L302</sub>
- [ ] **`AddProductToCart` 必然失败** — INSERT 缺 `shop_name`。需先定契约（补字段 or schema 默认值）。<sub>TODO L309</sub>
- [ ] **`UpdateCartItemQuantityParams` 缺 Quantity 字段** — 即便前端接上也改不了数量。<sub>TODO L311</sub>
- [ ] **商家 `RejectApplication`/`ActivateMerchant` 是 panic 桩** — 网关已按 RPC 粒度放行给 admin，调用即 panic。<sub>TODO L312</sub>
- [ ] **网关重试可复制非幂等写** — `proxy.go:263-310`。ConnectRPC 全是 POST、无幂等保证。补 `requestId` 幂等键，或对非幂等方法关闭重试。<sub>TODO L313</sub>
- [ ] **下单防重的 `requestId` 从来没生效过** — 旧代码用 cast 假装 proto 有这个字段，UUID 运行时直接被丢掉。与上一条一起做。<sub>TODO L344</sub>
- [ ] **给上述路径补测试** — 本轮 22 条发现**全部位于零覆盖路径上**，而 `go test ./...` 是全绿的。不补测试，修完还会重演。<sub>TODO L318</sub>

**同层级已完成**

- [x] ~~**成功调用被记成 `rpc.code: "unknown"`**~~ — connect 的 Code 常量从 1 开始、没有 `CodeOK`，每次成功调用在日志与 span 里都记成 unknown，按 `rpc.code` 做的看板与告警全部失真。<sub>TODO L79</sub>
- [x] ~~**RPC 指标基数失控**~~ — `net_peer_port` 按 TCP 连接取值，`rate()` 恒为 0，「请求率/错误率/P95」算的都是**错的值**（不是空图）。<sub>TODO L364</sub>
- [x] ~~**购物车 cart_item_id 伪造**~~、~~**前端购物车重复请求**~~ — 前后端已闭环。<sub>TODO L80, L346</sub>

---

## P2 · 恢复完整可用与发布链路

> 判据：**已建成的东西正在退化**。集群 8/10、前端流水线跑起来必失败。

- [ ] **address 服务清理 ES 残留（最高性价比，先做这条）** — 已代码核实：`es` 字段只在健康检查 `Ping` 用到（`data.go:497,503`），无任何业务调用。删掉 `NewElasticSearchClient` 与依赖注入、健康检查去掉 ES 一项即可。**收益：address 从 CrashLoop 恢复，8/10 → 9/10，且它是交易闭环必经的收货地址服务。**<sub>TODO L378</sub>
- [ ] **search 服务 ES→Meilisearch** — `go-elasticsearch/v9`(typedapi) 换 `meilisearch-go`；1 条 typedapi 查询重写为 `q`+`filter`（结果解析已是 `map[string]any`，不动）；健康检查换 `/health`。搜索面极小正是甜点区。验收：接口回归 + 真实商品数据相关性抽查。<sub>TODO L377</sub>
- [ ] **配置与依赖收尾** — ES 连接段换 `MEILI_HOST/MEILI_API_KEY`；`go.mod` 移除 `go-elasticsearch/v9`；compose/helm values 同步。<sub>TODO L379</sub>
- [ ] **`frontend.yml` 构建/发布段全是死引用，跑起来必失败** — `frontend/Dockerfile` 不存在、`helm/charts/frontend/` 不存在、registry 指向未部署的 harbor 端口、Manifest 路径是另一个项目的布局。前端目前是手工 `kubectl apply`。**要么按现状重写，要么删掉只留 smoke job，别让它假装还在工作。**<sub>TODO L275</sub>
- [ ] **网关部署补 `redis-tls-ca` Secret** — 已挂载但标 `optional: true`，缺了只退化成仅进程内缓存（不阻断启动，因此容易一直没人发现）。<sub>TODO L282</sub>
- [ ] **[另一仓] CDC 写入端 ES→Meilisearch** — `postgres-kafka-es-streaming-pipeline` 仓；顺带补 Debezium 删除事件（tombstone/`op=d`）→ delete documents 映射（**现状只写不删**）。Debezium 源端零改动。<sub>TODO L380</sub>

**同层级已完成**

- [x] ~~**2026-08-19 集群重建后 GitOps 重新接线**~~ — 数据面换血（Pigsty 关机 → CNPG + 集群内 Redis）、Config Center 重建并灌入 10 份 pre bootstrap、ArgoCD Application Synced，8/10 服务 Running + healthz 全绿。<sub>TODO L17</sub>
- [x] ~~**部署网关本体到集群 + 部署前端**~~ — 端到端验证通过（公网 200 / 无 token 401 / 伪造身份头被剥离留痕）。过程中修掉四个存量真问题：10 个服务全缺 `CONSUL_HTTP_TOKEN`（ACL 开了没人补，失败是**静默的**）、网关 Consul 地址写死旧 LB IP 且指向不存在的 8501、`optional: true` Secret 的空目录陷阱、Redis `requirepass` 缺密码只在日志出现一次。<sub>TODO L215, L239</sub>
- [x] ~~**newt 重装 + Pangolin 资源**~~、~~**Casdoor `enableSigninSession` / `redirectUris`**~~ — 鉴权链路的基础设施侧收尾。<sub>TODO L198-213</sub>
- [x] ~~**真浏览器跑通登录后修掉的 5 个问题**~~ — 共同点是**单测和 tsc 一个字都不会说**：非订阅式 `isLoggedIn()`、CSP 漏 `font-src`/`frame-src`、`X-Frame-Options: DENY` 挡死静默续期、`img-src` 漏 Casdoor 头像域。<sub>TODO L240</sub>
- [x] ~~**登录冒烟测试接进 CI**~~ — 独立 job，`workflow_dispatch` + 每日定时，**刻意不挂发版流水线**。<sub>TODO L267</sub>

---

## P3 · 核心交易闭环（第一阶段 MVP 交付物）

> 判据：**这是最终目标的必经之路**。P0-P2 是止血与恢复，这一层才是往前走。
> 顺序建议：先货架（看得到商品）→ 再建单（下得了单）→ 再支付与库存（钱货对得上）→ 最后一致性底座。

- [ ] **商品 `ListProducts`（设计已定）** — 首页无限滚动 + 游标(keyset)分页，无总数；`ProductCard` 含 brand/价格区间。**没有它首页就没有真实货架**，`demoProducts.ts` 也删不掉。落地链路：`product.proto`→`make api`→`query.sql`→`make sqlc`→biz/data/service→前端 `useInfiniteQuery`。<sub>TODO L53, L350, 设计见 `docs/design/product/listing.md`</sub>
- [ ] **建单全链路** — cart 补「按 CartItemIds 取选中项」RPC → 取商品/地址快照 → 拆单 → 事务落库 group/order/item → 同步 `Reserve` → 清空购物车。<sub>TODO L341</sub>
- [ ] **proto 补 `CreateOrderRequest.requestId` 与 `CreateOrderResponse.orderNo/payAmount/payDeadline`** — 前端结算页已就位，只等这个才能接真实响应、跳真实支付页。<sub>TODO L343</sub>
- [ ] **cart 删除/改数量前端接线** — 现在只动本地 valtio store 不发请求，**用户删掉商品后刷新它会回来**，即这两个功能对用户实际不存在。需先补 P1 的 Quantity 字段。<sub>TODO L345</sub>
- [ ] **库存联动** — 下单同步 `Reserve`(TCC-Try)、支付成功确认扣减、取消/超时 `ReleaseReserve`。**前置是 P1 把 Reserve/ReleaseReserve 修对**，否则接上即超卖。<sub>TODO L349</sub>
- [ ] **订单服务补 `GetOrder`/`ListOrders`/`CancelOrder` + 状态机** — 带守卫的状态迁移 + `order_log`。<sub>TODO L339</sub>
- [ ] **consumer 订单页接真实查询 API** — 替换 mock。<sub>TODO L347</sub>
- [ ] **支付闭环** — `payment/result` 接支付状态查询 + 回调后订单状态同步（订单订阅 `OrderPaid`）。<sub>TODO L348</sub>
- [ ] **payment repo 主体恢复** — 5 个 RPC 目前均为显式 `Unimplemented` 桩（**这是本仓的正确示范**，不是缺陷）。原实现依赖已移除的 balance/consumerOrder client；另需支付宝真实凭据（`pay.alipay.*` 现为空占位）。<sub>TODO L56</sub>
- [ ] **一致性底座** — 落 Outbox 表 + Kafka relay，替换进程内 `GoEventBus`（**跨服务事件当前到不了其他服务**）。<sub>TODO L340</sub>
- [ ] **领域事件** — `OrderCreated/OrderPaid/OrderCancelled` 事件驱动（编舞 Saga）。<sub>TODO L354</sub>
- [ ] **编舞 Saga 四项治理**（必须随事件驱动一起落，否则流程失控）：幂等消费 / 显式补偿事件 / 状态即真相 / 超时兜底 job / 全链路 trace_id。方案本体见 `docs/design/order/consistency.md`。<sub>TODO L184-188</sub>
- [ ] **订单缺陷修复** — 金额改 `decimal`（现为 `float64`）、修 `AddressPostalCode` 空指针、统一 `merchant_id` 类型(UUID)、`Complete()` 应要求已发货。<sub>TODO L355</sub>
- [ ] **搜索读的字段与设计的 ES mapping 不兼容** — 实现读 `id`/`skus[].price`，设计写 `spu_id`/顶层 `price`。**按设计建索引则结果全为零值**。待决策改哪边（注意：Meilisearch 迁移会重新洗一遍这个问题，宜合并处理）。<sub>TODO L315</sub>

**同层级已完成**

- [x] ~~**consumer 结算页（前端）**~~ — 已接选中项/地址弹层/防重 requestId/下单调用，去优惠券、运费恒 0。<sub>TODO L342</sub>
- [x] ~~**商品详情 / 购物车 / 个人中心 / 收货地址 / 登录回调页**~~ — 已接真实 API。<sub>TODO L137-144</sub>
- [x] ~~**商品示例数据**~~ — SPU 5-7 多 SKU。<sub>TODO L351</sub>
- [x] ~~**推荐链路主体**~~ — gorse 部署排障、behavior 服务、POST/PUT 语义、dislike 落法、网关路由、tracker 包、product→gorse item 同步均已完成并实测。<sub>TODO L118-125</sub>

---

## P4 · 交付与基础设施稳定

> 判据：**不修会让已有成果慢慢退化**，且有明确到期日的排在前面。

- [ ] **告警链路已断（静默失败）** — PrometheusAlert 转换层随 192.168.3.210 停机消失，实测 8080/9059/3000 全不可达。集群里只有 Grafana，**没有 alertmanager / prometheusalert**。飞书告警此刻发不出去，且 Grafana 侧只在 UI 留错误。<sub>TODO L438</sub>
- [ ] **接入企业微信告警** — 拓扑与落点已探明（2026-08-19），只差凭据三件套 + 集群 Grafana admin 密码。⚠️ 必须配「企业可信IP」`<operator-egress-ip-b>`，不配则报错**只在 Alertmanager 日志里、界面无感知**；且这是家宽出口 IP **会漂**。验收不能只测"发得出去"，要造 CRIT/WARN 各一条验证路由条件。<sub>TODO L412</sub>
- [ ] **证书续期是三处同步，且 node1 续期链路缺位** — `*.apikv.com`（ZeroSSL）**2026-10-27 到期**，部署在 blog ssl / pangolin traefik certs / node2 minio certs。**前两处过期会让所有 Pangolin 资源挂**（blog/config/casdoor/minio/gorse 全部）。<sub>TODO L448</sub>
- [ ] **生产风险：系统 CA 被挂载遮蔽** — 10 个服务把 `db-ca-cert` 挂到 `/etc/ssl/certs`，**这会替换整个目录**，发行版 CA 完全不可见 → 容器内任何走公网 HTTPS 的出站调用都会 `x509: unknown authority`。最可疑的是 `payment → 支付宝`、`user → Casdoor`。**正确修法不是加环境变量**，而是 `subPath` 只挂单文件或挂到 `/usr/local/share/ca-certificates/`。<sub>TODO L32</sub>
- [ ] **公网明文端点：casdoor `apikv.com:8000`** — 承载 OAuth code/token 交换，走公网 http。node2 的 minio/gorse 已解决，只剩这个。<sub>TODO L404</sub>
- [ ] **前端没进 GitOps（用户明确暂缓）** — 7 份 manifest 手工 apply，且**和线上对不上**：manifest 写 harbor 镜像，线上实际跑 TCR 的手打 tag。基础设施稳定后再收口。<sub>TODO L411</sub>
- [ ] **`HELM_REGISTRY_PASS` secret 缺失** — chart 推送必失败。<sub>TODO L439</sub>
- [ ] **给 Config Center 灌 gorse 的 `api_key`** — 仓库副本按硬规则 4 保持空串，但 gorse 侧鉴权已开，**KV 里不填真值业务调用会全部 401**。<sub>TODO L440</sub>
- [ ] **Config Center 的 cart KV 同步 MinIO 新端点** — 仓库副本已改，但 KV 是另一份（「三份配置对齐」的教训）。<sub>TODO L447</sub>
- [ ] **12 条基础设施 HTTPRoute 从 http listener 迁到 https** — 一行改动一批，收益最大；泛域名证书已覆盖，无需新签。验收以**实测**为准：改前 https 返 404、改后返回业务响应。<sub>TODO L402</sub>
- [ ] **修 dragonfly 网关路径：Terminate → Passthrough** — 现状网关解密后把**明文 redis 协议**转给只收 TLS 的后端，**这条路径是坏的**（握手成功但 `PING` 无响应）。<sub>TODO L403</sub>
- [ ] **Consul 启用 TLS** — 8501/HTTPS 未启用、gossip 未加密。**连带**：`deploy/prod/` 全部写着不存在的 `consul-server.consul.svc:8501`，prod 清单照此起不来。<sub>TODO L449</sub>
- [ ] **Kafka 启用 9093 TLS listener** — Strimzi 已定义但无人使用。Kafka 客户端代码为 0，**接 Kafka 时直接从 9093 起步**，别先接明文再改。<sub>TODO L451</sub>
- [ ] **Kafka / Debezium CDC 未在新集群部署** — 2026-08-20 实测：集群里 `kafka` ns 只有 strimzi operator，**没有任何 `Kafka` / `KafkaConnect` / `KafkaConnector` CR**。⚠️ **CDC 至今从未成功跑起来过**，此前旧集群那次是 BestEffort 被内核 OOM-kill + connector 配置非法两个成因叠加；两处修法都已落进仓库清单（`kafkaconnect.yaml` 已设 `resources`、`kafkaconnector.yaml:53` 记录非法值已删），所以**这次是从"部署"开始而不是从"排障"开始**。它同时是 P3「一致性底座 Outbox + Kafka relay」的前置。<sub>出处：`backend/infrastructure/kafka-connect/`（原 TODO 事故记录行已于 2026-08-20 删除）</sub>
- [ ] **`restoreSession` 与 callback 的竞态** — 已改用 `window.location.pathname`，但**没有回归测试守着**。<sub>TODO L409</sub>
- [ ] **`e2e/login.smoke.mjs` 缺少隐私弹窗处理** — 模态盖住顶栏点不到 SIGN IN，**这条 e2e 至今没在 CI 里真跑过**，跑起来第一次大概率挂在这里。<sub>TODO L410</sub>
- [ ] **清理两个僵尸 LoadBalancer（占 IP）** + **统一 cart `pre.yml` 的 OTel exporter TLS 口径** + **（观察项）dragonfly pod 57 天重启 32 次**。<sub>TODO L452-454</sub>

**同层级已完成**

- [x] ~~**MinIO/gorse/harbor 经 Pangolin 暴露 + node2 端口全部收回回环**~~ — ⚠️ 沉淀的硬约束：`node2` 是阿里云机、`apikv.com` **未在阿里云备案**，经该域名访问必被网络层拦掉，**"配域名+证书直连"这条路根本走不通**，唯一解是让公网流量落到 node1 再经隧道回来。<sub>TODO L405-407, L444</sub>
- [x] ~~**日志平面自我放大**~~、~~**fluent-bit 镜像未钉在 values**~~ — 均已修并实测。（同批的「Loki 每 8 小时被 OOMKill」修复记录已随事故记录于 2026-08-20 从 TODO 删除。）<sub>TODO L159-160</sub>
- [x] ~~**十服务 / 网关 Config Center 单源迁移**~~、~~**下发/Watch 热更新**~~ — GitOps 尾环已于 2026-08-19 闭环。<sub>TODO L93, L98, L103</sub>

---

## P5 · 可观测性补齐

> 判据：**出事能不能查出来**。排在功能之后，但"采集管道自盲"这条代价最小、应最先做。

- [ ] **采集管道自盲（本层最优先，代价最小）** — `otelcol_*` 不在 VM 里，只在每个 collector pod 的 `:8888`，没有任何东西采集它。**"遥测有没有在半路丢"只能靠 `kubectl port-forward` 逐个 pod 看**。约 30 个序列。<sub>TODO L366</sub>
- [ ] **fluent-bit k8s 标签失效** — Loki 里 `k8s__pod_name` 的值是字面量 `".pod_name"`，**日志按 pod/namespace 下钻彻底不可用**。根因是 record accessor 把 `.` 当嵌套分隔符，改 `$['k8s.pod_name']` 形式。<sub>TODO L161, L368</sub>
- [ ] **网关 5xx 被记成成功** — `tracing.go:81-90` 只在传输层 `err!=nil` 时设 Error，后端返 503 但 `err==nil` → span 状态 OK、日志记成 Info。**Jaeger 错误检索与 error 级告警都漏掉真实 5xx**。<sub>TODO L388</sub>
- [ ] **网关采样口径与后端相反** — 网关 `AlwaysSample()` 是 trace 根，**设 `sample_ratio` 也压不住**，高峰会压垮 collector + 单副本 Jaeger。<sub>TODO L389</sub>
- [ ] **RUM 与后端 trace 无 join key** — 不透传 traceparent、后端不回 Server-Timing，慢 API 无法关联到后端 span；且只有 consumer 接了 `initPerf`。设计声称的「前端→网关→微服务全链路」**前端那段不存在**。<sub>TODO L387</sub>
- [ ] **k8s 视角（单独一轮，勿与看板混做）** — 上 `kubelet_stats` + `k8s_cluster` receiver。两个前置约束：都基数敏感（**别带 pod 名**）；`k8s_cluster` 在 DaemonSet 下**必须配 `k8s_leader_elector`**否则 N 倍重复。<sub>TODO L162, L367</sub>
- [ ] **事件/变更两维未采** — 无 kube-state-metrics、无 k8s event exporter，发布事故无 event/restart 序列可查。与上一条一并做。<sub>TODO L392</sub>
- [ ] **面板体系重构的三项收尾** — ①集群侧 apply（collector CR / Kafka patch / 告警 ConfigMap / 面板导入）②backend+gateway 发版后逐族核对 P1 预写指标名 ③**告警阈值按真实曲线校准 + 注入故障验证**（杀 pod/断 Dragonfly/停 collector）。<sub>TODO L164</sub>
- [ ] **生产级 HA 缺失** — Jaeger/VM/Loki/Grafana 均单副本、本地盘，节点故障无法带数据漂移；整个可观测栈在 imperative `install.sh` 里未纳 GitOps，且 `loki/helm/other/install.sh:51` 等处 **MinIO 凭据明文进 Git**。<sub>TODO L393</sub>
- [ ] **`OTEL_LOGS_EXPORTER: "none"` 是死配置** — 无任何 Go 代码读它。日志实际同时经 stdout→fluent-bit 与 OTLP→collector 两条路进 Loki，**标签 schema 不兼容，无单一 LogQL 覆盖全部日志**。<sub>TODO L394</sub>
- [ ] **日志限流（方案已定稿，待拍板实现）** — 防"基础设施故障 → 错误日志风暴"，且故障时恰是网络最脆弱时。机制用 zap Sampler Core 包在 Tee 外层。**压制必须可见**（丢弃钩子打 counter，压制速率突增本身就是故障信号；静默压制是最大反模式）。<sub>TODO L360</sub>
- [ ] **看板节点覆盖阈值** — 已随面板重构改为 3，但评审条目仍挂着，需核销。<sub>TODO L391</sub>
- [ ] **exemplar 导航** — VM 数据源 + Grafana 未配，metric→trace 跳转做不到。<sub>TODO L459</sub>

**同层级已完成**

- [x] ~~**OTel SDK 装配基线（11 份收敛为一份）**~~ — 并修 7 处，其中 `ParentBased` 那层**不是可选的**：只用 `TraceIDRatioBased` 时 ratio=0.1 下一条 5 跳链完整留存概率是 0.1⁵，拿到的是满屏残缺半截 trace，**比不采样更难用**。<sub>TODO L155</sub>
- [x] ~~**semconv 必须与 sdk 内部版本对齐**~~ — 不是 degradation，是 **11 个服务全部起不来**。<sub>TODO L156</sub>
- [x] ~~**pgx span 名**~~ — 两个选项必须一起给；只给 `WithSpanNameFunc` 的话 span 名依旧是整段 SQL。<sub>TODO L157</sub>
- [x] ~~**前端性能监控 Web Vitals RUM**~~、~~**Grafana 三盘体系 + 17 条告警规则生成**~~、~~**GMV 与客单价口径**~~、~~**service_name 撞名**~~。<sub>TODO L158, L164-166</sub>
- [x] ~~**网关 MeterProvider**~~ 与 ~~**10 服务 Go runtime instrumentation**~~ — 已代码核实埋点存在（见附录「已过期条目」）。<sub>TODO L164</sub>

---

## P6 · 第二阶段：商家与平台能力

> 判据：B2B2C 的另一半。**闭环不通做它没意义**，所以整体排在 P3 之后。

- [ ] **merchant 端**：新增 `api/` 客户端，接商家入驻/商品/订单。现状仅路由骨架、无 `api/` 目录。<sub>TODO L146, L356</sub>
- [ ] **admin 端**：新增 `api/` 客户端，接商家审核/用户/类目管理。现状同上。<sub>TODO L148, L357</sub>
- [ ] **RBAC 三角色细粒度权限** — order/payment/merchant/inventory 已按 RPC 粒度授权，**其余服务仍是整段放行**（address 那条已列入 P0）。<sub>TODO L81, L358</sub>
- [ ] **merchant 服务主体** — 两段式入驻设计已定稿、骨架已建但**均为占位**（`CreateMerchant` 三层全是 panic 桩，协议查询 data 层返回零值）。此外缺店铺信息管理、商品运营权限、发货/售后、结算账单。<sub>TODO L65</sub>
- [ ] **履约 fulfillment 服务** — 未开始。发货/物流轨迹/第三方物流/售后履约。<sub>TODO L66</sub>
- [ ] **结算 settlement 服务** — 未开始。佣金计算/结算单/财务对账。<sub>TODO L67</sub>
- [ ] **营销 marketing 服务**（第四阶段）— 优惠券/满减/秒杀/会员积分。<sub>TODO L68</sub>
- [ ] **数据分析 analytics 服务**（第四阶段）— 指标计算/行为分析/经营报表。⚠️ Meilisearch 无 ES 级聚合分析，**涉及搜索数据统计报表的设计需另行评估**。<sub>TODO L69, L375</sub>
- [ ] **前端「灯市」设计系统迁移收尾** — ListProduct 接通后删 `demoProducts.ts` 换真实货架；按 DESIGN.md 迁移清单换肤 PrivacyConsent 弹窗、其余 consumer routes、merchant/admin 端。<sub>TODO L38</sub>

**同层级已完成**

- [x] ~~**商家两段式入驻设计定稿**~~ — `docs/design/merchant/onboarding.md` + 《商家入驻协议》v1.0。<sub>TODO L65</sub>
- [x] ~~**merchant 首包拆分**~~ — 首页入口 926.92 kB → 340.92 kB（gzip 298.70 → 108.89 kB），ECharts 移至独立 chunk。<sub>TODO L363</sub>

---

## P7 · 工程债与文档

> 判据：不挡路，但会持续拖慢上面每一条。挑与当前在做的事同路径的顺手做掉。

- [ ] **全量 `make generate`/`make conf` 是坏的** — 五个服务目录下各有一份 `validate.proto` 复制品，与 `backend/third_party/` 的扩展号 1159/1160 冲突，**buf 全量 build 直接失败**；带 `--path` 的按服务生成不受影响（正是这样绕过去的）。删掉五份复制品即可。<sub>TODO L336</sub>
- [ ] **structcheck 同构基线收敛** — 11 个文件的存量漂移记在 `homogeneity_baseline.txt`，最严重的是 `registry/consul.go` 8 个变体（address 的空指针防护没同步到其余服务）。逐个收敛后删除基线文件。<sub>TODO L24</sub>
- [ ] **cart 的直连 HTTPRoute 绕过网关鉴权** — **prod 默认不得应用**，启用前须接入 ext_authz。<sub>TODO L25</sub>
- [ ] **测试体系落地（文档定稿、实现未开始）** — 六步：装依赖 → `backend/pkg/testutil` 共享基建 → cart data 层试点 → mockery + biz 试点 → `make test-integration` 接 CI → 按数据风险铺开 order→inventory→payment→user。**仍需核实一处**：testcontainers-go 的 `postgres.Run`/`RunContainer` API 在 v0.3x 有更名。<sub>TODO L33</sub>
- [ ] **后端各服务 biz/data/service 层单测** — `internal/pkg/config` 已 10 服务全覆盖，业务三层仍缺。与 P1「给上述路径补测试」是同一件事的两端。<sub>TODO L168</sub>
- [ ] **前端测试补 e2e 与其余 app** — 目前只有 consumer 的 `useCart.test.tsx` + config 两组。<sub>TODO L167, L359</sub>
- [ ] **前端 lint 未进 CI** — `frontend.yml` 是纯部署 workflow，没有 lint/test job（Playwright 还是注释掉的）。随该 workflow 重写一并补（与 P2 那条合并做）。<sub>TODO L22</sub>
- [ ] **Redis 使用约定的三项待办** — `insecure_skip_verify` 生产化前换 `ca_pem`；inventory 的分布式锁按第 5 节落地；Dragonfly 非原生 Redis，Cluster/Stream 能力用前需实测。<sub>TODO L35</sub>
- [ ] **定时任务约定的两项待办** — **扩副本前先定这批任务的归属**（`docs/DEVOPS.md` 阶段 2 要求 ≥2 副本，扩副本那天所有进程内 Ticker 立刻重复执行，是扩副本的前置条件）；超时兜底 job 与对账按第八节形状落地。<sub>TODO L36</sub>
- [ ] **冻结验收集三项待办** + **`MANIFEST_PUSH_TOKEN` 换细粒度 PAT** + **文档整理遗留 7 条** + **技术债 `shopName` 类型报错**。<sub>TODO L29, L19, L337, L371</sub>

**同层级已完成**

- [x] ~~**结构性门禁 structcheck**~~、~~**部署入口一致性**~~、~~**静态检查基线棘轮 + 伤疤面板**~~、~~**context/ 知识库结构门禁**~~、~~**harness 演进日志**~~、~~**冻结验收集门禁**~~ — 工程护栏体系已成型。<sub>TODO L24-29, L44-46</sub>
- [x] ~~**API Protobuf 输入约束全覆盖**~~、~~**运行时 protovalidate 接线**~~、~~**配置 YAML 的 IDE 校验**~~。<sub>TODO L23, L333-334</sub>
- [x] ~~**文档体系整理（08-07 / 08-13）**~~、~~**设计文档按微服务拆分**~~、~~**根目录文档收纳**~~。<sub>TODO L37, L39-41</sub>
- [x] ~~**提交规范 commitlint 钩子**~~ — 此前**从 2025-11-04 到 2026-08-02 整整九个月一次都没生效**，层层叠了五处成因。<sub>TODO L21</sub>
- [x] ~~**内环开发 Okteto**~~、~~**统一可执行 runbook**~~、~~**harness 瘦身**~~。<sub>TODO L26-27, L31</sub>

---

## 附录 A · TODO.md 里已过期的条目（本轮代码核实）

以下条目在 `TODO.md` 中仍是未勾状态，但**代码里已经修好了**。排优先级时已按"已完成"处理；建议回 `TODO.md` 勾掉或补一句说明，否则下次排期还会重复评估。

| TODO 行 | 条目 | 核实结果 |
|---|---|---|
| L390 | 可观测性/安全 · 免鉴权入口身份可伪造 | **已修**：`gateway/middleware/jwt/jwt.go:226` `stripInboundIdentity`，在白名单判断之前调用（:266），并有 `jwt_test.go:40` 覆盖。与 L18 记录一致。 |
| L369 | 可观测性 · 网关指标未实现 | **已修**：`gateway/middleware/tracing/tracing.go` 已初始化 MeterProvider。与 L164「网关补 MeterProvider」一致，L369 是旧记录。 |
| L370 | 可观测性 · 10 个电商服务缺 Go 运行时指标 | **埋点已补**：`services/*/internal/pkg/otel/otel.go` 已含 runtime instrumentation。与 L164 一致。剩余部分（config-center 未装 OTel ErrorHandler）仍成立。 |

**已处理**：原 L33「集群风险：node3 起不了新 Pod」（2026-08-11 记录并已 cordon）**已于 2026-08-20 删除** —— 它排查的是集群内节点 `192.168.3.107` 的 sandbox 创建卡死，而集群已于 08-16 整体重建（见 TODO「2026-08-19 集群重建后 GitOps 重新接线」行），该节点级现场不再存在。Okteto 行 ④ 的指向已同步改为自包含。

> ⚠️ 命名歧义提醒：`node3` 在本仓有**两个不同所指** —— ①集群内节点 `192.168.3.107`（上述已删条目说的是它）②Pangolin 那台 VPS `node1`（旧称 node3，已于 2026-08-18 统一改称 node1，见 `context/team/pangolin-tunnel.md`）。读到 node3 先分清是哪个。

## 附录 B · 关键依赖顺序（别搞反）

```
P0 address 越权 ─────────────────────────┐
P2 address 删 ES 依赖 ───────────────────┼──► address 可用（收货地址）
                                          │
P1 Reserve/ReleaseReserve 修对 ──────────►│──► P3 库存联动 TCC（先修后接，否则必然超卖）
P1 UpdateCartItemQuantity 补字段 ────────►│──► P3 cart 删除/改数量接线
P1 CreateOrder 止血 ─────────────────────►│──► P3 建单全链路
P3 proto 补 requestId ───────────────────►│──► P1 网关重试幂等（两条必须一起做）
P3 ListProducts ─────────────────────────►│──► P6 删 demoProducts.ts 换真实货架
P3 Outbox + Kafka ───────────────────────►│──► P3 领域事件 ──► Saga 四项治理
P4 Kafka 9093 TLS ───────────────────────►│  （接 Kafka 时直接从 9093 起步，别先接明文）
P7 扩副本前先定 Ticker 归属 ──────────────►│──► DEVOPS 阶段 2 多副本
```
