# k8s CDC 迁移阶段记录

## 已完成

- Strimzi operator 与单节点 Kafka 4.3.0 KRaft 已 Ready，内部 listener，`migration-smoke` 生产/消费通过。
- KafkaConnect 4.3.0 已使用包含 Debezium PostgreSQL 3.6.1 与 Elasticsearch Sink 的 TCR 镜像，插件列表已实测包含 `io.debezium.connector.postgresql.PostgresConnector` 与 `io.confluent.connect.elasticsearch.ElasticsearchSinkConnector`。
- `ecommerce-k8s-source` 使用独立 `ecommerce_k8s_cdc` topic 前缀和独立 `ecommerce_k8s_cdc` replication slot，source/task 均 `RUNNING`。旧 `ecommerce_cdc` slot 和 node3 Connect 未动。
- `ecommerce-k8s-es-sink` 使用 k8s ES ClusterIP、Secret ConfigProvider、`schema.ignore=true` 和删除事件 `DELETE`，connector/task 均 `RUNNING`。2026-09-15 已将 sink 从 staging `elastic` 用户切为专用 `ecommerce_cdc_sink` 用户（ES role 只允许 `ecommerce_*_k8s*` 的 index/write/read metadata），search 侧专用 `ecommerce_search` 用户只读 catalog；凭据只存 Secret。
- 2026-09-15 复核删除契约：新 source 已修正为与旧生产链路一致的 `delete-to-tombstone` + `tombstones.on.delete=true`；sink 仍以 `behavior.on.null.values=DELETE` 处理 tombstone。此前 `rewrite` 产生的 `__deleted: "false"` 仅存在测试索引，不作为正式切换依据。
- k8s ES 单节点 9.4.5 + analysis-ik 为 GREEN，四个业务 alias 对应的当前文档数为：SKUs 13、SPUs 7、sale_detail 21、catalog 7；source/sink/slot 均仍 active。
- node3 Kafka、Connect、ES 和 search 旧读路径继续保留；未切正式 alias、未改 search endpoint、未停旧 pipeline。
- 2026-09-15 追加验证：旧 catalog alias 与 k8s catalog alias 都是 7 文档，但初始 canonical JSON hash 不同（两边排序与快照时点不同）。逐文档对照后确认 7/7 ID 相同，业务字段全部一致；唯一差异是旧 source 的契约是 tombstone，而新 source 已修正为 `delete-to-tombstone`，此前测试索引遗留的 `__deleted: "false"` 不作为正式切换依据。
- 2026-09-15 追加验证：k8s ES sink 自动创建的 staging index 默认 `number_of_replicas=1`，单节点曾显示 YELLOW、10 个副本未分配；已对 staging ES 将 replicas 设为 0，恢复 GREEN，主分片 13/13、无 unassigned shard。该设置尚未写正式索引模板，正式迁移时必须显式声明单节点副本策略。

## 关键回退点

- 新 slot 与旧 slot 分离；删除 `ecommerce-k8s-source` 会停止新链路，不影响旧 source。
- k8s sink 只消费 `ecommerce_k8s_cdc.*`，删除 sink 不影响 node3 sink。
- k8s ES 的索引名带 `k8s`/migration 语义，正式 alias 和 Pangolin 尚未切换。
- Secret 只存于 `kafka` namespace，不入 Git；connector 清单只保存 Kubernetes Secret ConfigProvider 引用。

## 未完成

- 生产 API key 的正式命名和权限复核仍待完成（当前已不再使用 `elastic`：sink/search 使用专用用户，但仍需按最终 alias 收紧并做错误凭据验收）。
- 其他历史索引的 mapping、alias 和 checksum 对照。
- CDC 更新、删除、Connect 重启和 sink lag 窗口验收。
- search 改读 k8s ES 后的双向验证。
- 2026-09-15 追加重启验收：只重启 k8s KafkaConnect Pod，约 1 分钟恢复 `1/1`；source/sink 均回到 `RUNNING/RUNNING`，`ecommerce_k8s_cdc` slot 仍 active，catalog count 仍为 7。旧 node3 pipeline 未受影响。
- 2026-09-15 追加真实 CDC 验收：在 `products.search_catalog` 插入临时 `cdc-migration-probe` 行，约 5s 后 k8s ES 出现；更新 price `1.23→9.87` 约 5s 后同步；删除该行约 5s 后 k8s ES count 回到 0。数据库临时行已确认删除，旧 connector/正式 alias 未受影响。
- 2026-09-15 追加重启/权限验收：KafkaConnect 重启后 source/sink 仍 RUNNING；ES sink 已由 `elastic` 切换专用 `ecommerce_cdc_sink`，search 使用专用只读 `ecommerce_search`；k8s ES 单节点 replicas=0 后 GREEN。正式 search 切换仍需 Config Center 中现有 API key 与 endpoint 的受控变更，不能仅凭 count 对齐直接切。
- 新链路稳定后，才可停止 node3 Connect、Kafka、ES 并清理旧 slot。

## 切流与收尾（2026-09-15 晚，本节之后上面各节全部成为历史）

上面「未完成」「关键回退点」描述的并行 staging 形态已经结束：staging 资源（`ecommerce-k8s-*` connector、`ecommerce_k8s_cdc` slot/topic、`*_k8s`/`*_migration_*` 索引与 alias）全部删除，正式链路只有一套。

- **k8s ES 重建为 pipeline 契约**：7 个索引模板 `ecommerce-cdc-<alias>`（mapping 来自 pipeline 仓 `index-mappings.json`，shards 1 / replicas 0）→ `<alias>_v1` → write alias。此前由 bulk 自动建出的 `ecommerce_catalog_products_v1`（`updated_at` 格式与模板冲突）已删并按模板重建。角色 `ecommerce-cdc-sink` 放宽为 `ecommerce_*`，`ecommerce-search-read` 与 search 的 API key 改为 `ecommerce_catalog_products*` + cluster `monitor`——**search 启动会打 `GET /`，没有 `monitor` 就 403 起不来**（滚动时老 Pod 仍在服务，未断）。
- **connector 重建**：先 `docker stop` node3 `cdc-connect`，两个 slot 均 inactive 后全部 drop；k8s 侧删旧 CR、删 `ecommerce_k8s_cdc.*` 与 `migration-smoke` topic；再 apply `ecommerce-postgres-source`（slot/prefix `ecommerce_cdc`，`time.precision.mode=connect`、`slot.drop.on.stop=false`、tombstone 删除）与 `ecommerce-elasticsearch-sink`（7 topic → 7 alias，DLQ `ecommerce_cdc.elasticsearch.dlq` 副本数 1）。Debezium 自建槽后重快照：catalog 7 / skus 13 / spus 7 / sale_detail 21 / orders 0，与 node3 ES 逐一相等。
- **Config Center 切换**：`search/pre/bootstrap.yaml` v6 → v7，只改 `search.catalog.endpoint`（`https://es.apikv.com` → `http://elasticsearch.elasticsearch.svc.cluster.local:9200`）与 `api_key`，index 不变。写入用的是集群里 `config-center/config-center-operator` Secret 的 operator token，**header 是 `x-config-center-service-token`，不是 `Authorization: Bearer`**——此前两轮 401 全因用错 header，不是 token 无效。
- **验收**：search 滚动后日志 `elasticsearch search catalog initialized endpoint=…svc.cluster.local:9200 index=ecommerce_catalog_products`；集群内直打 `search.v1.SearchService/Search`（公网走网关需要 JWT，401 是登录墙）`estee` 命中 1 条；`雅诗` 两边 ES 均 0 命中（IK 分词一致，非迁移引入）。真实 CDC 探针：插入 → 8s 内出现，改价 1.23→9.87 → 同步，删除 → 消失，count 回 7。KafkaConnect 因清单 apply 又滚动一次，source/sink 回到 RUNNING，槽仍 active。
- **node3 删除**：Pigsty `kafka-rm.yml -l kf-main -e kafka_rm_data=true -e kafka_rm_pkg=true`、`minio-rm.yml -l minio -e minio_rm_data=true -e minio_rm_pkg=true`；`docker rm -f -v` cdc-connect / cdc-elasticsearch / bugsink / healthchecks + 全部 volume（含旧 ES8 回滚卷）与镜像；`rm -rf /opt/kafka /home/docker/ecommerce-cdc /data/bugsink /data/healthchecks`；`cdc-connect-exporter` unit/脚本、`/infra/targets/{kafka,minio}` 删除；PG `drop database bugsink with (force)` + `drop role dbuser_bugsink`。watchdog `WATCH` 只剩 gatus/ecommerce-gatus/otelcol，`HTTP_CHECKS` 清空；Pigsty Gatus 删 `kafka-origin-tls`/`node3-kafka-edge`/`silo-origin`，`node3-silo-edge` 改 `silo-api-edge`；`/infra/rules/ecommerce-cdc.yml` 只留复制槽 5 条（Connect/sink-lag 7 条随 exporter 删除）。Patroni `slots.ecommerce_cdc` 声明仍在。**node3 可用内存 686 → 4376 MB。** 剩下的 docker 容器：lyrapass ×3（用户自理）、gatus ×2、otelcol。
- **k8s 观测后端删除**：`helm uninstall` vm-single / vl / vt / alertmanager，4 个 PVC、6 条 HTTPRoute、`victoriametrics` ns 删除；`ops/gatus` 端点改为查 `metrics.apikv.com` 的入库探针 + 新 `cdc` 组（`cdc-source-task`/`cdc-sink-task` 看 connector 与 task 两级、`elasticsearch` 401 存活），并修正两条从装上就一直红的探针（`otel-collector` 13133 未暴露 → 打 4318 得 405；`postgres-pooler-rw` Service 不存在 → `tcp://10.10.21.172:5432`）。Connect REST 由 `connect-rest-netpol.yaml` 对 `ops` 放行。面板 21/21 绿。
- **仍待办**：Pangolin `es.apikv.com`(rid 47) 与 Kafka raw 30004 两个资源 target 已不存在，需管理员登录后删除；sink lag 告警缺数据源（见基础设施待办）；Silo 的 OpenBao 凭据 seed。
