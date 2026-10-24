# 06 商品：数据映射、价格事实与可重建投影

[学习入口](README.md) · 前置：[商家](05-merchant.md) · 关联：[购物车](02-cart.md)、[搜索](07-search.md)、[推荐](08-behavior.md)、[订单](10-order.md)

## 0. Git 证据：先落详情切片，完整目录一直未兑现

[f3fe86d3 README](https://github.com/lens077/ecommerce/blob/f3fe86d3/README.md)（2026-02-25）将product列为首期核心，定义SPU/SKU CRUD、上下架、类目属性品牌、缓存与搜索同步。但同版[proto](https://github.com/lens077/ecommerce/blob/f3fe86d3/backend/api/product/v1/product.proto)实际只公开GetProductDetail(spu_code)，价格double、库存int32。**完整领域蓝图与当期接口切片，最初就不是同一完成度。**

02月服务目录是gitlink，所指外仓对象本地不可得。最早普通目录为 [7660f1ae专属README](https://github.com/lens077/ecommerce/blob/7660f1ae/backend/services/product/README.md)（2026-05-16），仍要求创建/编辑/审核/上下架、批量ID查询与缓存；同版[data](https://github.com/lens077/ecommerce/blob/7660f1ae/backend/services/product/internal/data/product.go)和[SQL](https://github.com/lens077/ecommerce/blob/7660f1ae/backend/services/product/internal/data/queries/query.sql)仅落实详情，SPU online过滤、SKU JSON聚合，解码失败只告警后返回。

| 内容演进 | 证据 | 限制没有自动消失 |
|---|---|---|
| SQL由显式JSON对象变k.*，SKU改decimal并扩字段 | [45d4efe7 query](https://github.com/lens077/ecommerce/blob/45d4efe7/backend/services/product/internal/data/queries/query.sql)及同版biz，2026-07-26 | 无JSON tag使列名与Go字段错配；不能把扩字段当正确性增强 |
| 定时目录对账到gorse | [15994efb recommend](https://github.com/lens077/ecommerce/blob/15994efb/backend/services/product/internal/biz/recommend.go)，08-02 | updated_at游标与回拨策略从首版就要验证，同刻超批问题不是LiveClient能解决 |
| 明确ListProducts设计 | [cdad0646 listing](https://github.com/lens077/ecommerce/blob/cdad0646/docs/design/product/listing.md)，08-08；前身在45b40f02的旧DESIGN.md | 明说「设计已定，待落地」，规定keyset/默认20上限60；当前仍无此RPC |
| 当前搜索投影/配置更新 | 见下文migration和工作树LiveClient | CDC与gorse是两条同步链；搜索投影触发器不自动修gorse的SPU时间游标 |

**原始MVP判定：不能签通过。** 详情有真实实现，但SKU映射/状态可能让可购买数据失真；作者要求的是浏览能参与购物，而非任意响应。**生产判定：不满足**，PR1—PR4是明确数据边界/同步缺陷。先修真实DTO与公开字段，再实现已定列表与受权写用例，缓存/复杂商品运营后置。

## 1. MVP 不是一个万能 Product 对象

最小模型：用户通过商品编码查看详情，选择一个可售 SKU，取得展示价格和规格。它不必一开始支持所有促销，但必须返回可被购物车正确识别的 SKU。

- **SPU** 是商品共性；**SKU** 是实际可买规格，状态与 ID 不能混用。
- **DTO（Data Transfer Object）** 是跨一层边界传递数据的结构，不一定等于数据库行或领域对象。
- **映射（Mapping）** 是明确规定数据库字段如何进入 DTO，再进入 proto。
- **读投影** 是给搜索/推荐用的派生结果，不成为商品写入真相。
- **Keyset pagination（键集分页）** 用排序键的位置续查，而不是让 offset 随页数无限增长。

高内聚的商品模型知道目录、SKU、上下架和价格规则；低耦合的外部接口不把所有数据列原样发给浏览器。

## 2. 当前代码实际走哪条路径

[product.proto](../../backend/api/product/v1/product.proto) 当前只有 GetProductDetail，没有 ListProducts 或管理写 RPC。

[service/product.go](../../backend/services/product/internal/service/product.go) → [biz/product.go](../../backend/services/product/internal/biz/product.go) → [data/product.go](../../backend/services/product/internal/data/product.go) → [query.sql](../../backend/services/product/internal/data/queries/query.sql)。

详情直接查 PG。前端 Query 的 staleTime 是浏览器缓存语义，不能说后端已经做了 Redis cache-aside。

另外两条派生链已经有实际代码：

- [搜索投影迁移](../../backend/services/product/internal/data/migrations/00005_search_catalog.sql) 用 SPU/SKU/销量变化维护 `products.search_catalog`，再由仓外 CDC 搬到 ES。
- [ItemSync](../../backend/services/product/internal/biz/recommend.go) 周期读取目录并投喂 gorse；[data/recommend.go](../../backend/services/product/internal/data/recommend.go) 提供同步数据。

商品没有写 RPC，不等于数据库变化的投影完全没运行；反过来，有投影触发器，也不代表商家商品管理已经做好。

## 3. 已有的工程化

- SQL 已筛 SPU online，GetProductDetail 的 not-found 已映射为 Connect not_found；旧 TODO 的「全部 unknown」不能复述。
- 金额有 decimal/Money 映射，而不是所有边界都用 float。
- JSON 解析错误记录日志与 OTel，能定位异常。
- Gorse ItemSync 已由 Fx 装配，支持隐藏下架商品、upsert、失败不推进游标。
- 工作树包含 gorse LiveClient 热重建，需区分本地改动与已发布版本。
- 搜索投影包含 active SKU 的价格选择、销量和更新时间维护。

这些保护有价值，但不能掩盖成功数据映射错误。

## 4. 当前最值得修的缺陷

### PR1 SQL 聚合 JSON 与 Go 字段不匹配

`query.sql` 使用 `json_agg(k.*)`。数据库 JSON 的键是 `id`、`sku_code`、`merchant_id` 等，解码目标却是无对应 JSON tag 的 ProductSku，字段为 SkuID、SkuCode、MerchantId。

JSON 解码只认识约定的键，不会自动推导「id 在这个表里应该是 SkuID」。结果可能不是抛错，而是保留零值：SKU ID 0、空编码、缺失商家信息。前端再把它拿去加购，错误跨层放大。

修复有两种局部方式：显式生成匹配键的 JSON，或使用带准确 JSON tag 的 data DTO 后转换到领域结构。都要**显式列字段**，不要继续用 k.* 把以后新增的敏感列自动暴露到公共契约。

### PR2 SKU 状态与公共字段没有收口

当前详情 SQL 筛了 SPU online，却未筛 SKU active；ProductSku.Status 又使用 SPU 的状态类型。SPU 的 draft/online 与 SKU 的 active/inactive 不是同一种枚举。

同时公共 proto 包含 cost_price。修复映射时如果顺手把所有字段都正确填上，可能把原来零值掩盖的成本价暴露给匿名调用方。

**先定义公共字段白名单，再修映射**。公开详情只返回购买所需字段；内部成本和经营数据由受保护接口提供。不能把「后端已有这个字段」等同于「浏览器应该看到」。

### PR3 坏数据仅告警，仍成功返回

SKU/spec JSON 解码失败后记录 Warn，但继续返回成功对象。调用方无法区分「合法无 SKU」与「数据契约损坏」。

哪些字段可降级、哪些关系到交易，要逐项决定。SKU ID、商家和价格的核心映射失败不应默默返回可购买商品；可选装饰属性可以降级，但需明确响应语义。

### PR4 推荐同步游标可能不前进

同步 SQL 使用 `updated_at > cursor`、只按时间排序再 LIMIT；业务批次还回拨时间窗，满批立即继续。如果同一时刻或回拨窗内的记录超过批量，可能一直读取同一批，后续记录被饿死。

**水位/游标**是已经处理到哪的证据，不能只保存一个不唯一的时间戳。应使用稳定复合排序键，例如更新时间与 ID，一并比较、一并推进；若保留重叠窗口，区分本轮扫描位置与持久高水位。

此外该查询依赖 SPU updated_at，单独改 SKU 价格不一定更新它。需要像搜索投影一样明确 SKU 变化如何触发商品投影更新。不要只缩短轮询周期，它不能修复漏变更。

### PR5 列表和业务销量链仍不完整

只有详情 RPC。列表应按 [listing 设计](../design/product/listing.md) 落地，不把 search 的固定20条当作商品目录分页。

销量已有 [sale_detail 与汇总](../../backend/services/product/internal/data/migrations/00003_sale_detail.sql)，但尚不能宣称订单事件写入、重复消费、退款调整已实现。销量不能由 browser purchase 埋点当权威输入。

## 5. 对接契约

| 消费者/提供者 | 必须明确 | 为什么 |
|---|---|---|
| merchant → product | merchant_id格式、店铺/商家归属、可发布状态 | 经营者只能管理自己的商品 |
| product → cart | 正确SPU/SKU ID、商家、可售规格、展示价格 | 零ID/状态错映射会让加购失败；展示快照不等于成交价 |
| product → order | 批量权威报价、状态、金额单位、价格版本/有效期 | 不能逐SKU无限RPC，也不能让前端改价生效 |
| product → search | 投影列、mapping、上线/删除语义、稳定spu_code | 数据同步成功也可能因字段错位变成无用索引 |
| product → behavior/gorse | ItemId=spu_code、类目、隐藏下架、幂等更新 | 同一个商品在两个系统必须指向同一对象 |
| order → 销量 | 可信业务事件、event_id去重、paid_at与退款政策 | 重放不重复加销量，页面刷新不改变成交事实 |

商品详情里的库存展示只能是参考。最终是否可买由 inventory 原子预占，不能拿一个旧 StockQuantity 字段保证交易。

## 6. 性能、扩展与高内聚

详情的多 SKU 聚合不是天然错误，但要验证行数、索引与 payload。避免 N+1 是「批量查所需对象」，不是把整张表一次拉进进程。

先用真实字段形状和代表性 SKU 数验证正确性，再用 EXPLAIN/固定请求集测延迟和负载；只有确有收益且失效规则清晰时再加服务端缓存。缓存的 price/status 不能越过下单权威核验。

把目录查询、商品写用例、投影同步拆为内部模块，各自定义接口，不因有两个后台任务就新建两个微服务。接口不暴露 gorse/ES SDK；一个生产 provider 足够时不制造空注册平台。

## 7. 分阶段练习

| 练习 | 修复范围 | 验收 |
|---|---|---|
| PR-A 详情可信 | 显式字段映射、SKU状态、公共响应白名单、错误语义 | 用真实JSON形状得到非零ID/正确商家；inactive不购买；匿名无成本价；损坏数据不伪报可售 |
| PR-B 可浏览目录 | 按既定设计实现列表与分页，核对金额转换 | 连续翻页不重不漏；大ID无精度损失；Money→分不丢精度；无任意排序字段注入 |
| PR-C 投影可恢复 | 稳定复合游标、SKU变更传播、幂等销量事件 | 同刻超批不饿死；失败不越过未处理数据；重放不重复销量；下架从搜索和推荐消失 |

已有 [product_test](../../backend/services/product/internal/service/product_test.go) 主要证明错误映射，不证明上述成功数据正确。优先补能复现零 ID 与游标卡住的测试，少做镜像实现的表面断言。
