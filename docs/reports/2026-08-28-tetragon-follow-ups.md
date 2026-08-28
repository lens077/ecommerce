# Tetragon 后续工作与已知缺口

> 当前事实以 [`docs/TECH.md`](../TECH.md) 为准。本文件只记录三节点 audit-only 观察与告警闭环之后仍未完成的工作，不重复部署结果和历史调研。

## 当前基线

- Tetragon `1.7.1` 在 `node101`、`node102`、`node103` 三节点 `3/3` Ready；ARM64/Linux 7.0 BTF 已验证。
- 仅导出 `ecommerce` 的 `PROCESS_EXEC`、`PROCESS_EXIT`、`PROCESS_KPROBE`，开启 process credential/namespace 上下文。
- 唯一策略 `ecommerce-service-account-token-access` 为 namespaced audit-only，只执行 `Post`，不阻断。
- 原始事件已进入 VictoriaLogs；token-access、可疑 exec 与 Hubble deny 指标已进入 VictoriaMetrics；vmalert→Alertmanager→通知审计桥已通过真实注入。
- Helm 资产位于 `~/lens077/kubernetes/components/tetragon/`；业务策略位于 `infrastructure/tetragon/`；调查与告警入口位于 `infrastructure/observability/`。

## P0：事实源与安全边界

- [ ] **提交并持续校验跨仓声明**：Kubernetes 仓 `values.yaml` 必须保持 agent `nodeSelector: {}`；ecommerce 仓只管理业务策略。CI 应执行 `components/tetragon/verify.sh` 或等价只读检查，防止下次 Helm 升级退回单节点。
- [ ] **收紧策略写权限**：对平台管理员、业务 CI、开发者和 namespace 管理员分别执行 `kubectl auth can-i`，证明只有受控平台身份能创建、更新或删除 `TracingPolicy`/`TracingPolicyNamespaced`；记录例外和回收方式。
- [ ] **定义安全日志权限和保留期**：明确谁能查询包含 binary、arguments、parent chain、container ID 的原始事件；决定是否使用独立 stream/tenant、保留多久、谁能导出，以及误采凭据时如何处置。
- [ ] **扩充命令行脱敏测试**：当前只覆盖 `--password`、`--token`、`--secret`。至少验证 `-p`、URL query token、Authorization 参数、连接串等常见形式；业务继续禁止通过命令行传凭据。

## P1：可量化的可靠性基线

- [ ] **建立 24–72 小时三节点基线**：记录每 agent CPU/内存、重启、事件量、VictoriaLogs 日增长、业务 P95/P99；确认控制面节点 `node101` 不因 privileged agent 出现资源或 API Server 抖动。
- [ ] **把「零丢事件」变成可验收指标**：定时生成带节点和序号的 canary exec，核对 exporter、Vector、VictoriaLogs 的序号完整性；同时采集 BPF ring buffer、队列和 exporter drop 指标。
- [ ] **演练链路故障**：分别滚动 Tetragon、Vector、OTel Collector 和告警组件，确认事件不静默丢失、缺失告警能触发、恢复后无持续重复。
- [ ] **固化正常 token-access 为零**：按 workload 和时间窗口持续查询；任何非测试命中都必须能追溯到 Pod、binary、path 和变更来源。

## P1：运行配置残留

- [ ] **完成 Gorse Config Center 更新**：管理员登录后把 product endpoint 从已退役 `node2:8088` 改为 `https://gorse.apikv.com`，为 product/behavior 写入正确 API key，滚动并验证 Track/Recommend/SimilarItems；不得放行旧 IP 或绕过 Config Center 直写数据库。
- [ ] **轮换曾暴露于会话工具日志的搜索凭据**：按 `context/project/ecommerce/config/experience/config-preview-allowlist.md` 的 allowlist 预览流程执行；轮换后验证旧值失效。
- [ ] **复核已修复项不回归**：10 个 API 的 OTLP Authorization 已完成且无新 401；持续监控，但不要把它重新列为待修复项。

## P2：检测扩展与 enforcement 门禁

- [ ] **检测规则逐条上线**：每条规则必须有威胁假设、workload 范围、误报白名单、VictoriaLogs 查询、告警级别、Runbook 和回滚命令。优先考虑异常 shell/下载工具、ServiceAccount token、runtime socket/宿主机敏感路径和已删除二进制。
- [ ] **避免无上下文 KPROBE 规则**：`security_bprm_check`/`sys_execve` 试验已证明可能只有 hit metrics、没有可调查 Pod 上下文；不得保留制造虚假安全感的规则。
- [ ] **独立评估 enforcement**：满足长期基线、误报观察、策略写权限、回滚演练和业务负责人批准后，才允许评估阻断；不得直接把现有 token-access policy 从 `Post` 改为 `Sigkill`。
- [ ] **制定 Tetragon/Cilium/内核联动升级矩阵**：每次升级前验证 ARM64 镜像、BTF、CRD、policy 兼容、事件 schema、Vector remap 和告警规则；锁定 chart/app digest 或明确版本。

## 已接受但未消除的风险

- address BOLA 按当前用户决策保留。它属于应用授权风险，NetworkPolicy、Tetragon 或 token automount 关闭都不能替代对象级授权修复。
- 单宿主机上的三台 VM 只提供逻辑节点冗余，不构成物理故障域隔离；Tetragon 三节点覆盖不能解决宿主机整体故障。
- audit-only 能提供证据和告警，但不能阻止攻击动作；在 enforcement 门禁完成前，不得对外宣称已具备自动运行时防护。

## 验收入口

```bash
# Kubernetes 仓：三节点、BTF、策略边界与资源快照
cd ~/lens077/kubernetes
bash components/tetragon/verify.sh

# ecommerce 仓：文档与知识库一致性
cd ~/lens077/ecommerce
scripts/verify-context.sh
```
