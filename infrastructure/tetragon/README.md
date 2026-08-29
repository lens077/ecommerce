# Tetragon 运行时审计基线

本目录保存 ecommerce 内网集群的 Tetragon 期望配置与审计策略。2026-08-28 已按本目录配置发布；后续修改仍须经过明确授权的变更窗口。

## 运行态

- Helm release 为 `tetragon-1.7.1` revision 5。
- Tetragon DaemonSet 已取消 node103 单点限制，在 node101、node102、node103 均为 Ready。
- operator 也已取消 node103 selector，当前单副本落在 node101；agent 与 operator 的 canonical values 均保持 `nodeSelector: {}`。
- stdout exporter 仅导出 ecommerce 的 `PROCESS_EXEC`、`PROCESS_EXIT`、`PROCESS_KPROBE`，并保留命令行敏感参数脱敏。
- `PROCESS_EXEC` 已在三个节点验证，事件包含 Pod、binary、UID、capability 与 namespace 上下文。shell、curl、wget、nc、socat 等工具启动直接从该事件流审计。
- `ecommerce-service-account-token-access` 是唯一的 `TracingPolicyNamespaced`。它通过 `sys_openat` 记录 `/var/run/secrets/kubernetes.io/serviceaccount/` 与 `/var/run/secrets/tokens/` 下的文件访问，只执行 `Post`，不阻断进程。
- Vector 已把原始事件写入 node3 VictoriaLogs，并将 token-access 与可疑 `PROCESS_EXEC` 转成 `ecommerce_tetragon_security_events_total`。vmalert/Alertmanager 的规则与调查手顺见 `../observability/README.md`。

## 为什么没有 shell TracingPolicy

`sys_execve`/`security_bprm_check` 在新进程进入 Tetragon process map 前触发。测试中 policy hit metrics 会增加，但 KPROBE 事件缺少 Pod/namespace，无法通过 ecommerce exporter allow-list，也无法定位工作负载。保留该策略会形成「已监控」的假象。

Tetragon 内建的 `PROCESS_EXEC` 在同一测试中可以稳定输出 Pod、binary、UID、capability 与 namespace，因此它是交互工具审计的真相源。不要为了追求「策略数量」重新加入不可调查的 exec kprobe。

## 文件

- `values.yaml`：三节点 DaemonSet、process credential/namespace 上下文、exec/exit/kprobe exporter 与资源上限。
- `policies/ecommerce-runtime-audit.yaml`：projected ServiceAccount token 文件访问审计；无 `Sigkill`、`Override` 等 enforcement 动作。

## 变更前验证

```bash
kubectl apply --dry-run=server \
  -f infrastructure/tetragon/policies/ecommerce-runtime-audit.yaml

helm -n tetragon get values tetragon > /tmp/tetragon-live-values.yaml
helm upgrade tetragon cilium/tetragon \
  --namespace tetragon \
  --version 1.7.1 \
  -f infrastructure/tetragon/values.yaml \
  --dry-run
```

## 验收

1. `kubectl get ds tetragon -n tetragon` 必须为 `3/3` Ready。
2. 三个节点各触发一次 ecommerce 进程，stdout exporter 必须出现对应 `node_name` 的 `PROCESS_EXEC`。
3. 正常业务基线中不应出现 token-access KPROBE。命中时先检查 Pod、binary、parent chain 与文件路径，不自动阻断。
4. 测试 token policy 时只读取测试 token 到 `/dev/null`，不得输出 token 内容；测试 Pod 必须立即删除。

策略回滚时，优先删除 namespaced token policy。不要直接回退到 Helm revision 4：该 revision 仍把 operator 固定在 node103。需要回滚其他 Helm 配置时，先确认目标 revision 的 agent/operator 均没有 hostname selector。不要用 Tetragon enforcement 替代应用授权或 NetworkPolicy。
