# ecommerce 安全观测链路

本目录保存 ecommerce 的运行时与网络安全告警规则。2026-08-28 已接入 dev 集群和 node3 观测面；规则只告警，不执行自动阻断。

## 数据路径

```text
Tetragon PROCESS_EXEC / PROCESS_KPROBE
  -> export-stdout container log
  -> Vector DaemonSet
     -> VictoriaLogs：保留可调查原始事件
     -> ecommerce_tetragon_security_events_total
        -> OTel Collector prometheus receiver
        -> VictoriaMetrics

Cilium agent
  -> Hubble Relay（server TLS，3/3 nodes）
  -> hubble_* metrics
     -> OTel Collector prometheus receiver
     -> VictoriaMetrics

VictoriaMetrics -> vmalert -> Alertmanager -> node3 audit/ntfy bridge
```

Vector 只把两类 Tetragon 事件转成低基数指标：

- `token_access`：命中 `ecommerce-service-account-token-access` policy；
- `suspicious_exec`：ecommerce Pod 启动 bash、sh、curl、wget、nc、ncat 或 socat。

指标只保留 `event_type` 与节点，不把 Pod UID、命令行或用户 ID 放进标签。完整 Pod、binary、UID、parent chain 和文件路径仍从 VictoriaLogs 查询。Vector `:9598` 由 `vector-security-metrics` NetworkPolicy 保护，只允许 `opentelemetry` namespace 的 Collector Pod 访问。

## 告警

`ecommerce-security-alerts.yml` 包含四条规则：

| 告警 | 条件 | 首要行动 |
|---|---|---|
| `EcommerceServiceAccountTokenAccess` | 5 分钟内 token 文件访问大于 0 | 查 Pod、binary、parent chain；不得输出 token |
| `EcommerceSuspiciousToolExec` | 5 分钟内可疑工具执行大于 0 | 确认是否为授权运维，再调查调用链 |
| `EcommerceNetworkPolicyDeniedBurst` | 5 分钟内 `POLICY_DENIED` 超过 20 | 用 Hubble 查询 source、destination、port 和 CNP |
| `HubbleFlowTelemetryMissing` | 10 分钟没有 Hubble flow 指标 | 查 Cilium、Hubble、OTel scrape 和远端写入 |

规则已部署到 node3 `/infra/rules/ecommerce-security.yml`。修改后先验证，再原子覆盖并 reload：

```bash
scp infrastructure/observability/ecommerce-security-alerts.yml node3:/tmp/ecommerce-security-alerts.yml
ssh node3 '/usr/bin/vmalert -dryRun \
  -rule=/tmp/ecommerce-security-alerts.yml \
  -rule.validateExpressions=true \
  -rule.validateTemplates=true'
ssh node3 'install -o victoria -g victoria -m 0644 \
  /tmp/ecommerce-security-alerts.yml /infra/rules/ecommerce-security.yml && \
  systemctl reload vmalert'
```

## 调查入口

查询 projected-token 原始事件：

```bash
ssh node3 'curl -fsSG \
  --data-urlencode '\''query=_msg:"ecommerce-service-account-token-access"'\'' \
  --data-urlencode '\''start=now-24h'\'' \
  --data-urlencode '\''limit=50'\'' \
  http://127.0.0.1:9428/select/logsql/query'
```

查询 Cilium deny 增量：

```bash
ssh node3 'curl -fsSG \
  --data-urlencode '\''query=sum(increase(hubble_drop_total{reason="POLICY_DENIED"}[5m]))'\'' \
  http://127.0.0.1:8428/api/v1/query'
```

Hubble Relay Service 为 `kube-system/hubble-relay:443`。客户端必须校验 `hubble-relay-server-certs` 中的 CA，并使用 server name `ui.hubble-relay.cilium.io`；不要退回明文 80 端口。

## 验收与回滚

验收必须分别注入 token 访问、可疑 exec 和 CNP deny，并确认：

1. VictoriaLogs 有原始事件；
2. VictoriaMetrics 计数器增加；
3. vmalert rule 进入 firing；
4. Alertmanager 和 node3 audit/ntfy bridge 收到 firing；
5. 测试 Pod 删除后，没有真实 live 信号的告警应在窗口结束后发送 resolved。

2026-08-28 dev 验收时，token-access 与可疑 exec 已按窗口恢复 inactive；deny burst 继续 firing，因为 product 正在重试已退役的 Gorse endpoint。该状态必须通过 Config Center 管理员修正 endpoint/key 后消失，不能靠放行旧 IP、调高阈值或静音处理。

回滚顺序：先从 `/infra/rules/` 移除本规则并 reload vmalert，再回滚 Vector/OTel release；Hubble 只有在确认没有其他调查者依赖时才回滚 Cilium。不要通过扩大 CNP、降低 token 告警或记录 token 正文来消除告警。
