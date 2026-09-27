---
name: local-env
layer: team
description: 本地环境的契约、来源与只读查法；不维护节点、VIP、安装清单和运行状态的副本
doc-sync: required
affects:
  - backend/go.mod
  - frontend/package.json
  - backend/pkg/configsource
  - backend/services/cart/internal/pkg/config
  - scripts/env-check.py
---

# 本地开发环境：先选通路，再查事实

本文保存**连接规则与排障方法**，不回答「此刻部署了什么」。服务拓扑与约定端点查 [`.service-matrix.yaml`](../../.service-matrix.yaml)，未完成接线查 [TODO.md](../../TODO.md)，运行状态按需查下面的命令。matrix 的端点也是期望配置，不是连通性证明。

2026-09-26 复核发现本文把公网 OTLP 同时写成未接线与已接线，并混用了重建前后的节点名。整页更新日期无法修正各段不同的有效期，因此取消活地址、VIP、Pod 数和组件安装状态的手抄表，不另建快照档案。

## 1. 最短读取路径

| 任务 | 先看什么 | 是否连接环境 |
|---|---|---|
| 普通代码、文档修改 | 对应设计与下面的工具要求 | 不连接集群 |
| 构建或本机工具失败 | `python3 scripts/env-check.py --section local` | 仅本机 |
| 部署身份、集群容量、业务是否存在 | `python3 scripts/env-check.py --section cluster` | 只读当前 context；不代表长期健康 |
| `okteto up`、GitOps 接管前 | `python3 scripts/env-check.py --section gitops` | 只读 Application/ApplicationSet；不能只信 TODO 旧记录 |
| 观测存储位置、采集器是否存在 | `python3 scripts/env-check.py --section observability` | 只读观测 namespace 工作负载 |
| 域名/网关路由排障 | `python3 scripts/env-check.py --section routes` | 只读 HTTPRoute/TLSRoute/TCPRoute |

可用 `--context <名称>` 固定集群，`--namespace <名称>` 指定业务命名空间。默认不切换 context、不写文件、不读 Secret，不发探测通知；每条命令设置超时，返回白名单字段与 `observed_at`。

`observed` 只表示查询成功；空列表才表示**该次成功查询范围内**没有对象。超时、权限不足、CRD 缺失、工具缺失都返回 `unknown` 和非零退出码，不能推断「没部署」。Ready、期望副本与 `reconciled` 也不是业务验收。故障时保留诊断输出，不把故障分布抄回文档。

同一任务可复用本轮同 context 的查询结果；换集群、重建、网络变化或执行部署后必须重查。命令不自动缓存，避免一份缓存再变成新真相源；不需要环境的任务不为「以防万一」探集群。详细边界见 [live-facts.md](live-facts.md)。

## 2. 工具链契约（从源码生成）

以下是要求，**不是本机已安装版本**。来源为 `backend/go.mod` 与 `frontend/package.json`；实际版本用 local 查询对照。Python 3 和 Git 供本仓离线门禁使用，集群分区另需 kubectl 与只读权限。

<!-- env-check:toolchain -->
```json
{
  "go": "1.27.0",
  "node": "^22.22.2 || ^24.15.0 || >=26.0.0",
  "packageManager": "pnpm@12.5.1"
}
```
<!-- /env-check:toolchain -->

改版本后运行 `python3 scripts/env-check.py --print-contract` 替换这一块；`--check` 离线逐字比较，手改日期或空白不能掩盖版本漂移。构建与测试仍由 runbook 锚点验收，版本对上不等于构建成功。

## 3. 连接策略与配置来源

| 通路 | 适用条件 | 配置来源与限制 |
|---|---|---|
| `remote-dev` | 本机到不了集群私网 | Config Center `dev` Bootstrap 的公网域名，经 Pangolin resource → 集群 newt site → 网关或 L4 Service；TLS、SNI、鉴权仍需验证 |
| `gateway` | LAN 或已验证的 SSH 私网通路 | Config Center gateway 策略；`*.dev.test` 解析由本机 hosts/DNS 负责，VIP 从 Service 查，不手抄历史地址 |
| Pod 内 | 进程有集群网络身份 | Bootstrap 的 Service DNS；Mac 不能直接把 `.svc` 当可达地址 |
| mirrord / Okteto | 观察 / 排他接管工作负载 | 先读 [okteto-inner-loop.md](okteto-inner-loop.md)；接管前查询实际 GitOps 归属 |

基础设施端点由同级 kubernetes 仓库的配置收集脚本生成；命令在该仓执行，不是本仓脚本。默认 `dev` 策略为 `remote-dev`；LAN 才显式选 `gateway`。收集脚本会写配置，不能当只读诊断执行。

业务服务由本地忽略文件 `configs/source.dev.yaml` 或部署挂载的 selector 自举，从 Config Center 拉取 Bootstrap。selector 缺失、token 无效或 key 不存在时启动失败；Consul KV 不是回退来源。`dev/pre/prod` 是配置选择器维度，不能仅凭命名空间或镜像标签猜测。仓库部署层是 pre/prod，prod 的 Config Center 选择见 [生产发布手册](../../docs/PRODUCTION-RELEASE.md)。

当前 adapter 使用 `go-connect-kit/config` 的默认 `LoadOptions{}`：未知键由 strict mapstructure 拒绝，required 约束由 proto + Protovalidate 校验。**可选段缺失**仍可能关闭功能；不能再套用「所有未知键静默忽略」的旧结论。热更新只说明接收了新配置，不代表每个客户端已重建，见 [热更新边界](../project/ecommerce/config/experience/config-hot-reload-boundaries.md)。

配置漂移只读审计（会使用本地 selector 读取远端，不在 CI 自动运行）：

```bash
# 在 backend/ 执行；不输出完整 Bootstrap、密码或 token
go run ./tools/config-seed -drift -environment dev
```

端点与 matrix 一致不证明 TLS、认证、权限和业务链路可用；必须按改动的协议补最小验证。PG 的 SSLRequest、Redis AUTH、Kafka advertised listener 不能用「TCP 通了」替代。不要用跳过证书验证的请求作为 TLS 验收。

### Consul 与 OTLP

- 本地默认 `make dev` 不注册 Consul；确需注册才用 `make dev-consul`。客户端认 `CONSUL_HTTP_TOKEN`；无 token 的读可能返回 200 和空结果，不是没有服务。部署模板保留的 Consul 地址不证明集群安装了 Consul。
- OTLP 端点以 Bootstrap 与 collector 配置为准。公网入口需要鉴权时，匿名上报可能被 401 丢弃，但业务进程仍正常。`OTEL_EXPORTER_OTLP_HEADERS` 的空格按 W3C baggage 编码为 `%20`；不要回显 header。
- 本机 OTLP header 可由仓外 `~/.config/apikv/otel.mk` 注入；K8s 可由 `otel-auth` Secret 注入。Secret/ESO/凭据后端是否已经同步必须另验，不能从模板里的 optional 引用推出已可用。采集、存储与最终查询是三次独立验收。

## 4. 解析、信任与常见误判

### SSH 私网通路

newt 是站点连接器，不自动给 Mac 增加到集群私网的路由。需要 SSH 隧道时，先确认 inventory alias `k1` 与实际网段，再使用 sshuttle；不要照旧节点列表猜网段。不要在 sshuttle 前整体加 `sudo`：root 不一定能读用户 `~/.ssh/config`，会把 alias 当裸主机名；防火墙助手需要的提权由工具自己的交互处理。

`.test` 是保留域，公网不解析。hosts 只适合少量固定域；dnsmasq 依赖的本机监听地址若是临时 lo0 别名，重启后可能消失。代理返回 502 不证明 ArgoCD 或网关坏了，先区分本机 DNS、私网路由、TLS 与上游响应。

### 集群重建后的 CA

集群重建可能生成**同名不同公钥**的根 CA；Mac/Firefox 仍信任旧 CA 时会报签名错误。先比较证书 SHA-256 指纹与 SKI/AKI，不按 Subject 相同判断是同一张证书。curl 与浏览器可能使用不同信任库，curl 成功不证明浏览器信任。

```bash
# 只读检查本机证书；不读取私钥
security find-certificate -c my-global-root-ca -p /Library/Keychains/System.keychain \
  | openssl x509 -noout -dates -fingerprint -sha256 -ext subjectKeyIdentifier
```

现行公共 CA 从集群相应 ConfigMap/证书来源取得后在本地比对。替换系统信任是单独操作：先确认准确旧指纹，再删旧装新；不得按同名批量删除。Firefox 手工导入的证书库也需检查。凭据与私钥不写仓库。

### 本机端口与存储查询

- IDE 可能占用 `127.0.0.1:30001/30002/30003`；Go 监听 `*` 不保证 IPv4 回环请求落到 Go。用 `lsof` 定位监听进程，再分别验证 IPv4/IPv6，不把端口冲突写成固定现状。
- VictoriaMetrics、VictoriaLogs、VictoriaTraces 的字段命名不同。先查实际 label/field 名，再写查询；空结果也可能是口径错误，见 [alerting-signal-hygiene.md](alerting-signal-hygiene.md)。
- ArgoCD Web 与 CLI 的 hostname/协议可能不同，入口契约只维护在 [ArgoCD 手册](../../infrastructure/argocd/README.md)。不要恢复历史公网明文 CLI 入口。
- 旧 node3 Pigsty、node101 系列的操作记录不能证明当前集群位置。重建恢复见 [基础设施操作手册](../../docs/INFRASTRUCTURE-OPERATIONS.md)，不继续复制退役入口。
