# 对抗评审报告:文档 vs 实际代码

> 评审日期:2026-08-06
> 评审对象:README.md / DESIGN.md / PROGRESS.md / TODO.md 与实际代码的一致性(CONFIG_CENTER_DESIGN.md 按要求排除)
> 评审方式:`/adversarial-review` 多模型对抗面板,report-only 模式(未修改任何代码)
> 结论:合并去重后 **22 条发现,经编排者逐条对照代码核实,全部 CONFIRMED,0 条 REFUTED**

## 评审团

| 评审员 | 模型/通道 | 状态 | 原始发现 |
|---|---|---|---|
| Claude fresh-eyes | Fable,隔离子代理(无主会话记忆) | ✅ 完成 | 16 条 |
| Codex | `codex exec` 只读沙箱(跨模型族) | ✅ 完成 | 16 条 |
| 外部 provider | 未配置,未派发 | — | — |

两组发现约半数重叠、各有独占(Claude 独占:CreateOrder 假成功、ReleaseReserve panic、前端页面表过期;Codex 独占:地址越权、审批无 WHERE、token 落日志、搜索 mapping 不兼容)。所有指控均由编排者读取被引代码逐条验证后才收录。

---

## 一、假成功 / 静默失败类(BLOCKER)

### 1. 库存 Reserve 是静默无操作:永不预占、永远报成功、还写假流水
- **位置**:`backend/services/inventory/internal/data/inventory.go:52` 附近;`internal/data/queries/query.sql`(`-- name: Reserve :execrows`)
- **发现者**:双方一致(Claude 挖出全部四层)
- **细节**:四个错误叠加——
  1. Go 侧传 `Version: stock.Version + 1`,SQL 却是 `SET version = version + 1 ... AND version = @version`,WHERE 比对的是「未来版本号」,**永远命中 0 行**;
  2. `_, reserveErr :=` 丢弃 `:execrows` 的受影响行数,0 行更新不报错;
  3. `Quantity: stock.Available - item.Quantity` 传给 `available = available - @quantity`,语义相反(把可用库存设成 `item.Quantity` 而非减掉它);
  4. 错误分支把恒为 nil 的 `err` 而非 `reserveErr`/`insertChangeLogErr` 传给 `MustHandleError` → 真失败时返回 `(nil, nil)`。
  注释声称有事务/回滚,实际没有 `ExecTx` 包裹,`FOR UPDATE` 在自动提交下立即失效。
- **失败场景**:`available=10, version=3`,预占 3 → UPDATE `WHERE version=4` 命中 0 行 → change_log 插入 `after_available=7` 的假流水 → RPC 返回成功 → 实际库存仍是 10。接上下单链路必然超卖,违反 DESIGN.md「从数据库层面杜绝超卖」的核心不变量。
- **文档矛盾**:TODO §2 称「已实现 RPC: Reserve」;PROGRESS 称「仅透传调用」——两者都不准确。
- **修复方向**:传当前 version 与原始 quantity;检查 RowsAffected==0 时返回冲突错误重试;整段包进事务;修正错误变量传递。

### 2. CreateOrder 丢弃请求、返回假成功——而结算页已经真的接上了
- **位置**:`backend/services/order/internal/service/order.go:31-41`(`// req := c.Msg` 被注释,硬编码 `CartItemIDs: nil, AddressID: 0`);`internal/biz/application/order.go:46-61`(直接 `return &domain.CreateOrderResponse{}, nil`);`frontend/apps/consumer/src/routes/checkout/index.tsx:110-121`(真实调用 `createOrder.mutateAsync` 并跳转支付页)
- **发现者**:Claude 独占
- **失败场景**:用户选商品、选地址、点提交 → 后端不读任何字段、不落任何库 → 返回 200 → 前端跳支付结果页 → 用户以为下单成功,系统里没有订单、购物车未清、库存未占。
- **文档矛盾**:PROGRESS §3.1 说结算页「使用模拟数据,提交订单未对接后端」——已过时,实际更糟:接上了一个假接口。与 payment 显式返回 Unimplemented 的做法相反,把「未实现」伪装成「成功」。
- **修复方向**:短期让 CreateOrder 显式返回 `CodeUnimplemented`(诚实失败);长期按 TODO 清单实现核心逻辑。

### 3. CompleteOrder 完成状态从不落库,但事件照发
- **位置**:`backend/services/order/internal/data/order.go:83`(`SaveOrder` 只打 debug 日志返回 nil);`internal/biz/application/order.go:108`(照常发布 `OrderCompleted`);`backend/api/order/v1/order.proto:28-34`(`message Order {}` 零字段);`service/order.go:63-85`(一切错误重包成 `CodeInternal`,含 `fmt.Println` 调试残留)
- **发现者**:Codex(持久化缺失)+ Claude(契约与错误分层)
- **失败场景**:商家完成一笔已支付订单 → 事件发布、RPC 成功,数据库里订单仍是 paid;对不存在单号操作 → CodeNotFound 被重包成 CodeInternal,客户端把「单号写错」当「服务端故障」。
- **文档矛盾**:PROGRESS §2.1 称 CompleteOrder「✅ 领域驱动实现」;§5.2 称错误处理规范「已建立」——application 层自己映射 RPC 码违反 DESIGN 的分层规范。

### 4. AddProductToCart 对任何新商品必然失败(NOT NULL 违反)
- **位置**:`backend/services/cart/internal/data/schema/cart.sql:17`(`shop_name VARCHAR(255) NOT NULL` 无默认值);`internal/data/queries/cart.sql:3-39`(INSERT 列表无 `shop_name`);生成的 Params 亦无 ShopName 字段
- **发现者**:双方一致
- **失败场景**:新用户首次加购(走不到 ON CONFLICT 更新路径)→ PG 报 not-null violation → 宣称「已联调」的核心流程 100% 失败。
- **文档矛盾**:PROGRESS 给购物车「✅ 80% 已联调」;TODO §2 自己承认此 bug——两份文档互相矛盾,PROGRESS 违反 AGENTS.md「声称完成前先回扫代码」。

### 5. ReleaseReserve 是 `panic("implement me")`,两份文档都记为「已实现」
- **位置**:`backend/services/inventory/internal/data/inventory.go:88-91`
- **发现者**:Claude 独占
- **失败场景**:任何调用让 handler goroutine panic,连接被掐断、无 Connect 错误响应;接上「取消/超时 → 补偿」链路后每单必炸。

---

## 二、权限与安全(BLOCKER,均为 Codex 独占)

### 6. 地址服务全线越权
- **位置**:`backend/services/address/internal/service/address.go:26,71,84,95`;`internal/data/queries/*.sql`(Get/Update/Delete/SetDefault 均仅 `WHERE address_id = $1`,无 user 归属校验;CreateAddress 的 `user_id` 直接取自请求体);`gateway/configs/policies/policies.csv:3`(consumer 放行整个 `AddressService/*`)
- **失败场景**:登录用户 A 提交 B 的 `user_id` 建地址,或拿到/遍历 B 的地址 UUID 后读改删 B 的隐私地址——违反 DESIGN 的数据隔离不变量。
- **备注**:Claude 的 sound-check 把地址服务评为「与文档定级相符」——它查的是完成度轴,Codex 查的是安全轴,两者不矛盾;这正是异构评审的价值。
- **修复方向**:从网关注入的身份头取 user,所有查询加 `AND user_id = ?`;service 层禁止信任请求体身份字段。

### 7. 商家审批 SQL 没有 WHERE 子句:批准一份申请 = 批准所有申请
- **位置**:`backend/services/merchant/internal/data/queries/merchant.sql:23`(`UPDATE ... SET status=... ` 全表);`internal/data/merchant.go:23`(`ApplicationId` 被丢弃)
- **失败场景**:管理员批准申请 A,待审的 B、C 全部变 approved,且带上 A 的审核意见与时间戳。
- **附带**:`RejectApplication`/`ActivateMerchant` 是 `panic("implement me")` 桩(`merchant_service.go:57,98`),PROGRESS §二却把两者列为已实现接口。(MAJOR)

### 8. SignIn 把完整 access token 打进日志
- **位置**:`backend/services/user/internal/data/user.go:39`(`u.l.Debug(token.AccessToken)`)
- **失败场景**:debug 级别一开(排障时最常见),每次登录的 bearer token 经 stdout/OTel/fluent-bit 进 Loki,可被日志读者回放直至过期。

---

## 三、文档虚报 / 进度失真(MAJOR / MINOR)

### 9. [MAJOR] 购物车前端「已联调」为假:删除/改数量只改本地状态
- **位置**:`frontend/apps/consumer/src/hooks/useCart.ts:203-214`(仅调 `cartStore.removeItem/updateQuantity`,从不发 RPC);另 `backend/services/cart/internal/data/cart.go:57` 的 `UpdateCartItemQuantityParams` **没有 Quantity 字段**——想联调也调不通
- **失败场景**:删除商品 → 刷新 → `GetCart` 拉回旧数据 → 商品复活;结算页「选中项」可能含用户以为已删的行。TODO §三自己承认此现象,PROGRESS §3.1 却写「✅ 已联调|数量调整、删除」。

### 10. [MAJOR] PROGRESS §3.1 前端页面表在「最后更新当天」即过期
- **位置**:对照 `frontend/apps/consumer/src/routes/`
- **细节**:①「首页重定向至分类页」——`index.tsx` 已改为商品网格,注释明说重定向已移除,商品列表恒为空数组;②「分类页 ✅ 已完成 ⚠️ 部分联调」——实际是 9 行占位组件,渲染字面量 `cart`(组件还叫 `CartPage`);③「优惠券 `/coupons` ⚠️ 基础页面」——路由根本不存在,访问 404;④结算页状态与代码相反(见发现 2)。

### 11. [MAJOR] 搜索服务与 DESIGN.md 的 ES mapping 互不兼容
- **位置**:`DESIGN.md:335-370`(要求 `spu_id`、顶层 `price` scaled_float、`sale_count` integer)vs `backend/services/search/internal/data/search.go:63-90`(读 `id`、`skus[].price`、`sale_detail[].quantity`)
- **失败场景**:按设计文档建索引 → 搜索结果 ID 为 0、价格 0、销量 0——实现静默用零值顶替。

### 12. [MAJOR] 网关重试可复制成功的非幂等写
- **位置**:`gateway/proxy/proxy.go:263-310`(RoundTrip 传输错误时无条件重试,仅认证错误 break);`gateway/configs/config.yaml:297`(address 等路由 attempts: 2);`checkout/index.tsx` 的 TODO 自认还没有防重令牌
- **失败场景**:`CreateAddress` 已提交但响应途中断连 → 网关原样重放 → 两条地址。属设计缺陷(缺幂等键),需产品决策,故标记而非直接归为实现 bug。

### 13. [MINOR] PROGRESS 称消息队列「EventBus/Kafka 部分集成 20%」,仓库里没有任何 Kafka 客户端代码
- **位置**:`backend/go.mod`(无 sarama/franz-go/segmentio);`backend/services/order/internal/eventbus/eventbus.go`(纯进程内总线)
- **后果**:事件出不了进程,依赖跨服务事件的排期全部落空。TODO §三的描述才是诚实的。

### 14. [MINOR] PROGRESS 对支付服务的描述与实际不符
- **位置**:`backend/services/payment/internal/data/payment.go:41-66`(5 个方法全部显式 `CodeUnimplemented`)vs PROGRESS「仅做仓储透传、核心逻辑注释掉」
- **后果**:按 PROGRESS 理解去「补业务规则」的人会以为存储链路已通;实际 repo 主体需整体恢复。TODO §2 的「5 个 RPC 均为桩」才准确。

### 15. [MINOR] behavior(行为/推荐)服务在 PROGRESS 中完全缺席
- **位置**:`backend/services/behavior/`(biz/data/service/server 完整,含 Track/Recommend/SimilarItems,并承载 TelemetryService)vs PROGRESS §二 13 行服务表零记录
- **后果**:只读 PROGRESS 的协作者不知道该服务存在;违反 AGENTS.md「两份文档都要记」。

### 16. [MINOR] TODO 对 config-center SDK 版本自相矛盾
- **位置**:TODO.md:65(已发布 v0.1.0、全部接入)vs TODO.md:71,82(依赖 remote `main` 伪版本、「后续再发布 v0.1.0」);`backend/go.mod:18` 实际钉 `v0.1.0`
- **后果**:按 71/82 行操作会 `go get @main` 换回伪版本,与 README 的升级指引打架。

---

## 四、README 照抄必炸(MAJOR / MINOR)

### 17. [MAJOR] 「运行 backend」四条指令没有一条能照抄执行
- 三条 `docker compose -f backend/infrastructure/{postgres,redis,consul} up -d` 把**目录**当 compose 文件传,直接报错(实际文件是各目录下的 `compose.yaml`);
- 「修改 `configs/config.yaml`」——该文件不存在(只有 `config.yaml.example`/`dev.yml`),且 `make dev` 从 Consul KV 读配置,改本地文件毫无影响。

### 18. [MAJOR] 网关启动命令用的环境变量代码根本不读
- README 的 `DISCOVERY_DSN`/`DISCOVERY_CONFIG_PATH` 在全部 Go 代码中 0 次出现;实际是 `CONSUL_ADDR`/`CONSUL_CONFIG_PATH`(`gateway/constants/env.go:9,13`)。未设 `CONSUL_ADDR` 时**静默回落** `localhost:8500`——恰是 README 自己批判的「静默降级比启动失败难查」;
- `POLICIES_FILE_PATH=./dynamic-config/...` 指向不存在的目录(实际在 `gateway/configs/policies/`);
- 生产 ConfigMap(`gateway/deploy/prod/configMap.yaml:9`)同样用了废弃的 `DISCOVERY_CONFIG_PATH`,生产网关的配置路径设置实际无效。

### 19. [MAJOR] 先决条件「Golang >= go1.13」与实际相差十余个大版本
- `backend/go.mod:3` 要求 go 1.26.5,`gateway/go.mod:3` 要求 go 1.25.0。装 go1.13~1.25 连编译都过不去。

### 20. [MINOR] 冒烟测试指向不存在的服务与端口
- `curl localhost:4000/greet.v1.GreetService/SubmitAuth`——全仓无 `GreetService`(模板残留),无服务监听 4000(实际 30001-30010)。

### 21. [MINOR] `CONFIG_SOURCE` 两种拼写混用
- README.md:135 附近写「切到 `config_center`」,合法值实为 `configcenter`(`backend/constants/meta.go:46`);README.md:180 的写法才正确。按前者 export 会启动报错。

### 22. [MINOR] 手工验证补充:`backend/services/config` 目录状态
- README 称「主仓已不再保留 backend/services/config」;git 暂存区已 `D` 全部文件但**尚未提交**,磁盘上仍残留目录。README 的声明依赖一次还没发生的 commit——提交前该声明为超前描述。

---

## 双评审员一致认可的「Checked but sound」

- 网关中间件清单(bbr/ip/cors/jwt/rbac/tracing/transcoder/rewrite)与 `gateway/middleware/` 逐项吻合,含如实标注的「无 meter」缺口;
- 配置源 fail-closed 无静默降级属实(`source.go` 未知值直接报错);
- `make dev`/`make dev-cc`(cart 为 `dev`/`dev-consul`)与 README 描述一致;
- frontend 4 app + 9 共享包、根 package.json 脚本与 README 表格一致;
- 订单列表/详情、支付结果页确为 mock,merchant/admin 确为骨架——与文档定级一致;
- 可观测性部分的自我描述(含空面板成因记录)诚实;
- `go test ./...` backend 与 gateway 全绿——**但本报告所有缺陷都位于无测试覆盖的路径上,这正是虚报得以存活的原因**。

---

## 总体判断与建议处理顺序

PROGRESS.md 的多处 ✅/百分比未经代码回扫,与 AGENTS.md 自己的规则冲突;TODO.md 明显更接近事实(多处 bug 是 TODO 先诚实记录、PROGRESS 拒绝更新)。建议:

1. **先止血文档**(成本最低):按本报告纠正 PROGRESS.md 的虚报条目,补 behavior 服务行,消除 TODO 内部矛盾;修 README 的 8 处不可执行指令。
2. **再修安全类**:地址越权(#6)、审批无 WHERE(#7)、token 日志(#8)。
3. **最后修假成功类**:库存 Reserve(#1)、CreateOrder(#2,短期先改成诚实的 Unimplemented)、CompleteOrder 持久化(#3)、购物车 shop_name(#4)。
4. **给上述路径补测试**——它们目前全部零覆盖,修完不补测试,漂移还会重演。
5. 修复后可发起第二轮 delta 评审(同一面板)复核。
