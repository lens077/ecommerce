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
