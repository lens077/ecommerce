# ecommerce 安全观测链路

本目录保存 ecommerce 的 Tetragon/Cilium 安全指标规则输入。规则只告警，不执行自动阻断；实际部署位置、vmalert/Alertmanager/bridge 状态与手机送达验收以 [告警通知手册](../../docs/observability/alerting-notification.md) 和当前集群查询为准。

## 数据路径

```text
Tetragon PROCESS_EXEC / PROCESS_KPROBE
  -> container log -> Vector
  -> VictoriaLogs（原始事件）
  -> 低基数安全指标 -> OTel Collector -> VictoriaMetrics
Cilium agent -> Hubble Relay -> OTel Collector -> VictoriaMetrics
VictoriaMetrics -> vmalert -> Alertmanager -> alert-bridge -> ntfy
```

Vector 只把 `token_access` 和 `suspicious_exec` 转为低基数指标；完整 Pod、binary、UID、parent chain 和文件路径从日志查询。指标不携带命令行、Pod UID 或用户 ID。

## 规则

`ecommerce-security-alerts.yml` 包含：

| 告警 | 条件 | 首要行动 |
|---|---|---|
| `EcommerceServiceAccountTokenAccess` | 5 分钟内 token 文件访问大于 0 | 查 Pod、binary、parent chain；不得输出 token |
| `EcommerceSuspiciousToolExec` | 5 分钟内可疑工具执行大于 0 | 确认是否为授权运维，再调查调用链 |
| `EcommerceNetworkPolicyDeniedBurst` | 5 分钟内 `POLICY_DENIED` 超过 20 | 用 Hubble 查询 source、destination、port 和 CNP |
| `HubbleFlowTelemetryMissing` | 10 分钟没有 Hubble flow 指标 | 查 Cilium、Hubble、OTel scrape 和远端写入 |

修改规则后先在目标集群的发布仓验证表达式，再按现行 GitOps/观测手册发布。不要使用旧 node3 `/infra/rules`、旧本机 bridge 或旧规则数量作为当前真相源。

## 调查与验收

调查时使用当前集群内的 VictoriaLogs/VictoriaMetrics 服务和 Hubble Relay，先从 `context/team/local-env.md` 选择 context 与 namespace；不要把 SSH alias 或旧主机端点写入规则。

验收必须分别注入 token 访问、可疑 exec 和 CNP deny，并确认原始日志、指标计数、firing、通知桥接和恢复窗口。测试 Pod 删除后，没有真实 live 信号的告警应在对应窗口结束后 resolved。不要通过扩大 CNP、降低阈值或记录 token 正文消除告警。
