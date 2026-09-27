# CES 一致性巡检

本目录保存只读的 CiliumEndpoint（CEP）与 CiliumEndpointSlice（CES）一致性巡检源码、清单、规则和测试数据。巡检按 Pod UID 对齐对象，报告 IP 不一致、孤儿、缺失、重复及缺少 Pod UID 的条目；不会删除或修改 CES。

## 运行方式

生产巡检通过集群内 CronJob 使用短生命周期 ServiceAccount token，ClusterRole 只允许读取 `ciliumendpoints` 和 `ciliumendpointslices`。不要把宿主机 kubeconfig 或旧宿主机规则作为运行依赖。当前集群、namespace 和 vmalert/Alertmanager 位置按 `context/team/local-env.md` 与 `docs/observability/alerting-notification.md` 现查。

```bash
kubectl apply -k infrastructure/ces-audit
kubectl -n ces-audit create job --from=cronjob/ces-audit ces-audit-manual
kubectl -n ces-audit logs job/ces-audit-manual
```

退出码为 `0` 表示一致，`1` 表示发现不一致，`2` 表示读取、解析或指标写入失败。指标名由 `ces_audit.py` 生成：`ces_audit_success`、`ces_audit_last_run_timestamp_seconds` 和 `ces_stale_entries`，标签为 `cluster` 与 `source`。不要把单次成功提升为长期健康结论。

## 本地验证

直接读取当前 kubeconfig 指向的集群：

```bash
python3 infrastructure/ces-audit/ces_audit.py
```

使用 fixture 验证陈旧 IP 检测：

```bash
python3 infrastructure/ces-audit/ces_audit.py \
  --cep-json infrastructure/ces-audit/testdata/cep.json \
  --ces-json infrastructure/ces-audit/testdata/ces-stale.json
```

预期输出包含 `kind=ip_mismatch`，退出码为 `1`。测试数据只验证解析与判定，不证明当前集群存在同样问题。

## 规则与回滚

`vmalert-rule.yml` 是本仓规则输入；实际规则发布、校验、reload 和告警验收由集群观测仓与 [告警通知手册](../../docs/observability/alerting-notification.md) 负责。不要向已退役的 node3 路径复制规则，也不要把规则文件直接当作 live 状态证明。

删除本巡检的 Kubernetes 资源使用：

```bash
kubectl delete -k infrastructure/ces-audit
```

历史指标按现有保留策略自然过期；回滚前先确认当前集群的规则归属与告警依赖。
