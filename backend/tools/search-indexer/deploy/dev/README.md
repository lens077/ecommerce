# dev 搜索索引链路部署

本目录保存 search indexer 与一次性 reindex Job 的 dev 清单。outbox relay 清单位于
`tools/outbox-relay/deploy/dev/deployment.yaml`，商品示例数据 Job 位于
`tools/dbmigrate/deploy/dev/product-seed-job.yaml`。

## 前置条件

1. NATS JetStream 已在 `nats` 命名空间运行，集群内地址为 `nats.nats.svc:4222`。
2. PostgreSQL 已包含 `products.outbox` 迁移。
3. Meilisearch 已运行，集群内地址为 `meilisearch.search.svc:7700`。indexer 会幂等创建并配置
   `products` 索引。
4. `ecommerce` 命名空间已创建以下 Secret：
   - `ecommerce-cdc-postgres:DB_URI`：使用 `sslmode=verify-full`，CA 路径为
     `/etc/postgresql/ca/ca.crt`。
   - `ecommerce-cdc-postgres-ca:ca.crt`：CloudNativePG CA，不复制 `ca.key`。
   - `ecommerce-search-indexer:MEILI_API_KEY`：只允许持续写入 `products`。
   - `ecommerce-search-reindex:MEILI_API_KEY`：只供 reindex Job 使用。
   - `tcr-pull-secret`：拉取私有 TCR worker 镜像。

Secret 只存于 Kubernetes 和忽略的本地凭据清单，不创建带明文值的 YAML。通过文件创建
`MEILI_API_KEY` 时，必须确保文件末尾没有换行；换行会进入 HTTP `Authorization` 头，Go
客户端随后返回 `invalid header field value`。

## 部署顺序

1. 部署 relay。relay 幂等创建 R1 `ECOMMERCE_EVENTS` stream，并抢占 PostgreSQL 咨询锁。
2. 部署 indexer。indexer 创建 durable consumer `search-indexer`，并保持
   `MaxAckPending=1` 的串行消费。
3. 只在需要代表性 dev 商品时运行 product Seed Job，不要对 pre/prod 使用。Seed Job 使用
   goose no-versioning 模式，可以幂等重跑。
4. 运行 reindex Job。固定 Job 名阻止 Kubernetes 内并发，PostgreSQL 咨询锁阻止手工进程
   与 Job 并发；重跑前先删除已结束的旧 Job。

```bash
kubectl apply -f tools/outbox-relay/deploy/dev/deployment.yaml
kubectl apply -f tools/search-indexer/deploy/dev/deployment.yaml
kubectl apply -f tools/dbmigrate/deploy/dev/product-seed-job.yaml
kubectl apply -f tools/search-indexer/deploy/dev/reindex-job.yaml
```

不要并发运行两个 reindex Job。两个进程会同时修改 `products_rebuild`，无法保证 index swap
结果。

## 验收

```bash
kubectl -n nats exec deploy/nats-box -- \
  nats stream info ECOMMERCE_EVENTS
kubectl -n nats exec deploy/nats-box -- \
  nats consumer info ECOMMERCE_EVENTS search-indexer
kubectl -n ecommerce logs deploy/ecommerce-outbox-relay
kubectl -n ecommerce logs deploy/ecommerce-search-indexer
kubectl -n ecommerce logs job/ecommerce-search-reindex
kubectl -n ecommerce port-forward svc/ecommerce-search-service 18002:30002
# 另开终端：
tools/search-indexer/relevance-smoke.sh
```

验收时确认：

- stream 使用 file storage，副本数为 `1`，subject 为 `events.>`。
- consumer filter 为 `events.product.>`，`MaxAckPending=1`，无 pending 或 ack pending。
- outbox 行在 PubAck 后写入 `published_at`。
- reindex Job 正常退出，`products` 文档数与 PostgreSQL 非 deleted SPU 数一致。

## 当前限制

- Product Service 当前没有商品写 RPC，也没有调用 `outbox.Insert`。已部署链路只消费写入
  `products.outbox` 的事件；全量商品由 reindex Job 回灌。新增商品写路径时，必须在业务事务中
  同步写 outbox，不能在事务提交后补写。
- NATS 当前只暴露集群内 Service，但尚未启用 TLS 或客户端认证。不要把 `4222` 暴露到集群外。
- relay 与 indexer 没有入站 API，因此不创建 Service。当前二进制也没有独立 readiness
  endpoint；Deployment Ready 不能替代 stream、consumer 和日志验收。
- indexer 在同一事件投递 5 次失败后执行 `TERM`，目前只写错误日志，没有持久 DLQ。dev
  relay 因此设置 `-retention=-1s`，不自动删除已发布 outbox 行；发生 terminal delivery 时，
  运行 reindex 修复投影。恢复 outbox 自动清理前，必须先补持久 DLQ 和告警。
- Meilisearch 的 index swap task 没有单一 `indexUid`，限定为
  `indexes: ["products", "products_rebuild"]` 的 key 无法读取该 task。reindex key 因此使用
  `indexes: ["*"]`，但 actions 仍限制为文档、索引、设置和任务的必要写操作；持续 indexer
  继续使用仅限 `products` 的独立 key。
