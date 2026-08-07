# 搜索服务设计（CQRS 架构）

> 从根 `DESIGN.md` 拆出（2026-08-08）。现状：`Search`（ES + OTel）已实现；
> CQRS 读写分离、商品数据实时同步（依赖 `ProductChangedEvent`，Kafka 侧为 0）、
> 聚合筛选/智能排序/热门词均未落地，进度以 `TODO.md` 为准。

采用 CQRS 命令查询职责分离架构，实现高性能、高灵活的商品搜索能力，适配电商海量商品检索场景。

**核心架构设计**

1. CQRS 读写分离

- 命令端（写操作）：商品的创建、更新、上下架等写操作，全部走 PostgreSQL 主库，保证数据一致性；操作完成后发布ProductChangedEvent事件，通过
  Kafka 异步同步数据至 Elasticsearch。

- 查询端（读操作）：所有商品搜索、筛选、排序查询，全部走 Elasticsearch，针对查询场景做极致优化，支持高并发查询请求，避免查询压力影响主业务数据库。
  Elasticsearch 索引设计
  商品索引核心 Mapping 设计，适配电商搜索核心场景：

```json
{
  "mappings": {
    "properties": {
      "spu_id": {
        "type": "keyword"
      },
      "sku_id": {
        "type": "keyword"
      },
      "merchant_id": {
        "type": "keyword"
      },
      "name": {
        "type": "text",
        "analyzer": "ik_max_word",
        "search_analyzer": "ik_smart"
      },
      "description": {
        "type": "text",
        "analyzer": "ik_max_word"
      },
      "category_id": {
        "type": "keyword"
      },
      "category_path": {
        "type": "keyword"
      },
      "brand_id": {
        "type": "keyword"
      },
      "price": {
        "type": "scaled_float",
        "scaling_factor": 100
      },
      "sale_count": {
        "type": "integer"
      },
      "attributes": {
        "type": "nested"
      },
      "status": {
        "type": "integer"
      },
      "created_at": {
        "type": "date"
      }
    }
  }
}
```

**核心搜索能力**

- 全文检索：基于 IK 分词器实现中文分词，支持商品名称、描述的模糊匹配、精准匹配，支持同义词、纠错词配置。
- 多维度聚合筛选：实现类目、品牌、价格区间、商品属性（颜色、尺寸、存储等）的多条件组合筛选，通过 ES 聚合能力实现侧边栏筛选选项动态生成。
- 智能排序：支持相关度排序、销量排序、价格升降序、新品排序，支持自定义综合排序权重（销量、评价、价格等多维度加权）。
- 搜索推荐：基于 ES Completion Suggester 实现输入框搜索词自动补全、热门搜索词推荐、相关搜索推荐。

**性能优化**

- 热门搜索结果缓存至 Redis，设置合理的过期时间，降低 ES 查询压力；
- 商品数据增量同步，仅同步变更字段，避免全量更新导致的性能损耗；
- 针对深分页场景，采用 search_after 优化，避免 from+size 深分页导致的性能问题。
