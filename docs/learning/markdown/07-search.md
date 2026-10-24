# 07 搜索：把「查得快」和「交易正确」分开

[学习入口](README.md) · 前置：[商品](06-product.md) · 关联：[行为推荐](08-behavior.md)、[订单](10-order.md)

## 0. Git 证据：先有 ES 查询，后补读模型边界

**原始目标。** [f3fe86d3 README](https://github.com/lens077/ecommerce/blob/f3fe86d3/README.md) 把搜索列入首期六服务，总设计要求全文检索、筛选、排序、商品同步与读写分离；首期验收仍以完整购物链为准，不要求把所有远期搜索推荐一次做完。

**最早实现边界。** 2025-12-26 的 `64165b5f` 仅以mode160000保存search子仓指针，不能从它读本仓源码。最早展开可读的 [dbeeb59d searchRepo.Search](https://github.com/lens077/ecommerce/blob/dbeeb59d/backend/services/search/internal/data/search.go)（2026-04-26）直接用ES TypedClient：请求指定Index，多字段MultiMatch，逐hit解析map，现场从SKU数组取最低价、从sale_detail累销量，再强转uint32 ID。这是「在已存在索引上做关键词查询」，不是已经完成可靠的商品同步链。

| 演进 | 已核对实现 | 解决的旧限制 / 剩余限制 |
|---|---|---|
| [d8186ed7](https://github.com/lens077/ecommerce/blob/d8186ed7/backend/services/search/internal/data/search.go)，2026-08-21 | 换Meilisearch，消费规范化Doc，ID检查/销量上界保护 | 少了手工嵌套map解析，但repo仍读vendor的Hits/DecodeInto，接口隔离不完整 |
| [61c520b1](https://github.com/lens077/ecommerce/blob/61c520b1/backend/services/search/internal/data/catalog.go)，2026-09-01 | 回到ES，SearchCatalog仅返回项目DTO，alias由服务端配置 | 不再让客户端任挑索引；换provider主要收在adapter，但只有一个生产实现 |
| 当前 | PG搜索投影经CDC搬运、online过滤、错误码分类与测试 | 仍无分页、ID位宽偏窄、价格展示为double；同步延迟/恢复和容量要单独验 |

**原始MVP判定：关键词查询切片具备，整个原始购物MVP不因此成立。** 可用它做隔离浏览验证，但完整搜索设计里的筛选/分页等未齐。**生产判定：未取得当前版本的完整同步/权限/容量/恢复证据，且有明确的大ID丢弃限制；不能直接批准生产。** 本章第6节给出最小优化顺序，不要求为了评分重写搜索引擎。

## 1. 先理解业务与术语

搜索的任务是帮用户找到可能想买的商品，不是证明此刻价格与库存一定可成交。

- **读模型 / 投影（Read Model / Projection）**：为某种查询预先整理的数据副本。像书末索引，方便找内容，但不是原文的编辑入口。
- **CQRS**：读写职责分离。这里 product 的 PostgreSQL 持有商品事实，search 查询 Elasticsearch 投影，不是建了两份都能随便写的商品库。
- **CDC（Change Data Capture）**：捕获数据库行变化，把它送到下游；它知道哪一行变了，不自动知道订单是否被业务接受。
- **Alias（别名）**：调用方使用的稳定索引名，背后可切换不同物理索引，避免重建时让客户端改配置。
- **最终一致性**：数据传播允许延迟，但需要可观测、可修复；不是「晚一点总会自己好」。

## 2. 早期查询切片与当前实现

早期实际切片是接收关键词并查询ES商品卡片，曾允许请求选择索引；现在主动收窄索引选择权，并把展示计算前移到读投影。这个变化是从「灵活查询」走向「有界、可控的公共接口」，不是简单换了一个SDK。

当前 [SearchRequest](../../backend/api/search/v1/search.proto) 仍保留旧 `index` 字段，但标记 deprecated，服务端只用 `name`。这是兼容迁移：保留字段号让旧客户端还能发送，不再让客户端决定访问哪个索引。

读取路径：

```text
SearchService.Search → SearchUseCase → searchRepo
                                      ↓
                       SearchCatalog.SearchProducts
                                      ↓
                           Elasticsearch 固定 alias
```

写入路径是另一条链：product 的 `products.search_catalog` 投影表 → CDC → Kafka Connect Sink → Elasticsearch。**不是 search 进程消费 Kafka，也不是 product 每次查询都同步调用 search。** matrix 的 search `depends_on` 为空，不能画成 product RPC → search RPC 的已接线关系。

## 3. 相对早期查询实现的工程化进展

| 能力 | 源码依据 | 为什么有价值 |
|---|---|---|
| 隔离搜索 SDK | [SearchCatalog](../../backend/services/search/internal/data/data.go)、[esCatalog](../../backend/services/search/internal/data/catalog.go) | 业务获得自有 CatalogProduct，不直接解析 Elasticsearch SDK 响应 |
| 服务端固定 alias | [service.Search](../../backend/services/search/internal/service/search.go) | 不允许请求任意指定内部索引 |
| 只查 online 商品 | [searchindex.Client.SearchProducts](../../backend/pkg/searchindex/client.go) | 查询层再次过滤状态，避免公开搜索展示非上架商品 |
| 有界查询与超时 | 同一 client 的 limit 与 withTimeout | 防止全量查询耗尽内存；超时从请求 context 传播 |
| 故障语义 | [searchError](../../backend/services/search/internal/service/search.go) | unavailable、canceled、deadline_exceeded 区分；不伪装成没有商品 |
| 实质健康检查 | client.Health 检查服务器、alias 与查询 | 不止探测 TCP 端口或进程存活 |
| 有针对性的测试 | [data 测试](../../backend/services/search/internal/data/search_test.go)、[service 测试](../../backend/services/search/internal/service/search_test.go) | 证明错误映射、文档转换、vendor 类型不泄漏及重启提示 |

Git `61c520b1` 是搜索引擎迁移节点，`00e7cbde` 是错误语义修正节点。它们是已核实代码演进，不是本轮重跑了线上搜索验收。

## 4. 当前缺陷和取舍

### SR1 ID 位宽会丢商品

`searchRepo.Search` 将 ID 限制在 `math.MaxUint32`，超过就记录告警并跳过；proto 的 `Product.id` 也是 uint32。但数据库/商品链使用更宽的整数 ID。

**位宽**决定可表达数字范围。uint32 最多约 42.9 亿；这不是「服务最多支持多少商品」，而是「某个合法 ID 的数值一旦超范围就消失」。一个随机或分布式生成的 ID 很早就可能很大。

修复方向：由商品契约决定统一 ID 表示，通常保持 64 位边界并让 TS 使用 bigint/字符串。先补「大于 uint32 的合法商品仍能被展示」测试，再按 proto 兼容纪律迁移；不能只删范围检查后继续强转。

### SR2 搜索价格的 double 不能直接进入交易

搜索 proto 的 `price` 是 double，购物车使用整数分。浮点数适合某些近似计算，不适合作为最终金额真相。

目前可以将搜索价格限定为展示信息；下单必须从权威商品定价获取报价。长期统一读模型与 API 金额表示时，明确 currency、分单位、空值和上下限，避免前端乘 100 后再四舍五入修补精度。

### SR3 没有分页和明确续页语义

公开 SearchRequest 没有 page size 或 cursor；catalog 把 limit 传 0，client 使用默认 20。用户不能可靠地翻到更多结果。

**游标（Cursor）**是上次排序位置的标记，不是任意 SQL 字符串。要加分页，必须一起确定稳定排序、tie-break ID、最大页大小和游标校验；深分页不宜无限堆 offset。接口、投影 mapping、前端加载状态必须同批对齐。

### SR4 配置更新仍需重启；数据传播也需验收

catalog 订阅配置变化只 WARN，不热换 ES client。属于已声明边界，不是偷偷修一次 YAML 就已切流。

另外，alias 存在和 Search HTTP 成功不证明投影新鲜。更新、删除、重建、offset 恢复的验收归 CDC 链，需要固定数据集和差异比对；详见 [搜索设计](../design/search/search.md) 与 TODO，不把静态索引当运行态证明。

## 5. 与其他模块的契约

| 对接方 | 交付内容 | 必须对齐 |
|---|---|---|
| product / CDC | ID、spu_code、状态、展示字段与投影更新 | SQL 字段名、ES mapping、删除语义、版本；spu_code 也服务推荐 |
| consumer / consumer-next | 商品卡片、详情跳转 | 64 位 ID 不经 JS number 丢精度；无结果与后端故障不同 |
| order | 搜索不直接提供最终成交依据 | 不拿搜索价建单，不拿可搜索证明有库存 |
| 配置中心 | endpoint、固定 alias、受限凭据 | 写入 Schema、启动校验、重启生效与只读权限 |

不要为了整齐给 search 加商品数据库写权限。低耦合的关键正是它可以丢失并重建，而不会改变商品事实。

## 6. 分阶段练习

| 练习 | 改造边界 | 验收问题 |
|---|---|---|
| SR-A 契约尺寸 | ID/金额的读模型与 proto 兼容改造 | 大 ID、边界金额、空结果、非法文档分别怎样处理？新增回归不能只测小整数 |
| SR-B 查询能力 | 服务端有界分页 + 前端游标 | 翻页不重复、不漏项；篡改游标明确拒绝；超上限不扩成全量查询 |
| SR-C 恢复闭环 | CDC 与 alias 切换的受控环境演练 | 商品改价/下架后最终可见；断链有告警；重建后固定查询集结果和数量可解释 |

性能先以固定关键词集记录延迟分布与相关性，再调整 mapping、字段权重和索引；不要把「返回得快」当成「搜得准」。

源码级测试入口：在 `backend/` 运行 `go test -short ./services/search/... ./pkg/searchindex/...`。这不替代真实 Elasticsearch/CDC 的验收，本轮未执行该测试。
