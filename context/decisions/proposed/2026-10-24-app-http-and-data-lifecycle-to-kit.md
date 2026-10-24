---
name: 2026-10-24-app-http-and-data-lifecycle-to-kit
layer: decisions
status: proposed
description: 启动生命周期、HTTP 服务装配、健康检查与 Data 事务外壳上提 go-connect-kit；已确认 main() 一并收口、健康检查按服务显式声明；含候选清单与规模实测
---
# 决策：启动生命周期与 HTTP/Data 装配上提 go-connect-kit

> **状态：待拍板**（2026-10-24）。两项已由用户确认：`main()` 一并收口进 kit；启动健康检查
> **按服务显式声明**（不强行统一检查项）。本文记录第三批候选的分析结论与实测规模，拍板后按
> `context/decisions/INDEX.md` 规则迁目录。

## 问题

前两批（基础设施模块 15,106 行、data 层连接构建约 1,700 行）已迁入 go-connect-kit，
`internal/pkg` 同构基线只剩 `money/numeric.go` 一行。但**装配层与生命周期**从未被收敛：

- 10 个服务的 `cmd/server` 各有一份 `appOptions`（77–94 行/份，合计 877 行），差异只有
  启动健康检查、`CloseIdleConnections`、服务特有 wiring 三类；
- `internal/server/server.go` 每份 100+ 行，`inventory / order / product / user` 四份
  **归一化服务名后逐字节相同**，其余六份的差异是「多注册一个 handler + 注释措辞」；
- `internal/server/middleware.go` 10 份**完全同构**（510 行，1 个变体）。

这三类副本落在 `TestInfraHomogeneity` 的扫描范围（`internal/pkg/`）之外，也没有任何门禁按
「调用了什么」拦它们——与 2026-09-24 data 层那批的漏网方式相同。

按 `context/team/infra-duplication.md` 规则 5「迁走实现时一并迁走生命周期」，共享 Fx 模块
应自行注册 OnStart/OnStop；现状是生命周期被写在每个服务的 `main.go` 与 `server.go` 里，
于是同一件事有两份实现（`NewHTTPServer` 的 OnStop 与 `appOptions` 的 OnStop 都调
`srv.Shutdown`），且已经分叉。

实测（2026-10-24，口径：`backend/services` 下非生成、非测试 Go，不含 sqlc 产物）：
**手写后端 14,880 行，候选副本 5,575 行，占 37.5%**。

## 提案

分四批，每批独立可发布、独立可回滚。kit 只接收 provider-neutral Options 与泛型参数，
`confv1 → Options` 映射全部留在服务（沿用 2026-09-03 决策边界，不引入 BSR）。

### 候选清单与实测

| 对象 | 副本 | 行数 | 归一化后变体 | 上提后服务保留 |
|---|---|---|---|---|
| `cmd/server/main.go` 的 `appOptions` + `main()` | 10 | 1,572（其中 `appOptions` 877） | 9 | `Spec`、模块清单、wiring |
| `internal/server/server.go` | 10 | 1,186 | 6（4 份完全相同） | handler 注册项 |
| `internal/server/middleware.go` | 10 | 510 | 1（完全相同） | `confv1.Observability → bool` |
| `internal/server/health.go` | 10 | 463 | 5 | 检查项清单 |
| `internal/data/data.go` 的通用外壳 | 10 | 1,646 | 10（核心近同构） | repo 构造、错误映射、两个 mapper |
| `backend/pkg/healthcheck/grpc.go` | 1（10 个用户） | 50 | — | 无 |
| `money`：order / cart / product 三处 | 3 | 99 | 2（包名 `money` vs `decimal`） | 无（见风险） |
| `backend/pkg/identity/identity.go` | 1（2 个用户） | 119 | — | 无（见跨仓） |

合计约 5,575 行，预期收敛后服务侧保留约 1,500 行接线，**净减少约 3,200 行**。

`internal/server/logging.go`（148 行/10 份）虽然是副本，但它已经只是 3 行委托
`go-connect-kit/rpcobs` 的薄壳，**不在本批范围**——抽它只会把 adapter 再套一层。

### 第一批：`app` 包（生命周期 + `main()` 收口）

kit 新增 `app` 包，只认标准库与 fx：

- `Spec{Name, Version, Environment}` 替代三个 flag 的默认值，内部构造 `meta.AppInfo`；
- `Options{Spec, Modules []fx.Option, Extras []fx.Option}`：`Modules` 是服务自己的装配顺序
  （`log → config → fxLogger → otel → registry → data → biz → service → server`），
  `Extras` 放服务特有接线（order 的事件总线、payment 的 `*confv1.Pay`）；
- `Options()` 返回 `[]fx.Option` 供 `fx.ValidateApp` 静态校验，`Run()` 收掉 `main()` 里
  的 `Start → 等信号 → 7s Stop`；
- 停止期顺序固定：**先关 HTTP，再关空闲连接，最后刷遥测**。`app` 的 option 必须排在
  `Modules` 之后，与今天末尾 `fx.Invoke` 的位置等价。

### 第二批：`httpserver` + `health` 包

- `httpserver`：接收 `Addr`、三个超时、CORS 白名单、`meta.AppInfo`、handler 注册项
  （`[]Route{Pattern, Handler}`，用 fx group 注入），自己建 mux、挂 `validate` 拦截器、
  挂 `healthz` 与 gRPC health、建 h2c server、注册 OnStart/OnStop。服务侧只剩一句
  「把 `orderv1connect.NewOrderServiceHandler` 的返回值包成 `Route`」。
- `health`：`Status`（含 `Warnings`，语义照抄 kit README 的 stale 配置约定）+
  `Check{Name, Optional, Run func(context.Context) error}`。**同一个类型同时供启动检查与
  `/healthz` 使用**，服务在 `data` 模块里用 fx group 声明自己的检查项——这就是「按服务显式
  声明」的落点：payment 只声明 `database`、search 只声明索引、behavior 把 gorse 标 `Optional`。
- `backend/pkg/healthcheck` 一并迁入（纯中性，10 个用户，留在业务仓等于让模板再抄一份）。

### 第三批：`data` 通用外壳

`Data` 的 `DB(ctx)` / `WithTx` / `ExecTx` / `CheckDatabase` / `CheckCache` / `StaleConfig`
在 8 个用库的服务里**除「多一条 stale 项」外完全一致**（product 只多了 `gorse` 一行）。
上提为 kit 的 `Data` 核心（持有 `pgpool.Live`、`redisclient.Live`、事务 context key），
服务侧保留：`models.Queries` 的绑定、`dbutil.WithErrorMapping` 的服务错误码、以及
`postgresOptions` / `redisOptions` 两个 mapper。

关键约束：事务 context key 必须由 kit 持有并暴露取出方法，否则服务侧 `models.New(tx)`
无法与 `ExecTx` 共享同一把 key。

### 第四批：`money` 与 `identity`

- `money`：三处 99 行、两个包名、两种形态，属于**已经发生的漂移**，与
  `homogeneity_baseline.txt` 里剩下的那一行是同一件事。上提后基线归零。
- `identity`：本仓是读取侧（`RequireUser` 等），写入侧在 control-tower 的网关；头名是
  跨仓契约（`.service-matrix.yaml` 与网关实现共同约定）。上提到 kit 让两侧共用同一份常量
  与判定，避免「网关注入新头、服务不认识」这类只有联调才发现的错配。

### 配套门禁

按调用判定，不按目录判定（照 `TestConnectionBuildersLiveInKit` 的做法）：

- `ListenAndServe(`、`http.DefaultTransport.(*http.Transport)` 只允许出现在 kit；
- `connect.WithInterceptors(` 只允许出现在 kit（服务侧只留 handler 构造）；
- 新增每个服务一份 `fx.ValidateApp` 测试。**现在 10 个服务一份都没有**：`main.go` 的注释
  说「单独拆出来是为了能用 fx.ValidateApp 校验整张依赖图」，而模板里的
  `cmd/server/main_test.go` 才是真守这件事的地方，ecommerce 只抄了注释没抄测试。

模板同步是闭环的一部分：`go-connect-template` 的 `AppOptions` 已经与 10 份副本分叉
（多了 `otelShutdown`、consul 初始化 invoke），不同步模板，第 11 个服务会带回第 11 份。

## 验收标准

- `scripts/verify-quick.sh` 绿；`cd backend && go build ./... && go vet ./...` 绿；
  `cd backend && go test -count=1 ./structcheck/...` 绿。
- 10 个服务的 `cmd/server` 各有 `TestAppDependencyGraph`，`go test ./.../cmd/...` 绿。
- `grep -c ListenAndServe backend/services/*/cmd/server/main.go` 全为 0；
  `internal/server` 下 `connect.WithInterceptors(` 全为 0；`http.DefaultTransport` 全为 0。
- 同构扫描（服务名大小写归一化）中，`cmd/server/main.go`、`server/server.go`、
  `server/middleware.go`、`server/health.go`、`data/data.go` 的副本数从 10 降为 0；
  `homogeneity_baseline.txt` 清空（当前仅剩 `money/numeric.go` 一行）。
- 三仓（ecommerce / 模板 / control-tower）在各自 `go.mod` pin 到新 kit 版本后 `go build` 绿。

## 风险

- **公共 API 一旦发布改不动**：`app`/`httpserver`/`health` 会被 10 个服务、模板、control-tower
  同时消费。先发最小面（`app` + `health`），`httpserver` 的 `Route` 注入方式确认后再发，
  避免为兼容而背补丁。
- **`httpserver` 改变路由注册方式**：从「在构造函数里直接 `mux.Handle`」变成「注入 `Route`
  清单」，模板不同步就是第 11 份副本。这条风险最容易发生，且不会立刻报错。
- **健康检查语义不能悄改**：`Warnings`（stale 配置）**不得**让 `Healthy` 为 false——否则一次
  坏配置推送会同时摘掉全部副本或把它们重启进坏配置。kit README 已有这条，迁移时要在测试里钉住。
- **启动检查的失败语义分两种**：阻断启动 vs 只 Warn（behavior 的 gorse、模板里的 search）。
  用 `Optional` 表达，不要用「每个服务自己写 if/else」把它重新散开。
- **事务 context key 归属**：key 留在服务会导致 8 份 `ExecTx` 无法共享；key 放 kit 则服务侧
  `models.New(tx)` 必须走 kit 暴露的取值方法——这一条改动会同时碰到 data 层 8 个服务。
- **`money` 抽走会暴露既有漂移**：三处形态不同（含舍入/币种处理），统一前需要确定哪一份是
  正确语义，属业务判断，不能由「迁 kit」顺带决定。
- 版本与 go directive 天花板：kit 声明 `go 1.26.0` 是消费方最低版，抬版本前须三仓同步。

## 考虑过的替代方案

- **只抽 `app`（第一批规模最小）** — 省约 530 行，但 `server.go`（已 6 变体）与 `health.go`
  （5 变体）继续漂，且「双重 Shutdown」这类结构问题不会被解决；三个包共用同一个 `Check`
  类型的收益也拿不到。
- **把 HTTP 装配放进 `backend/pkg`** — 模板服务新项目，无法 import 业务仓的 `pkg`，
  下次生成仍会带回副本；这正是 2026-09-03 决策否决「仓内上提」的同一条理由。
- **让 kit 直接接收 `confv1.Bootstrap`** — 违反决策边界（规则 4：共享包不接收具体配置类型），
  kit 会被迫 import 消费方 protobuf，control-tower 与模板也会被拖进同一份 proto 依赖。
- **用代码生成同步 10 份副本** — 同构门禁的教训是「只能冻结漂移、不能消除副本」；生成器
  也补不上模板回流通道，问题只是被推迟到下一次模板改动。
- **把 `biz`/`service` 的模块清单也抽走** — 它们本就按服务不同（`biz.go` 4 变体、
  `service.go` 3 变体），抽走只会多一层空壳，并把业务接线藏进不可见的默认值。
- **在服务里用公共 `main` 模板 + go:generate** — 生成物仍需人工同步，且与「模板一次性生成、
  无回流通道」的现状同病。

## 参考

- `context/decisions/implemented/2026-09-03-shared-infra-kit-boundary.md`（kit 是实现边界）
- `context/team/infra-duplication.md` 规则 2/3/5（根因在模板；迁实现一并迁生命周期）
- `backend/services/order/internal/server/server.go`、`backend/services/order/cmd/server/main.go`
- `backend/pkg/healthcheck/grpc.go`、`backend/pkg/identity/identity.go`
- `backend/structcheck/shared_infra_test.go`（按调用判定的门禁写法）
