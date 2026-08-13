# product 服务领域设计（早期稿）

> ⚠️ 文末「SPU 与 SKU 职责分工」列的 7 个接口（ListSpus/GetSpuDetail/…）**均未进 proto**，
> `product.proto` 现只有 `GetProductDetail`；列表页现行设计是
> `docs/design/product/listing.md` 的 `ListProducts`（游标分页），与本文命名未统一——
> 落地以 proto 为准。文中 Flink/Kafka 实时计算链路全仓未落地。

商品微服务应承担的核心功能：

1. 商品基础信息管理 (CUD 操作)商品服务负责数据的写入和更新。类目与属性管理：管理分类树（Category Tree）和属性模板（如手机的“内存”、“颜色”）。
    1. SPU/SKU 管理：定义标准化产品单元（SPU）和库存单元（SKU）的关系。
    2. 商品发布流：处理商品的创建、编辑、审核、上架/下架逻辑。
    3. 图文详情描述：存储和管理商品的富文本介绍、视频、主图列表。

2. 数据同步机制 (核心逻辑)由于搜索服务依赖商品数据，商品服务必须在数据变更时通知搜索服务。
    1. 领域事件发布：当商品价格更改、库存售罄或状态下架时，通过 消息队列 (MQ) 发送消息（如 product.updated）。
    2. 增量同步接口：提供给 Canal 或其他 ETL 工具使用的接口，确保数据库与 Elasticsearch 最终一致。

3. 高性能读请求 (点对点查询)搜索服务负责“找商品”，而商品服务负责“展示商品”。
    1. 商品详情页 (PDP) 渲染：当用户通过搜索点击进入详情页，通过 product_id 获取最实时的完整数据。
    2. 批量 ID 查询：购物车、订单等服务需要根据 ID 列表获取商品名称、当前单价和缩略图。
    3. 多级缓存策略：利用 Redis 或本地缓存处理超高并发的详情查看请求。

4. 业务规则校验价格逻辑：管理吊牌价、销售价，以及复杂的阶梯定价逻辑。
    1. 销售限制：判断商品是否在当前地区禁售、是否超过购买限额。
    2. 库存联动（只读/校验）：虽然库存通常有独立服务，但商品服务需要聚合展示“是否有货”的状态。

与搜索微服务的边界

| 功能   | 商品微服务 (Product)           | 搜索微服务 (Search)                                                   |
|------|---------------------------|------------------------------------------------------------------|
| 存储媒介 | 关系型数据库 (MySQL/PostgreSQL) | 搜索引擎 (Elasticsearch/Meilisearch)搜索引擎 （Elasticsearch/Meilisearch） |
| 主要职责 | 数据准确性、事务控制、状态变更           | 检索效率、相关度评分、多维聚合                                                  |
| 典型请求 | GetProductById(123)       | "Search(""iPhone 16"", filter: ""blue"")"                        |
| 更新频率 | 低频（后台修改、库存变化）             | 高频同步（近实时同步）                                                      |


## 分类
分类摘自抖音电商[个人店铺可经营类目明细表](https://school.jinritemai.com/doudian/web/article/101824)可经营的类目范围:[《个人店可经营类目一览表](https://bytedance.larkoffice.com/sheets/HYVesq1UVh0WoAtqY06cLke5nQe) (2025.7.25更新）

## 功能设计
### SPU 列表页的价格展示
主流做法的对比与取舍：

1. 取最低价（最常见）
   做法：展示该 SPU 下所有可售 SKU 中的最低价，通常前面会有“¥”或“起”字。

示例：某手机 SPU 下有 5999、6999、8999 三个 SKU，列表页显示 “¥5999 起”。

优点：最大化点击欲望，价格门槛低。

缺点：用户点进去后发现想要的颜色可能要 8999，可能产生落差。但业界认为点击率比落差更重要，因此电商平台几乎都采用此方案。

实现：可以在 SPU 表冗余一个 min_price 字段，当 SKU 新增/修改/上下架时实时更新，查询列表时直接读该字段，无需实时聚合。

2. 取价格区间（精确但较重）
   做法：展示该 SPU 下的最低价 - 最高价区间，如 “¥5999 - 8999”。

示例：某机票或酒店房型，因规格差异极大，常用区间表达。

优点：信息量最丰富，用户能直观知道价格跨度。

缺点：占用显示空间，且容易分散用户注意力。当最低价和最高价相差悬殊时，对用户的吸引力反而不如“最低价起”。

实现：同样需要 SPU 表冗余 min_price 和 max_price 两个字段。

3. 取默认 SKU 或销量最高 SKU 的价格（精准但维护成本高）
   做法：人为设置一个“主推 SKU”，列表显示该 SKU 的价格。

示例：商家将“深空黑 256GB”设为默认展示，列表显示 6999。

优点：所见即所得，用户不会产生价格预期偏差。

缺点：需要运营/商家指定默认 SKU，否则可能展示的并不是用户最想看到的；当主推 SKU 缺货时，需要自动切换到其他 SKU，维护逻辑较复杂。

适用场景：中高端品牌，希望精准引导用户选择某款 SKU。

4. 取“券后价”或“促销最低价”（营销驱动）
   做法：计算可售 SKU 叠加所有优惠券、促销活动后的最低价，展示为“预估到手价”。

优点：吸引用户点击，提升转化率。

缺点：计算复杂，对实时性要求高；如果显示价格与最终实际支付价格不一致，可能引发客诉。

5. 技术实现上的关键权衡
   方案	实现复杂度	性能	灵活性
   SPU 表冗余最低价	低（需更新维护）	极高（列表查询无聚合）	低（只能展示最低价）
   实时聚合查询 SKU	中（索引优化）	中（需聚合，但数据量小）	高（可根据业务规则动态选择）
   搜索引擎（ES）聚合	中（同步机制）	高（搜索引擎实时聚合）	极高（可组合复杂查询）
   业界主流选择：SPU 表冗余最低价 + 实时校验。

在 SPU 表中存储 min_price 和 max_price（或仅 min_price），当 SKU 发生任何价格变动时，通过触发器或领域事件更新 SPU 表的价格字段。

列表查询直接读 SPU 表，性能极佳。

当用户进入详情页时，再实时查询所有 SKU 的最新价格，确保前端展示的 SKU 价格是最新的。

### 商家功能提供默认SKU, 价格区间, 销量最高的SKU价格
为了让商家拥有灵活且智能的价格展示策略，你需要对现有的商品数据库做一些调整，并引入一个轻量级的实时计算和兜底逻辑。下面是一套完整的、可落地的方案，涵盖数据层、计算层和应用层的设计。

一、数据库表结构修改
你需要在 SPU 和 SKU 表中增加一些冗余字段来支持这些新模式。

1. 新增价格展示模式枚举
   sql
   CREATE TYPE price_display_mode AS ENUM (
   'MIN_PRICE',        -- 最低价
   'PRICE_RANGE',      -- 价格区间
   'DEFAULT_SKU',      -- 商家指定的默认SKU
   'BEST_SELLING_SKU'  -- 系统自动计算的销量最高SKU
   );
2. 修改 SPU 表
   sql
   ALTER TABLE products.spus
   ADD COLUMN min_price DECIMAL(10,2) DEFAULT NULL,
   ADD COLUMN max_price DECIMAL(10,2) DEFAULT NULL,
   ADD COLUMN default_sku_id BIGINT DEFAULT NULL,
   ADD COLUMN default_sku_price DECIMAL(10,2) DEFAULT NULL,
   ADD COLUMN best_selling_sku_id BIGINT DEFAULT NULL,
   ADD COLUMN best_selling_sku_price DECIMAL(10,2) DEFAULT NULL,
   ADD COLUMN price_display_mode price_display_mode NOT NULL DEFAULT 'MIN_PRICE';
3. 修改 SKU 表（增加销量字段供 Flink 计算使用）
   sql
   ALTER TABLE products.skus
   ADD COLUMN sales_count INT NOT NULL DEFAULT 0;
   二、实时计算销量最高 SKU（Flink 方案）
   利用你已有的 Kafka 和 Flink，可以轻松实现销量实时聚合。

1. 数据源：订单支付成功事件
   当用户支付成功后，订单服务会发布 OrderPaid 事件到 Kafka。该事件中应包含每个商品的 sku_id 和 quantity。Flink 作业消费这个事件流，按 sku_id 实时聚合总销量。

Flink SQL 示例：

sql
INSERT INTO sku_sales
SELECT sku_id, SUM(quantity) as total_sales
FROM order_events
WHERE event_type = 'OrderPaid'
GROUP BY sku_id;
2. 写入 SKU 表
   Flink 计算结果后，可以通过 JDBC 或 Upsert Kafka 将结果写回数据库。为了减少数据库压力，建议使用 CDC 或 Kafka Connect JDBC Sink 定期批量更新 skus.sales_count。

3. 定期更新 SPU 的 best_selling_sku_id
   当 sales_count 发生变化后，需要更新对应 SPU 的 best_selling_sku_id 和 best_selling_sku_price。这可以通过一个定时任务（例如每 5 分钟执行一次）或数据库触发器来完成。

go
// 定时任务：更新 SPU 销量最高 SKU
func RefreshBestSellingSKU(ctx context.Context, db *pgxpool.Pool) {
rows, _ := db.Query(ctx, `
        SELECT id FROM products.spus WHERE price_display_mode = 'BEST_SELLING_SKU'
    `)
for rows.Next() {
var spuID int64
rows.Scan(&spuID)
// 重新计算该 SPU 下销量最高的 SKU
UpdateBestSellingSKU(ctx, db, spuID)
}
}
三、兜底方案：当销量全为 0 时
当商家选择了“销量最高”模式，但所有 SKU 销量都为 0 时，必须有一个优雅的降级策略，否则前端将显示一个不完整的空价格。

方案一：强制要求商家设置默认 SKU
在管理后台中，如果商家选择了 BEST_SELLING_SKU 模式，系统可以要求他同时设置一个 default_sku_id。当系统检测到所有 SKU 销量均为 0 时，自动降级为展示默认 SKU 的价格，并通知商家“因暂无销量数据，已切换为您预设的默认商品价格”。

方案二：系统自动降级
系统可以在查询 SPU 时，判断 best_selling_sku_id 是否为 NULL（或销量全为 0），如果是，则自动切换为 MIN_PRICE 模式展示。这种方案对商家零感知，但可能不符合商家的期望。因此推荐方案一，因为它给了商家最终的控制权。

在查询接口中的实现
go
func GetEffectivePrice(spu Spu) string {
if spu.PriceDisplayMode == "BEST_SELLING_SKU" {
// 如果销量最高 SKU 存在且价格有效，直接使用
if spu.BestSellingSkuId != nil && spu.BestSellingSkuPrice != nil {
return fmt.Sprintf("¥%.2f (销量最高)", *spu.BestSellingSkuPrice)
}
// 否则降级为默认 SKU 价格
if spu.DefaultSkuId != nil && spu.DefaultSkuPrice != nil {
return fmt.Sprintf("¥%.2f", *spu.DefaultSkuPrice)
}
// 如果连默认 SKU 都没有，最终降级为最低价
if spu.MinPrice != nil {
return fmt.Sprintf("¥%.2f 起", *spu.MinPrice)
}
return "暂无报价"
}
// ... 其他模式处理
}
四、商家管理界面
你需要为商家提供一个后台页面，允许他们：

设置每个 SPU 的价格展示模式（下拉选择）。

选择或搜索自己的 SKU，指定为默认 SKU。

查看当前销量数据。

接收系统通知（例如当默认 SKU 被下架时）。

五、数据一致性保障
SKU 变更触发 SPU 价格更新：任何时候 SKU 价格、状态或销量变更，都通过领域事件或直接调用 UpdateSpuPrice 函数来重算 SPU 的 min_price、max_price、best_selling_sku_id 等。

默认 SKU 被下架/删除：系统应自动将 price_display_mode 切换为 MIN_PRICE，并通过站内信或消息队列通知商家。

💎 总结
表结构：SPU 冗余最低价、最高价、默认 SKU 和销量最高 SKU 信息，SKU 增加销量字段。

实时计算：Flink 消费 Kafka 订单事件，聚合销量，异步写回数据库。

兜底：强制商家设置默认 SKU，系统在无销量数据时自动降级展示。

控制：商家在后台灵活选择展示模式。

这套方案既保证了展示的灵活性，又通过冗余和降级机制确保了用户始终能看到一个有意义的、准确的价格，完全符合生产级电商的标准。

### 用户浏览商品流程
1. 商品详情页（点击 SPU 后）—— 最核心场景
   用户从商品列表（SPU 列表）点击某个商品后，进入商品详情页。此时前端需要：

加载该 SPU 下的所有 SKU 列表（例如 iPhone 15 Pro 有“黑色 128GB”、“黑色 256GB”、“白色 512GB”等）。

展示默认选中 SKU 的详细信息：价格、库存状态、主图（SKU 缩略图）、规格属性（颜色、容量等）。

用户交互流程：

进入详情页 → 加载所有 SKU 的规格组合（如颜色、容量）。

展示默认 SKU（通常是第一个或销量最高的）的价格、库存、主图。

用户切换规格（如选择“白色”）→ 前端根据选中的属性组合，找到对应的 SKU 并更新价格、图片和库存状态。

2. 用户切换规格时 —— 动态更新页面
   当用户在详情页点击不同规格时，前端需要实时查询该 SKU 的最新价格、库存。

调用的接口示例：

protobuf
// 根据 SPU_ID + 属性组合获取唯一 SKU 的详细信息
rpc GetSkuByAttributes(GetSkuByAttributesRequest) returns (GetSkuByAttributesResponse);

message GetSkuByAttributesRequest {
int64 spu_id = 1;
map<string, string> attributes = 2; // 如 {"颜色": "白色", "容量": "512GB"}
}
为什么需要这个接口？

价格可能随时变化（例如限时折扣），不能只靠列表页缓存。

库存状态需要实时反映（“仅剩 2 件”或“暂时缺货”）。

SKU 主图可能因规格不同而变化（如不同颜色的手机展示不同颜色的图片）。

3. 加入购物车时 —— 校验与快照生成
   用户点击“加入购物车”时，前端需要：

确认当前选中的规格组合是否合法（是否存在该 SKU）。

获取该 SKU 的当前价格、缩略图、属性快照，以便写入购物车记录。

调用的接口示例：

protobuf
// 获取单个 SKU 的完整信息（用于加入购物车时的快照生成）
rpc GetSkuDetail(GetSkuDetailRequest) returns (GetSkuDetailResponse);

message GetSkuDetailRequest {
int64 sku_id = 1;
}
为什么购物车需要 SKU 快照？

防止商品调价后购物车中的价格与详情页不一致。

防止商品下架后购物车中的商品信息丢失（快照保留了当时的名称、图片等）。

下单时可以直接从购物车快照中获取商品信息，无需再次查询商品服务。

4. 下单结算页 —— 最终校验
   用户从购物车进入结算页，或从详情页直接购买时，前端/后端需要：

再次校验每个 SKU 的当前价格和库存，确保订单金额正确且商品可售。

生成订单中的商品快照（包括 spu_name、sku_name、sku_attributes、price 等）。

调用的接口示例：

protobuf
// 批量查询多个 SKU 的当前信息（用于下单时的最终校验）
rpc BatchGetSkuDetail(BatchGetSkuDetailRequest) returns (BatchGetSkuDetailResponse);

message BatchGetSkuDetailRequest {
repeated int64 sku_ids = 1;
}
总结：SPU 与 SKU 的职责分工
场景	使用的数据	调用的接口
商品列表页	SPU 简要信息（名称、主图、最低价格、销量）	ListSpus
商品详情页	SPU 详情 + 该 SPU 下所有 SKU 的规格列表 + 默认 SKU 详情	GetSpuDetail + ListSkusBySpuId
切换规格	根据选中的属性组合查询唯一 SKU 的价格/库存	GetSkuByAttributes
加入购物车	获取单个 SKU 的当前完整信息（价格、快照）	GetSkuDetail
下单结算	批量获取多个 SKU 的最新价格和库存	BatchGetSkuDetail
