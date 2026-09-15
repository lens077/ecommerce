# Kafka/Connect/Elasticsearch 恢复手册

本文用于从空集群或故障后的可控恢复，不包含任何密码、API key 或管理员 token。凭据只从 Kubernetes Secret、OpenBao 和 Config Center 获取。

## 适用拓扑

```text
node3 Pigsty PostgreSQL
        |
        | ecommerce_cdc replication slot
        v
k8s KafkaConnect (kafka/my-connect-cluster)
        |
        v
k8s Strimzi Kafka (kafka/my-cluster)
        |
        v
k8s Elasticsearch (elasticsearch/elasticsearch)
        |
        v
search -> Config Center: search/pre/bootstrap.yaml
```

正式名称必须保持一致：

- PostgreSQL slot：`ecommerce_cdc`
- Debezium topic prefix：`ecommerce_cdc`
- source connector：`ecommerce-postgres-source`
- sink connector：`ecommerce-elasticsearch-sink`
- 搜索 alias：`ecommerce_catalog_products`
- 搜索索引：`ecommerce_catalog_products_v1` 或后续版本化索引

## 0. 前置检查

```bash
kubectl get nodes
kubectl -n kafka get kafka,kafkaconnect,kafkaconnector
kubectl -n elasticsearch get pod,svc,pvc
kubectl -n minio get pod,externalsecret,secret
```

确认 node3 PostgreSQL 可达，且没有第二套 source connector 正在消费同一业务表。

## 1. 恢复 OpenBao 和 ESO

OpenBao 服务为 `openbao.openbao.svc:8200`，线上集群前缀为 `k8s/hosting/`。

MinIO 凭据路径：

```text
secret/k8s/hosting/minio
```

ExternalSecret 必须引用：

```text
minio/minio-root
  user     <- k8s/hosting/minio:user
  password <- k8s/hosting/minio:password
```

检查：

```bash
kubectl -n minio get externalsecret minio-root \
  -o jsonpath='{.status.conditions[0].reason}{" "}{.status.conditions[0].message}{"\n"}'
```

预期为 `SecretSynced`。如果需要重新 seed，使用仓库工具；不要把 root token 写入文件或命令行历史：

```bash
BAO_TOKEN='<一次性受限管理 token>' \
  bash tools/openbao-seed.sh minio
```

恢复后验证 `silo.apikv.com` 控制台和 `silo-api.apikv.com/minio/health/live`，但不回显凭据。

## 2. 恢复 Elasticsearch

1. 应用 `components/elasticsearch/manifests/`。
2. 确认 `elasticsearch-0` Ready、cluster health 为 GREEN。
3. 确认探针使用挂载的密码文件；安全开启时匿名 `GET /` 返回 401 是预期行为，不能用匿名 200 作为探针。
4. 应用 pipeline 的 7 套 index template：
   - `ecommerce-cdc-ecommerce_orders_order_main`
   - `ecommerce-cdc-ecommerce_orders_order_item`
   - `ecommerce-cdc-ecommerce_orders_order_log`
   - `ecommerce-cdc-ecommerce_products_skus`
   - `ecommerce-cdc-ecommerce_products_spus`
   - `ecommerce-cdc-ecommerce_products_sale_detail`
   - `ecommerce-cdc-ecommerce_catalog_products`
5. 创建 `<alias>_v1`，再创建同名 write alias，`is_write_index=true`。
6. 单节点必须设置 `number_of_replicas=0`。

不要让 sink 先自动创建索引，否则可能使用错误 mapping。`updated_at` 等字段必须以 pipeline `index-mappings.json` 为准。

## 3. 恢复 Kafka

应用 `components/kafka/cdc/kafka-single-node-internal.yaml`，依次确认：

```bash
kubectl -n kafka get kafka my-cluster
kubectl -n kafka get pod -l strimzi.io/cluster=my-cluster
kubectl -n kafka get pod -l app.kubernetes.io/name=kafka-exporter
```

Kafka 只使用内部 listener：

```text
my-cluster-kafka-bootstrap.kafka.svc:9092
```

Kafka exporter 必须 Ready，并暴露 `:9404`。它只抓 `ecommerce_cdc.*` topic 的 consumer lag。

## 4. 恢复 KafkaConnect

1. 应用 `components/kafka/cdc/kafka-connect.yaml`。
2. 确认镜像包含：
   - `io.debezium.connector.postgresql.PostgresConnector`
   - `io.confluent.connect.elasticsearch.ElasticsearchSinkConnector`
3. 确认 `config.providers=secrets` 和 Kubernetes Secret RBAC 已生效。
4. 应用 `connect-rest-netpol.yaml`，只允许 `ops` 命名空间访问 REST 8083。

检查：

```bash
kubectl -n kafka get kafkaconnect my-connect-cluster
kubectl -n kafka get kafkaconnector
```

## 5. 恢复 replication slot 和 source

确认旧 node3 Connect 已停止，且 PostgreSQL 上没有同名 active slot 后：

```sql
select slot_name, active from pg_replication_slots;
```

只保留一个正式 slot：

```text
ecommerce_cdc
```

如果要重快照且槽已不存在，应用 `ecommerce-postgres-source.yaml`，让 Debezium 按 `snapshot.mode=initial` 创建槽。不要预先手工创建同名槽，否则 Debezium 会因已有槽而失败。

预期配置：

```text
slot.name=ecommerce_cdc
topic.prefix=ecommerce_cdc
publication.name=ecommerce_cdc
tombstones.on.delete=true
transforms.unwrap.delete.tombstone.handling.mode=delete-to-tombstone
```

验证：

```bash
kubectl -n kafka get kafkaconnector ecommerce-postgres-source -o json \
  | jq '{state: .status.connectorStatus.connector.state, tasks: [.status.connectorStatus.tasks[].state]}'
```

预期为 `RUNNING / RUNNING`。

## 6. 恢复 Elasticsearch sink

应用 `ecommerce-elasticsearch-sink.yaml`。sink 读取：

```text
kafka/cdc-elasticsearch
```

该 Secret 只保存 `ecommerce_cdc_sink` 凭据。

7 个 topic 映射到 7 个正式 alias，不得添加 `_k8s` 后缀。DLQ 使用：

```text
ecommerce_cdc.elasticsearch.dlq
```

单 broker 的 DLQ replication factor 必须为 `1`。

验证：

```bash
kubectl -n kafka get kafkaconnector ecommerce-elasticsearch-sink -o json \
  | jq '{state: .status.connectorStatus.connector.state, tasks: [.status.connectorStatus.tasks[].state]}'
```

预期为 `RUNNING / RUNNING`。

## 7. 数据验收

按顺序检查：

```bash
# connector 状态
kubectl -n kafka get kafkaconnector

# Kafka sink lag
curl -sS 'https://metrics.apikv.com/api/v1/query?query=kafka_consumergroup_lag{consumergroup="connect-ecommerce-elasticsearch-sink"}'

# ES alias
kubectl -n elasticsearch port-forward svc/elasticsearch 19200:9200
```

应满足：

- catalog：7
- skus：13
- spus：7
- sale_detail：21
- orders：当前 0
- sink lag：稳定为 0
- ES health：GREEN

然后使用临时隔离行验证：

1. PostgreSQL insert；
2. ES 出现文档；
3. PostgreSQL update；
4. ES 字段更新；
5. PostgreSQL delete；
6. ES 文档消失；
7. 确认临时行已从 PostgreSQL 删除。

## 8. 切换 search

Config Center 配置键：

```text
namespace: search
environment: pre
key: bootstrap.yaml
```

目标字段：

```yaml
search:
  catalog:
    endpoint: http://elasticsearch.elasticsearch.svc.cluster.local:9200
    api_key: <Secret ecommerce/search-k8s-api-key 中的值>
    index: ecommerce_catalog_products
```

只修改这三个字段，保留其他配置。完成后重启：

```bash
kubectl -n ecommerce rollout restart deploy/ecommerce-search-deploy
kubectl -n ecommerce rollout status deploy/ecommerce-search-deploy --timeout=180s
```

验证：

- search Pod 日志中的 endpoint 为集群内 ES Service；
- `/healthz` 返回 200；
- 集群内 Search RPC 返回 200；
- gateway、商品详情和 shop SSR 返回 200；
- 公网网关若要求 JWT，未认证的 401 是登录墙，不代表 ES 故障。

## 9. 故障回退

在 search 仍可用时，先停止写入变更，再确认：

1. search Config Center endpoint 改回受控旧地址；
2. 重启 search；
3. 恢复旧 Kafka/Connect/ES（如果旧数据仍保留）；
4. 不同时删除新 slot、旧 slot 和 Connect offset；
5. 对比 PostgreSQL、Kafka offset、ES count 后再决定是否重快照。

本次正式迁移完成后，node3 旧 Kafka/Connect/ES 已删除，不能再假设存在旧链路；回退路径是重新从 PostgreSQL 建立 CDC 和 ES 索引。

## 10. 监控

- `ops/gatus`：`cdc-source-task`、`cdc-sink-task`、`elasticsearch`。
- node3 vmalert：`CdcReplicationSlot*`、`CdcSinkLag*`。
- node3 Pigsty VM：接收 OTel 抓取的 `kafka_consumergroup_lag`。
- 如果 lag 指标消失，先检查 Kafka exporter、OTel Prometheus receiver、node3 VictoriaMetrics 写入链路；不要把指标缺失当作 lag 为零。
