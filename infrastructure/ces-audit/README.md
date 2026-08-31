# CES 一致性巡检

本目录部署只读的 CiliumEndpoint（CEP）与 CiliumEndpointSlice（CES）一致性巡检。巡检按 Pod UID 关联对象，检查 IP 不一致、CES 孤儿条目、CES 缺失条目和重复条目。巡检不会删除或修改 CES。

## 运行方式

巡检使用集群内 CronJob，而不是 node3 cron。CronJob 只挂载短生命周期的 ServiceAccount token，ClusterRole 仅允许 `get`、`list` `ciliumendpoints` 和 `ciliumendpointslices`。node3 方案需要复制并长期保存 kubeconfig；凭据暴露面更大，且需要额外处理证书和轮换。

CronJob 每 2 分钟执行一次。脚本通过 Kubernetes API 读取 CEP 和 CES，并把以下低基数指标写入 `http://metrics.apikv.com/api/v1/import/prometheus`：

- `ces_stale_entries`：本次不一致条目数；
- `ces_audit_success`：API 读取与解析是否成功；
- `ces_audit_last_run_timestamp_seconds`：本次执行时间。

部署资源：

```bash
kubectl apply -k infrastructure/ces-audit
kubectl -n ces-audit create job --from=cronjob/ces-audit ces-audit-manual
kubectl -n ces-audit logs job/ces-audit-manual
```

退出码为 `0` 表示一致，`1` 表示发现不一致，`2` 表示 API 读取、JSON 解析或指标写入失败。发现不一致时，CronJob 按失败记录保留日志，但脚本会先写入 `ces_stale_entries`。

## 本地验证

直接读取当前 kubeconfig 指向的集群：

```bash
python3 infrastructure/ces-audit/ces_audit.py
```

使用 mock JSON 验证陈旧 IP 检测：

```bash
python3 infrastructure/ces-audit/ces_audit.py \
  --cep-json infrastructure/ces-audit/testdata/cep.json \
  --ces-json infrastructure/ces-audit/testdata/ces-stale.json
```

预期输出包含 `kind=ip_mismatch`，退出码为 `1`。

## vmalert 规则

规则仓库副本为 `vmalert-rule.yml`。node3 由 Pigsty 管理，必须同步修改以下两个位置：

- Pigsty source：`/root/pigsty-deploy/files/victoria/rules/ecommerce-ces-audit.yml`；
- 运行产物：`/infra/rules/ecommerce-ces-audit.yml`。

更新时先验证临时文件，再分别安装到 source 和运行产物，最后 reload：

```bash
scp infrastructure/ces-audit/vmalert-rule.yml node3:/tmp/ecommerce-ces-audit.yml
ssh node3 '/usr/bin/vmalert -dryRun \
  -rule=/tmp/ecommerce-ces-audit.yml \
  -rule.validateExpressions=true \
  -rule.validateTemplates=true'
ssh node3 'install -o root -g root -m 0644 \
  /tmp/ecommerce-ces-audit.yml \
  /root/pigsty-deploy/files/victoria/rules/ecommerce-ces-audit.yml && \
  install -o victoria -g victoria -m 0644 \
  /tmp/ecommerce-ces-audit.yml \
  /infra/rules/ecommerce-ces-audit.yml && \
  systemctl reload vmalert'
```

`CiliumEndpointSliceStale` 使用最近 5 分钟的最后一个样本。条件为 `ces_stale_entries > 0`，持续 30 秒后进入 firing。5 分钟窗口覆盖一次 CronJob 抖动，同时避免单次测试样本永久保持告警。

## 回滚

回滚集群巡检：

```bash
kubectl delete -k infrastructure/ces-audit
```

回滚 node3 规则：

```bash
ssh node3 'rm -f \
  /root/pigsty-deploy/files/victoria/rules/ecommerce-ces-audit.yml \
  /infra/rules/ecommerce-ces-audit.yml && \
  systemctl reload vmalert'
```

回滚只删除本巡检资源和独立规则文件，不影响其他 vmalert 规则。VictoriaMetrics 中的历史样本按现有保留策略自然过期。
