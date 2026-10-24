# 02 购物车：从最简单的 CRUD，到可信的购买意向

[学习入口](README.md) · 前置：[系统](00-system.md)、[平台](01-platform.md) · 关联：[商品](06-product.md)、[订单](10-order.md)

## 0. Git 证据：原始购物车不是随意的本地列表

项目首期MVP在 [f3fe86d3 README](https://github.com/lens077/ecommerce/blob/f3fe86d3/README.md#L860-L868) 明确要求购物车页面参与完整购物流程。最早可读cart.proto是`dbeeb59d`（2026-04-26）的AddProductToCart/RemoveProductToCart，但当时服务目录是gitlink；不能称本仓已有完整实现。

**最早非空接口设计**是 [216aa347，2026-05-16 的 API README](https://github.com/lens077/ecommerce/blob/216aa347/backend/api/cart/v1/README.md)：原文说selected是「需要被持久化在数据库里的业务状态」，「前端计算的金额永远不可信」，加购返回cart_item_id，按条目ID删除。同期 [38991540 的表设计](https://github.com/lens077/ecommerce/blob/38991540/backend/services/cart/internal/data/schema/README.md) 要求业务唯一键、重复加购累加、快照与逻辑删除，不在cart直接扣库存/支付。

| 当时怎么做 | 内容证据 | 演进的收益或限制 |
|---|---|---|
| [38991540首次展开data](https://github.com/lens077/ecommerce/blob/38991540/backend/services/cart/internal/data/cart.go)，2026-05-16 | 从头取UUID，真实INSERT/ON CONFLICT累加、Float64ToNumeric；删除handler仍panic | 加购不是空桩，但也不是完整CRUD；请求体价格与设计中的权威快照仍有差距 |
| [0c34e71a](https://github.com/lens077/ecommerce/blob/0c34e71a/backend/services/cart/internal/data/cart.go)，2026-07-03 | 增加读删改；Quantity漏传已在该版出现 | 方法增多没有证明目标数量能落库，旧问题延续到今天 |
| [37b65654 SQL](https://github.com/lens077/ecommerce/blob/37b65654/backend/services/cart/internal/data/queries/cart.sql)，2026-07-26 | 删除改平行数组；冲突分支去掉数量累加；GetCart统计改为行数 | 与初稿条目ID/累加语义产生偏移，未找到这次语义改变的独立裁决，不编原因 |
| 当前 | 整数分精确转换、DB约束、protobuf校验、前端共享Query；仍组合键和数量漏参 | 金额精度防护已改善，但购物车仍没回到初稿要求的完整持久化行为 |

**原始MVP判定：不满足。** 按本人新增/重复加购、改数量/删除、刷新和selected跨端、服务端核价逐项核对，仍有本章C1—C5的断点。**生产判定：不满足**，这些是核心业务阻断，不是缺营销或容量优化。下一步先修真实写入与请求贯通，再按既定cart_item_id方案收敛接口，而非先加缓存。

## 1. 原始范围首先解决什么

用户看到一个 SKU，暂时想买，把它放入购物车，稍后调整数量或删除。这就是最小闭环。

**CRUD** 是 Create/Read/Update/Delete，即增查改删。能跑通 CRUD 只证明单个操作有路径，不自动证明并发、重试、权限和跨服务一致性。

必须分清三个 ID：

- **SPU**：一种商品的共性，例如某型号手机。
- **SKU**：可购买的具体规格，例如黑色、256GB。
- **cart_item_id**：某个用户购物车的一行；同一 SKU 在不同用户购物车里是不同条目。

购物车记录的是购买意向，**不锁库存，不保证当前价格就是成交价**。这让浏览和加购保持轻量，也意味着 order 不能照抄购物车价格直接扣钱。

历史定位：Git `0c34e71a`、`37b65654` 可见 CRUD/分层落地；`c6114c09` 加了缩略图绝对 URL。这里不把那些提交描述成已经通过完整交易验收。

## 2. 当前最短阅读路径

[cart.proto](../../backend/api/cart/v1/cart.proto) → [service/cart.go](../../backend/services/cart/internal/service/cart.go) → [biz/cart.go](../../backend/services/cart/internal/biz/cart.go) → [data/cart.go](../../backend/services/cart/internal/data/cart.go) → [queries/cart.sql](../../backend/services/cart/internal/data/queries/cart.sql)。

现有四 RPC：GetCart、AddProductToCart、RemoveCartItem、UpdateCartItemQuantity。matrix 的 cart `depends_on=[]`，商品/商家快照来自请求，不是 cart 已经调用 product/merchant 核验。

## 3. 已有工程化保护，不等于核心闭环已跑通

| 现有能力 | 为什么需要 | 仍不能证明什么 |
|---|---|---|
| 主体从网关头解析为 UUID | 不让请求体随意指定用户 | 后端绕网关访问是否被网络策略阻断 |
| proto 对数量、ID、等长数组做约束 | 拦畸形请求和过量批次 | 四组数组里的业务组合一定正确 |
| `(user_id, merchant_id, sku_id)` 唯一约束 | 防同用户同规格出现两行 | 重复添加应该累加还是覆盖仍需业务定义 |
| 整数分与 PG Numeric 精确转换 | 避免 float 金额误差 | 客户端传来的价格一定可信 |
| 金额 CHECK 与枚举数组注册 | 防非法落库及 PG enum 编码错误 | INSERT 已覆盖所有 NOT NULL 字段 |
| 共享 Live DB/Redis 与生命周期 | 凭据切换、连接复用、停止清理 | 业务事务与正确计数已经完成 |
| 对象存储 URL 拼接 | 浏览器能访问缩略图 | cart 是文件上传/签名 URL 服务；当前只是展示拼接 |
| 前端共享查询与加购后失效 | 避免徽标/页面重复拉取、重复累加 | 删除与改数量也已持久化 |

已有 [money 测试](../../backend/services/cart/internal/pkg/money/numeric_test.go) 检查精确分转换；[service 测试](../../backend/services/cart/internal/service/cart_test.go) 主要检查错误码。它们不能覆盖下面的真实 SQL 问题。

## 4. 当前缺陷：从用户现象追到每一层

### C1 新加购缺 shop_name，核心写入仍可能失败

AddProductToCart 的 INSERT 未写 `shop_name`，但 [初始迁移](../../backend/services/cart/internal/data/migrations/00001_cart.sql) 将该列定义为 NOT NULL、无默认值。按这套迁移建出的库，新 INSERT 会失败。

**修复不能只加空字符串掩盖约束。** 先决定店名快照的来源：服务端从商家/商品读模型取得，或明确客户端展示快照的弱信任边界。后者不能变成商家归属/价格的授权依据。字段、proto、前端和 SQL 要成对改，不能只修一层。

### C2 数量请求到达后端，也可能根本没有更新

`data.UpdateCartItemQuantity` 漏传生成参数里的 Quantity；其类型可空，SQL 的 quantity>0 条件收到 NULL 不成立。结果仍可能以数量统计和 nil 错误返回。

此外 proto 声明 quantity=0 表示删除，现 SQL 没有对应删除分支。这是**契约与实现不一致**，不是输入格式错误。

验收要用真实迁移库：原数量1，请求目标3，重读必须是3；目标0必须按契约删除。不能用 stub 返回成功证明 SQL 做到了。

### C3 前端删除/改数量仍只改 store

[useCart](../../frontend/apps/consumer/src/hooks/useCart.ts) 的 removeItem/updateQuantity 只更新本地状态，没有 mutation；toggle/select/clear也只是本地。刷新/重新查询后旧值可能回来，selected跨端也未兑现初稿要求。

当前工作树新增serverItems/isRefreshing，结算会比较本地已选行与服务端快照，不一致就阻止提交。这是必要止损，不是已实现数量持久化，也没有解决后端漏参。

这与 C2 是两个独立断点：**接通前端 mutation 后还必须修后端漏参**，不能以浏览器 Network 多了一条请求就结束。

最小办法是复用现有 Connect Query 和 Query key。先采用「服务器成功后失效查询」的保守策略；乐观更新要额外实现回滚与顺序控制，不能仅先改 store。

### C4 修改 CTE 的计数可能读到旧快照

加删 SQL 使用数据修改 CTE，随后直接读取基表计数。PostgreSQL 同一语句中的子语句共享快照，不能以为前面修改了、后面基表 SELECT 就自动看见新行；应通过 RETURNING 或事务内下一条查询获得明确语义。

这是源码与 PG 语义推导，本轮未做数据库复现。优先用「空购物车首加一件」「删除最后一件」两个测试验证返回 count/is_empty。不要通过前端强制 count±1 掩盖服务端错误。

### C5 重复加购语义尚不清晰

现 ON CONFLICT 更新勾选和状态，不是自动累加数量。前端/用户若预期点两次变两件，现实现不能直接保证。

**幂等**与**累加**可能冲突：同一次点击超时重试不应加两次，但用户有意点两次又可能应加两次。需先定义「一次意图」和稳定请求标识，或使用明确的目标数量语义；不要让网络重试决定购买数量。

## 5. 如何和其他服务准确对接

| 边界 | 现在 | 目标契约 |
|---|---|---|
| 前端 ↔ cart | 行 ID 展示；删除四个平行数组、改数量组合键 | 先把现行请求正确拼装，再按 [既定条目 ID 设计](../design/cart/api-decisions.md) 迁移；所有写操作绑定主体 |
| product → cart | 请求携带商品展示快照 | 约定 SPU/SKU/merchant 的关联；快照价格仅展示，下单重新核价 |
| order → cart | 尚无配套批量快照/核销 RPC | 按 checkout v2 提供当前主体可购买行；买掉的是某次数量，不一定删除整行 |
| gateway → cart | guest 类 RPC | 登录与访客主体不混；签名访客不是匿名请求随填 UUID |
| cart → 对象存储 | 拼缩略图 URL | 展示 URL 不成为对象写入权限，不把存储 SDK 暴露给前端 |

核销的教学反例：报价时数量1，用户后来又加到3，订单完成后直接删行会吞掉另外2件。应记录被消费的快照数量，并对核销事件做幂等；同 event_id 重放不能再扣一次。

「购物车数量」也要定义：行数还是商品件数？现徽标常按行数处理。字段同叫 quantity 不能自动保证双方理解一致。

## 6. 从高内聚到性能与扩展

- **高内聚**：条目身份、数量规则、去重、归属和读写结果都归 cart 用例，别让页面私自补业务规则。
- **低耦合**：购物车不承担实时库存预占，也不绑定商品数据库表；order 统一组织成交核验。
- **安全**：用户 A 操作用户 B 条目无副作用；访客合并到登录用户要有明确所有权与重复策略。
- **性能**：复用连接、批量读取、限制条目数、核查 SQL 索引；不要为每行依次打 product RPC 造成 N+1。
- **可扩展**：无状态服务可增副本，但唯一约束/幂等必须在数据库，不能藏在一个进程的 map 里。

## 7. 分三次完成，不一次重写

| 练习 | 范围 | 必须拿到的证据 |
|---|---|---|
| C-A 基本写入真实成功 | shop_name 契约、Quantity 漏参、0删除、返回计数 | 真实库首加成功；1→3；0删除；最后一条删除后0/true；失败没有副作用 |
| C-B 前后端闭环 | 复用 mutation/查询失效；对齐行ID与属主 | 刷新一致；错误保留可重试 UI；A不能改B；并发最后状态符合定义 |
| C-C 交易集成 | 批量快照、报价后的变化、幂等核销 | 报价1后加到3，消费后剩2；重放仍剩2；客户端改价不能进入最终订单 |

测试先针对上面断点，不为 getter 或框架行为凑数量。完成每一阶段后，再更新 TODO 对应项目；不要因为 cart 服务的健康分上升就宣布购物流程全通。
