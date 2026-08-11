---
name: go-testing
layer: team
description: 后端测试的分层判定与硬约束——biz 层 mock、data 层真库(testcontainers)、Redis 用 miniredis;-short 是唯一开关;禁用 go-sqlmock/pgxmock。写任何 Go 测试前先读
---

# Go 测试:分层判定与硬约束

> **操作手册（装什么、怎么写、模板、落地步骤）在 [`docs/TESTING.md`](../../docs/TESTING.md)。**
> 本文件只写**判定规则与不可协商的约束**——即"该怎么选"，不重复"怎么做"。

## 触发条件

用户提到写测试 / 补测试 / 提高覆盖率 / 某个 bug 要防回归时，**先读本文件 + `docs/TESTING.md`**，
按下面的分层判定选工具，不要临时发挥。

## 一、分层判定（先问"这个 bug 会出在哪一层"）

| 要验证的东西 | 用什么 | 不用什么 |
|---|---|---|
| 业务分支、错误语义、状态流转 | mock/fake `biz.XxxRepo` 接口 | 真库（构造前置状态又慢又绕） |
| SQL 能不能跑、schema 契约、约束/枚举/精度 | **真实 PG 容器**（testcontainers） | 任何 mock（原理上测不到） |
| Redis 键结构、序列化、过期 | miniredis（进程内，无需 Docker） | 真 Redis（除非测锁/Lua） |
| proto ⇄ biz 转换、错误码映射 | mock biz 或直接构造 UseCase | 真库 |

**一句话判据**：mock 测"我的逻辑对不对"，真库测"我对数据库的假设对不对"。
sqlc 项目里 SQL 是生成物的输入而非手写逻辑，**风险在后者**。

## 二、硬约束（违反即返工）

1. **禁止引入 `DATA-DOG/go-sqlmock`**——只拦 `database/sql`，本项目走 pgx/v5 原生 pgxpool，接不上；
2. **禁止引入 `pashagolub/pgxmock`**——断言 sqlc 生成的 SQL 字符串，改个空格就红且不验证语义；
3. **`-short` 是唯一开关**，守卫写在 `testutil` 入口函数第一行。
   **不用 build tag**——会让文件在 `go build`/IDE 里变灰，脱离静态检查；
4. **测试基建只放 `backend/pkg/testutil`**，不进任何服务的 `internal/`
   （见 [`STACK.md`](../../STACK.md) 第十节"配置逻辑 10 份复制"的教训）；
5. **mock 生成物入库**（`internal/biz/mocks/`），CI 不装 mockery；
6. **PG 镜像 tag 必须与生产一致**——生产是 **18.4.0**，测试用 `postgres:18-alpine`；生产升级时同步改；
7. **两个方向都要验收**：不带 `-short` 全绿 **且** 带 `-short` 全 skip。
   只验一边等于不知道开关有没有真的生效（参见 [[silent-hook-failure]] 同类教训）。

## 二之二、已否决的方案（别重新提）

| 方案 | 否决理由（详见 [`docs/TESTING.md`](../../docs/TESTING.md) §8.1） |
|---|---|
| 用内网 k8s 现有基础设施当测试环境 | CI 是 GitHub Actions **云 runner**，够不到 192.168.3.x；共享库无隔离 |
| Okteto（`okteto test`） | 同上第一条决定性；且它解决的是内环开发，数据隔离仍要自己做；自托管还要 license |

**保留的口子**：`TEST_DB_URI` 环境变量——设了就直连内网真库、不起容器，
用于验容器复现不了的东西（真实 TLS `verify-ca`、生产扩展、locale）。**默认路径永远是容器。**

## 三、写测试时的判断题

- **mockery 还是手写 fake**：Repo 方法少且只关心状态 → fake 更好读；要断言调用次数/参数 → mockery；
- **在 `models.Queries` 层测还是在 `xxxRepo` 层测**：优先前者（`models.DBTX` 只需三个方法，
  `*pgxpool.Pool` 直接满足，不必装配 `Data`/`Live`）；要覆盖 repo 的转换与错误映射时才上后者；
- **一个容器还是一个用例一个容器**：包级复用一个 + `Snapshot`/`Restore` 逐用例回滚。
  每个用例起容器会让集成测试从秒级掉到分钟级；
- **断言粒度**：前置条件用 `require`，业务断言用 `assert`，每条带一句中文说明"为什么应该成立"。

## 四、跑测试的命令

```bash
cd backend
make test               # 单元测试(带 -short),集成测试自动跳过
make test-integration   # 全量(需 Docker)
go test ./services/cart/internal/data/ -run TestCartUpsert -v   # 单个用例
```

## 五、不属于这一层的

- 具体装哪些库、`testutil` 怎么实现、cart 的六条必测清单、CI 怎么接 → [`docs/TESTING.md`](../../docs/TESTING.md)
- 分层架构本身（`server → service → biz ← data`）→ [`STACK.md`](../../STACK.md) 第三节
- 某个服务测试时踩的具体坑 → `context/project/ecommerce/{service}/experience/`
