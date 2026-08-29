# TESTING.md — 后端测试规范与落地手册

> **这份文档回答三个问题**：测什么层用什么工具、需要装什么、每一步怎么写。
>
> - 行为约束与判定规则（AI/人都要遵守）→ [`context/team/go-testing.md`](../context/team/go-testing.md)
> - 技术栈与分层架构 → [`STACK.md`](../STACK.md)
> - 进度 → [`TODO.md`](../TODO.md)
>
> ⚠️ 同一条事实只写一处。本文件是**操作手册**，不重复 `context/team/go-testing.md` 里的规则论证。

---

## 一、分层策略：哪一层用哪种测试

项目分层是 `server → service → biz ← data`（biz 定义 Repo 接口，data 实现）。
测试策略直接落在这条依赖线上：

| 层 | 测什么 | 用什么 | 依赖 | 跑在哪 |
|---|---|---|---|---|
| `biz` | 业务分支、错误语义、状态流转 | mock/fake 掉 `biz.XxxRepo` 接口 | 无 | 每次 `make test` |
| `data` | SQL 真的能跑、schema 契约 | **真实 PostgreSQL 容器**（testcontainers） | Docker | `make test-integration` |
| `data`（Redis 部分） | 键结构、过期、序列化 | miniredis（进程内） | 无 | 每次 `make test` |
| `service` | proto ⇄ biz 转换、错误码映射 | mock `biz` 或直接构造 UseCase | 无 | 每次 `make test` |
| 纯函数 / 结构门禁 | — | 现状已有（`structcheck`、`pkg/product`） | 无 | 每次 `make test` |

### 为什么 data 层必须用真库

sqlc 项目里 **SQL 不是手写逻辑，是生成物的输入**。会出错的是"SQL 与 schema、约束、枚举之间的契约"，
而这恰恰是 mock 原理上测不到的东西。以 cart 为例，下面六条 mock 全部无感：

1. `ON CONFLICT (user_id, merchant_id, sku_id) DO UPDATE` 是否真的命中 UNIQUE 约束；
2. `constants/cart.go` 的 Go 字面量（`active`/`expired`/`deleted`）与 PG enum `cart.cart_type` 是否一一对应
   —— 错一个字面量 mock 测试全绿，线上 insert 直接炸；
3. `dbutil.Handler` 的 `23505`/`23503` 映射 —— mock 只能手造 `&pgconn.PgError{Code:"23505"}`，
   等于测试在验证自己的假设；
4. 游标（keyset）分页的排序稳定性与边界；
5. `DECIMAL(10,2)` / `TIMESTAMPTZ` / `JSONB` 到 Go 类型的往返精度；
6. **schema 漂移** —— 列改名/改类型后，重新 `sqlc generate` 之前 mock 测试不会有任何反应。

### 明确不引入的库

| 库 | 不用的原因 |
|---|---|
| `DATA-DOG/go-sqlmock` | 只拦 `database/sql`，本项目走 pgx/v5 原生 pgxpool，**根本接不上** |
| `pashagolub/pgxmock` | 能接上，但断言的是 SQL 字符串。SQL 是 sqlc 生成的，改个空格就红，且不验证语义——两头不讨好 |
| `go.uber.org/mock`（gomock） | 可用，但 mockery 生成 testify 风格，与仓库既有 `testify v1.11.1` 直接衔接，少一套断言语法 |

---

## 二、需要装什么

### 2.1 进 go.mod 的（步骤 1 一次性装，10 个服务共用）

单一 go.mod 的好处在这里体现：装一次全服务可用。

```bash
cd backend
go get github.com/testcontainers/testcontainers-go@latest
go get github.com/testcontainers/testcontainers-go/modules/postgres@latest
go get github.com/alicebob/miniredis/v2@latest
go mod tidy
```

已有、无需再装：`stretchr/testify v1.11.1`、`jackc/pgx/v5`、`redis/go-redis/v9`。

### 2.2 不进 go.mod 的工具

```bash
brew install mockery      # 只在本机生成 mock 代码；生成物入库，CI 不需要它
```

### 2.3 运行时前置

- **Docker 必须可用**（testcontainers 要起容器）。GitHub Actions 的 ubuntu runner 自带，无需额外配置；
- macOS 上 Docker Desktop / OrbStack / Colima 任一即可，`docker info` 能通就行。

### 2.4 版本对齐

PG 镜像 tag **必须与生产一致**，否则测试通过不代表线上通过（`gen_random_uuid()`、
`ON CONFLICT` 行为、enum 处理在大版本间有差异）。

**当前主库版本：PostgreSQL 18.6**（node3 Pigsty；入口与验证证据见 [`context/team/local-env.md`](../context/team/local-env.md)）→ 测试镜像使用同一大版本的 **`postgres:18-alpine`**。patch 版本变化时先确认官方镜像 tag，再同步 `testutil.PostgresImage`。

升级生产版本时，改 `testutil.PostgresImage` 是同一次变更的一部分。核对命令：

```bash
psql "$DB_URI" -tAc 'show server_version'
```

---

## 三、共享测试基建：`backend/pkg/testutil`

**放共享包，不进任何服务的 `internal/`。** 直接吸取 [`STACK.md`](../STACK.md) 第十节
"配置逻辑 10 份复制"的教训——测试基建一旦复制 10 份，改一次 PG 版本要改 10 个地方。

### 3.1 `backend/pkg/testutil/postgres.go`

当前已实现 `StartPostgres(t) *testutil.Postgres`，返回 `DSN` 与 `*pgxpool.Pool`。入口第一行检查 `testing.Short()`；默认使用 testcontainers-go v0.44 的 `postgres.Run`、`BasicWaitStrategies` 和 `postgres:18-alpine`，`t.Cleanup` 先关连接池，再在有界时间内终止容器。

```go
postgres := testutil.StartPostgres(t)
db, _ := sql.Open("pgx", postgres.DSN)
require.NoError(t, goose.Up(db, migrationDir))
// 通过 postgres.Pool 执行被测 SQL。
```

helper **不使用 `WithInitScripts` 直接执行 migration 文件**：goose SQL 同时包含 Up/Down，交给 PostgreSQL 当普通脚本会把刚建的对象在 Down 段删掉。调用方必须使用 goose 按版本应用真实 migration，这也让测试覆盖生产迁移路径。

当前首个用例是 `pkg/outbox.TestRelayTracksAckPerDestination`，覆盖纯 expand migration、producer transaction trigger、sequence 晚提交防跳过、relay 有界历史 backfill、双 destination ack、顺序阻塞退避、dead-letter/requeue 和清理门禁。本地 Docker 不可用时 testcontainers 会明确跳过；`CI` 环境不允许用缺少 Docker 作为跳过理由，容器启动会直接失败。CI 仍需把不带 `-short` 的集成测试设为必需检查。一个包扩展到多个数据库用例后，再引入包级容器复用与 snapshot/restore，避免提前加入未被验证的共享状态机制。

#### 3.1.1 逃生舱：用内网真实 PG 代替容器

需要验证真实 TLS、扩展或 locale 时，`StartPostgres` 检测到 `TEST_DB_URI` 后直连指定测试库，不起容器：

```bash
TEST_DB_URI='postgres://user:pw@pg-dev.dev.test:5432/cart_test?sslmode=verify-ca' \
  go test ./services/cart/internal/data/ -v
```

**什么时候用**：容器复现不了的东西——真实的 TLS `verify-ca` 链路、生产装的扩展、
locale/排序规则，以及「确认 SQL 在当前 node3 PostgreSQL 18.6 上跑得动」。

**什么时候不用**：CI（GitHub Actions 云 runner 够不到 192.168.3.x 内网）、
以及任何要并行跑的场景（共享库没有隔离）。**默认路径永远是容器。**

实现要点（三条都要有，缺一条这个逃生舱就是事故源）：

1. **库名安全闸**：解析 DSN，dbname 不以 `_test` 结尾直接 `t.Fatalf`。
   集成测试会 TRUNCATE/DROP，指错库就是把开发数据清了——这道闸比任何注释都管用；
2. helper 只建立连接，不偷偷执行 schema；调用方仍通过 goose 应用真实 migration。外部测试库必须是可独占、可回滚的 `*_test`，不得指向共享开发库；
3. **每个用例自己清场**：外部库没有容器级隔离，只允许清本服务 schema，并在结束时恢复到可重复执行状态。

> 凭据不进仓库（[`AGENTS.md`](../AGENTS.md) 硬规则）。`TEST_DB_URI` 只在本机 shell 里给，
> 别写进 Makefile、`.env` 或任何提交物。

### 3.2 `backend/pkg/testutil/redis.go`

```go
// StartRedis 返回一个连到进程内 miniredis 的 go-redis 客户端。
// 不需要 Docker,所以【不做】 -short 跳过 —— 它可以随 make test 一起跑。
func StartRedis(t *testing.T) *redis.Client
```

- `miniredis.RunT(t)` 自带 `t.Cleanup`，拿 `.Addr()` 建 `redis.NewClient`；
- **已知边界**：miniredis 对 Lua 脚本、过期时序、集群命令支持不全。分布式锁这类
  依赖原子性与时序的关键路径，后续用 Dragonfly 镜像的 generic container 替换（见步骤 6）。

### 3.3 `backend/pkg/testutil/seed.go`（可选，铺开时再加）

跨服务复用的造数助手（UUID、金额、时间）。**别在这里塞业务语义**——
每个服务的领域数据放各自的测试文件里，共享包只放"任何服务都用得上"的东西。

---

## 四、怎么写 data 层测试（以 cart 为例）

### 4.1 两个切入层级

cart 的实际接线是：

```go
// services/cart/internal/data/cart.go
type cartRepo struct { queries *models.Queries; rdb *LiveRedis; log *zap.Logger; live *config.Live }
func NewCartRepo(data *Data, logger *zap.Logger, live *config.Live) biz.CartRepo
```

由此有两个层级，**先做 A，B 按需**：

**A. 直接测 sqlc 生成的 `models.Queries`（推荐起步）**

`models.DBTX` 只需要 `Exec` / `Query` / `QueryRow` 三个方法，`*pgxpool.Pool` 天然满足，
所以一行就能拿到 Queries，不需要 `Data`/`LiveRedis`/`config.Live` 那套装配：

```go
postgres := testutil.StartPostgres(t)
db, _ := sql.Open("pgx", postgres.DSN)
require.NoError(t, goose.Up(db, "../data/migrations"))
q := models.New(postgres.Pool)
```

上面第一节那六条全部能在这一层覆盖，成本最低。

**B. 测 `cartRepo`（覆盖 repo 层的转换与错误映射）**

要走 `NewCartRepo`，就得把 `*Data` 装出来：

```go
d := NewData(NewPgPool(postgres.Pool), NewLiveRedis(testutil.StartRedis(t)), zap.NewNop())
repo := NewCartRepo(d, zap.NewNop(), config.NewLive(&confv1.Bootstrap{ /* 最小可用配置 */ }))
```

注意 `NewData` 目前把 `dbutil.WithErrorMapping("23505", ...)` 那两行**注释掉了**——
这本身就是 B 层测试该暴露的问题：写一个"插入重复 SKU 期望拿到 `biz.ErrAlreadyExists`"的用例，
它现在会失败，失败得对。

### 4.2 文件位置与命名

```
services/cart/internal/data/
├── cart.go
├── cart_integration_test.go   ← 新增(package data,内部测试,可访问非导出的 cartRepo)
└── live_test.go               ← 已有,纯单元测试,不动
```

`_integration_test.go` 后缀只是给人看的约定；**真正的开关是 `testing.Short()`**，
不是 build tag —— build tag 会让这些文件在普通 `go build`/IDE 里变灰不参与检查。

### 4.3 六条必测清单（cart 版，照抄即可）

| # | 用例 | 断言什么 |
|---|---|---|
| 1 | `AddProductToCart` 同一 `(user_id, merchant_id, sku_id)` 连续两次 | 只有一行；第二次 `selected`/`status` 被 EXCLUDED 覆盖；`cart_item_quantity` 计数正确 |
| 2 | 遍历 `constants.CartStatus{Active,Expired,Deleted}` 逐个 insert | 全部成功。任一失败即证明 Go 字面量与 PG enum 漂移 |
| 3 | 绕过 upsert 直接 `INSERT` 撞 UNIQUE | 拿到 `*pgconn.PgError` 且 `Code == "23505"`；经 `dbutil.Handler` 后是预期的 biz 错误 |
| 4 | `GetCart` 翻页（造 N 条，按游标翻到底） | 并集 = 全集，无重复、无遗漏；翻页中途插入新行不影响已翻过的页 |
| 5 | `price` 写 `123.45` / `0.01` / `99999999.99` 读回 | `decimal` 值逐位相等，无浮点漂移；超 `DECIMAL(10,2)` 范围时报错而非静默截断 |
| 6 | `sku_attributes` 写 JSONB 读回 | 结构与键序无关地相等；空对象默认值 `{}` 生效 |

> `RemoveCartItem` 用了 `unnest(@statuses::cart.cart_type[])` 这种数组转 enum 的写法，
> 参数类型错了只有真库能发现——**顺手加第 7 条**：多商家批量删除，验证平行数组按位对齐。

### 4.4 骨架模板

```go
package data

import (
    "context"
    "database/sql"
    "testing"

    _ "github.com/jackc/pgx/v5/stdlib"
    "github.com/pressly/goose/v3"
    "github.com/stretchr/testify/require"
    "github.com/lens077/ecommerce/backend/pkg/testutil"
    "github.com/lens077/ecommerce/backend/services/cart/internal/data/models"
)

func TestCartUpsert_HitsUniqueConstraint(t *testing.T) {
    postgres := testutil.StartPostgres(t) // -short 时在这里就 skip 了
    db, err := sql.Open("pgx", postgres.DSN)
    require.NoError(t, err)
    require.NoError(t, goose.Up(db, "migrations"))
    q := models.New(postgres.Pool)
    ctx := context.Background()

    userID, merchantID, skuID := newUUID(t), newUUID(t), int64(1001)

    first, err := q.AddProductToCart(ctx, models.AddProductToCartParams{ /* ... */ })
    require.NoError(t, err)

    second, err := q.AddProductToCart(ctx, models.AddProductToCartParams{ /* 同一三元组 */ })
    require.NoError(t, err)

    require.Equal(t, first.CartItemID, second.CartItemID, "upsert 应命中同一行而不是插新行")
    require.EqualValues(t, 1, second.CartItemQuantity, "同一 SKU 重复加入不应让计数翻倍")
}
```

**断言写法约定**：

- 前置条件失败用 `require`（继续跑没有意义），业务断言用 `assert`（一次跑出多个问题）；
- 每条断言带一句中文说明"为什么这条应该成立"——测试挂了看的是这句话，不是行号。

---

## 五、怎么写 biz 层测试（mockery）

### 5.1 配置

`backend/.mockery.yaml`：

```yaml
with-expecter: true          # 生成 EXPECT() 链式 API,比字符串方法名安全
dir: "{{.InterfaceDir}}/mocks"
outpkg: mocks
packages:
  github.com/lens077/ecommerce/backend/services/cart/internal/biz:
    interfaces:
      CartRepo:
  # 其余服务按同样格式追加
```

Makefile 加一个目标：

```make
.PHONY: mocks
mocks:
	mockery
```

**生成物入库**（`internal/biz/mocks/`），这样 CI 不必装 mockery。

### 5.2 写法

```go
repo := mocks.NewCartRepo(t)                       // 自带 AssertExpectations 的 cleanup
repo.EXPECT().
    AddProductToCart(mock.Anything, mock.Anything).
    Return(nil, biz.ErrXxx).
    Once()

uc := biz.NewCartUseCase(repo)
_, err := uc.AddProductToCart(ctx, req)
require.ErrorIs(t, err, biz.ErrXxx, "UseCase 必须原样透传领域错误,否则 service 层的 errors.Is 分支会全部落到 default")
```

**用 mock 还是手写 fake**：Repo 方法少（cart 只有 4 个）且只关心状态而非调用序列时，
一个 map 实现的 fake 更好读；需要断言"调了几次、带什么参数"时才上 mockery。

---

## 六、落地步骤（每步一个提交，随时可停）

| 步骤 | 内容 | 提交类型 | 验收 |
|---|---|---|---|
| 1 | 装依赖（§2.1、§2.2） | `build:` | `go mod tidy` 干净，`go build ./...` 通过 |
| 2 | `backend/pkg/testutil`（§3） | `test:` | `go vet ./pkg/testutil/` 通过；写个冒烟测试确认容器起得来 |
| 3 | **cart data 层试点**（§4） | `test:` | 不带 `-short` 全绿；带 `-short` 全 skip（**两个方向都要验**） |
| 4 | mockery + cart biz 试点（§5） | `test:` | `make mocks` 幂等（重跑无 diff）；biz 测试全绿 |
| 5 | Makefile + CI 接线（§7） | `ci:` | CI 上 integration job 绿 |
| 6 | 按数据风险铺开 | `test:` | 见下 |

**步骤 1–3 是核心闭环**（依赖 + 基建 + 首个真库测试），建议连做；4、5 可独立排期。

**步骤 6 的推进顺序**（按"错了会赔钱"排序）：
`order`（状态机 + 金额）→ `inventory`（扣减竞态）→ `payment` → `user` → 其余。

**每步收尾三件事**（[`AGENTS.md`](../AGENTS.md) 硬规则）：
1. 更新 [`TODO.md`](../TODO.md) 对应行；
2. 踩到的坑按四段式（症状/关键陷阱/根因/修复）写进 `context/project/ecommerce/{service}/experience/`；
3. 分组提交（测试代码与被测代码分开，除非改动互相依赖）。

---

## 七、Makefile 与 CI 接线

### 7.1 Makefile

现有目标不动（`-short` 已是天然开关）：

```make
.PHONY: test
test:
	go test -short -coverprofile=coverage.out ./...
```

已新增：

```make
# 集成测试:需要 Docker。不带 -short,testutil 里的守卫因此放行。
# 单独的 coverage 文件,避免覆盖单元测试那份。
.PHONY: test-integration
test-integration:
	go test -count=1 -timeout 10m -coverprofile=coverage-integration.out ./...
```

`-timeout 10m`：默认 10 分钟其实够，但容器冷拉镜像那次很慢，显式写出来免得别人误以为卡死。

### 7.2 CI

`.github/workflows/service-ci.yml` 的 test job 加一步。GitHub Actions 的 ubuntu runner
**自带 Docker daemon**，不需要 `services:` 块或 DinD 配置：

```yaml
      - name: Integration tests
        run: cd backend && make test-integration
```

镜像拉取可缓存，但**别为此引入复杂度**——首次落地先让它跑通，慢再优化。

---

## 八、已知取舍（先不做，记在这里免得反复讨论）

| 事项 | 现状决定 | 什么时候再做 |
|---|---|---|
| 10 个服务各起一个 PG 容器 | 接受。包级复用 + Snapshot/Restore 已经够快 | 全量集成测试超过 5 分钟时，开 testcontainers 的 `WithReuse` 跨包复用 |
| Redis 用 miniredis 而非真 Dragonfly | 接受。绝大多数用例只验键结构与序列化 | 测分布式锁/Lua 脚本时，换 generic container 起 Dragonfly |
| 不测 Elasticsearch / Silo / Consul | 接受。Elasticsearch 只读投影与 Silo 是 search/cart 的边缘路径；Consul 仅为迁移期存量 | 对应服务的核心链路依赖 Elasticsearch/Silo 时；Consul 随服务发现迁移退役，不新增目标态测试 |
| 不做契约测试（前后端） | 接受。proto + buf breaking 已覆盖大部分 | `buf breaking` 进 CI 之后再评估 |
| `service` 层测试 | 接受。错误码映射靠 review | biz 层铺完之后 |
| **不用 Okteto 做测试环境** | 见下节，2026-08-11 评估后否决 | 改用集群内 self-hosted CI runner 时重新评估 |

### 8.1 为什么不用 Okteto（评估记录，别重复讨论）

Okteto 确实有 `okteto test`（Test Containers + Remote Execution，manifest 的 `test:` 段
支持 commands/context/depends_on/hosts/image），内网 k8s 也确实已有全套基础设施。
仍然否决，三条理由按权重排：

1. **CI 够不到内网（决定性）**：CI 是 GitHub Actions **云 runner**，到不了 192.168.3.x；
   PG 还在集群外（192.168.3.109）。测试要当门禁就必须自包含。
2. **共享库没有隔离**：集成测试要能随便 DROP/TRUNCATE/重置。打共享 pg-dev 要么弄脏开发数据，
   要么被迫写依赖清理顺序的测试——那正是 flaky 的头号来源。容器的 Snapshot/Restore 白送干净状态。
3. **它解决的是另一个问题**：Okteto 的价值在**内环开发**（代码同步进集群、对着真依赖跑服务）。
   即便用 `okteto test`，**数据隔离仍然要自己解决**，等于绕一圈回到原点。

附带成本：自托管要 license（开源的只是瘦客户端，装进集群的那部分是商业版；免费档 5 seats，
self-hosted 文档写 1 年期而 pricing 页写"3 人以下免费"，口径不一致），还要配域名、认证、块存储。
而且仓库里那 11 份 `okteto.yaml` 是**过期残留**（dev 目标名还是 `connect-example-go`，
build/deploy 段全注释），真要启用得先修它们。

**保留的部分**：内网 PG 的价值通过 §3.1.1 的 `TEST_DB_URI` 逃生舱拿到了——
一个环境变量就能打真库，不需要装任何平台。

**什么时候重新评估**：如果将来在集群里跑 self-hosted GitHub Actions runner
（那条路本身就解决了理由 1，且不需要 Okteto），或者内环开发的痛点大到值得单独立项。
