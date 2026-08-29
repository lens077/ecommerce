# 2026-08-28 mirrord PoC：targetless DNS 验证 + cart 单服务拦截

> 结论先行：**mirror 采纳、steal 判不可用（本集群构型下）**。mirrord OSS 可作为「本地 `go run` + 按需集群网络/DNS」的调试工具（只用 mirror）；steal 因 Cilium BPF host routing 绕过 netfilter 而完全不拦截（fail-safe：业务无损），且按验收纪律不为开发工具修改全局 Cilium 数据面，故禁用。日常内环结论维持 [`2026-08-28-tech-research.md`](2026-08-28-tech-research.md) §3 三层模型：`go run` 默认、mirrord mirror 按需、Okteto 兜底。
> 正式推广门禁（用户设定）：**等 cart 及一个下游完成 K8s Service DNS 调用后再推广**；本 PoC 只解锁「按需试用」。

## 环境矩阵

| 项 | 值 |
|---|---|
| mirrord | 3.251.0（OSS，`~/.local/bin/mirrord`，mac universal 二进制） |
| 集群 | K8s v1.36.4，3 节点 arm64（PD 虚拟机，Ubuntu 26.04，内核 7.0.0-30-generic） |
| Cilium | v1.20.1；`kube-proxy-replacement: "true"`、**`enable-host-legacy-routing: "false"`**（BPF host routing 生效）、`bpf-lb-mode: hybrid`、`routing-mode: native`、l7-proxy on |
| 目标 | `deployment/ecommerce-cart-deploy`（ecommerce ns，containerPort 30006 h2c，readiness GET /healthz） |
| Service | `ecommerce-cart-service` ClusterIP 10.102.178.204:30006（10 服务的 ClusterIP Service 均已存在——去 Consul 四步的①已完成） |
| 本地 | macOS arm64；`go run`；toolchain **go1.26.5**（与 backend go.mod 一致，`GOTOOLCHAIN=go1.26.5` 强制） |
| NetworkPolicy | cart 无任何 netpol（仅 outbox-relay/search-indexer 等 4 个工具负载有）——「策略下出站」一项记录为无策略约束 |
| 配置 | `.scratch/mirrord-poc/`：`targetless.json` / `mirror.json` / `steal-filtered.json`（均 `env:false`、`fs:"local"`、agent ttl 30–60s）；探针 `cmd/dnsprobe`、`cmd/h2clogger`（Go 1.24+ `http.Protocols` 原生 H2C） |

## 验收矩阵（对照清单）

| 清单项 | 结果 | 证据 |
|---|---|---|
| A 安装与基础 | ✅ | brew 主仓无包、官方 tap 超时，改 GitHub release 直下（300MB，51 分钟）；agent Pod 自动创建/`Completed` 后按 ttl 清理，无残留 |
| A agent 位置注意点 | ⚠️ 记录 | agent 以**特权 Pod 跑在 `default` namespace**（按目标节点调度，非目标 ns）——RBAC/审计要按「能在 default 建特权 Pod」评估，后续若收紧 PSA/默认拒绝须给 mirrord 留出口或改 `agent.namespace` |
| B Go 1.26 注入稳定性 | ✅（结果见下节循环记录） | 首次注入即成功，无 SIP/dylib/签名问题；`go run`（编译器子进程链）注入正常 |
| C DNS 与出站 | ✅ | targetless：`kubernetes.default` / `ecommerce-cart-service.ecommerce` / `config-center.config-center` / `consul-server.consul`（headless→PodIP）4/4 解析；TCP 直连 config-center:30010；HTTP 经 ClusterIP svc 名访问 cart `/healthz` 200 |
| D 入站 mirror：Pod IP | ✅ | HTTP/1.1 两发全镜像；kubelet readiness 探针流量（`kube-probe/1.36`）也实时镜像到本地 |
| D 入站 mirror：**Service ClusterIP** | ✅ **通过（关键裁决）** | HTTP/1.1 与 H2C 均被镜像——官方 issue #2777（KPR 下 ClusterIP 不被 mirror）**在本集群未复现**（Cilium 1.20 + 该构型下 sniff 路径可见） |
| D 入站 mirror：H2C/ConnectRPC | ✅（连发偶丢） | `--http2-prior-knowledge` 请求以 `proto=HTTP/2.0` 镜像到本地；毫秒级连发 4 发丢 2（首/尾连接竞态），1s 间隔 6/6 全收——调试用途可接受，写为已知边界 |
| D mirror 语义 | ✅ | 全程真 cart 正常响应所有请求（本地响应被丢弃），远端零影响 |
| E Cilium KPR | ✅ 已记录 | `enable-host-legacy-routing: "false"` 全程未改；mirror 不受影响；**steal 受影响（见下）**；未把改 Cilium 作为修复选项 |
| F Secret/文件 | ✅ | 会话配置 `env:false` + `fs:"local"`——不拉取远端环境变量与文件，无敏感面 |
| G steal（仅 dev + header filter + TTL） | ❌ **判不可用** | filter `x-mirrord-poc: 1`、agent ttl 30s、仅 ecommerce（dev）；agent 日志确认 iptables-nft 后端正常装载、agent ready 无报错，但带 filter 头的请求（PodIP 与 ClusterIP、HTTP/1.1 与 H2C）全部仍由真 cart 响应、本地 0 拦截——**BPF host routing 绕过 netfilter，REDIRECT 规则不在流量路径上**。失效形态 fail-safe（只是不拦截，不断流量）；会话结束后远端复验正常 |
| H 性能门槛 | ✅（按下节数据） | 会话建立（含 agent 创建）约 10–20s/次；agent 为短命 Job Pod，无常驻开销 |

## 注入稳定性循环（Go 1.26.5 × 20 轮）

每轮 = 全新 mirrord 会话 + 全新 agent Pod + `go run` 注入 + 4 项 DNS + TCP/HTTP 出站探针，全部通过才计 OK：

**结果：20/20 全部 OK，零注入失败。** 首轮 6s（新建 agent），第 2–20 轮均 2–3s（ttl 内 agent 复用）——「缓存后启动 ≤15s」门槛大幅达标。Go 1.26.5（与 backend 一致）在 Darwin/arm64 `go run` 路径注入稳定。

## 裁决与使用约定

1. **采纳（按需）**：`mirrord exec -f mirror.json` 用于「本地进程需要集群 DNS/出站/入站流量观察」的调试场景；配置基线 = `env:false`、`fs:"local"`、mirror-only、agent ttl ≤60s。
2. **禁用 steal**：在当前 Cilium 构型（KPR + BPF host routing）下 steal 完全不生效；不为开发工具设置 `bpf.hostLegacyRouting=true`。需要「本地接管流量」时用 Okteto（`okteto up` 直接替换工作负载，语义等价且已实测）。
3. **Okteto 保留兜底**：真实 Pod 身份（Secret mode/uid/容器 CA/Pod IP）场景继续走 `docs/OKTETO.md`。
4. **推广门禁**：cart 及至少一个下游完成 K8s Service DNS 调用（服务发现迁移第②③步）后，再把 mirrord mirror 写入团队内环文档；此前仅按需使用。
5. **后续留验**：agent 改跑到专用 namespace（`agent.namespace` + 最小 RBAC）；默认拒绝 NetworkPolicy 落地后复测 agent 出站；ConnectRPC streaming 长连接的 mirror 行为（本轮只验了 unary/GET）。
6. **分工口诀（2026-08-28 定稿，已录入 `docs/TECH.md` A 表）**：**观察用 mirrord mirror，接管用 Okteto**。日常默认仍是本地 `make dev`。
7. **待触发评估：多人按请求接管（filter 式个人金丝雀）**——这是 steal 真正不可替代、当前给不了的能力（Okteto 接管是排他的整体替换，A `up` 会顶掉 B 的联调）。需求成立条件 =「同一服务 × 同一时间 × 不同版本 × 都要真实流量」四项同时满足；触发信号（任一）：①出现第二个长期后端贡献者且共享 dev 联调；②发生过「一人的 okteto up/调试会话打断另一人联调」的真实冲突；③前端/QA 需同时验证两个未合入后端分支；④每人独立环境的资源账算不过来。触发后先验 **Telepresence personal intercept**（开源；须先复测本集群 Cilium KPR 兼容——steal 失效的教训表明此类流量重定向必须实测），对照 **mirrord Teams**（约 $50/人/月；其 steal 在本集群同样依赖被绕过的 netfilter 路径，需厂商确认）；两者都不行才考虑「基线 + 泳道染色路由」自建。**在触发信号出现前，不为此花任何成本。**已同步录入 `docs/TECH.md` B 表。

## 清理记录

- mirrord agent Pod：短命 Job，`Completed` 后自动删除（实测无残留）。
- 调试 Pod `mirrord-poc-curl`（ecommerce ns）：PoC 结束后删除。
- 本机新增：`~/.local/bin/mirrord`（3.251.0）、go1.26.5 toolchain（goproxy.io 缓存）。
- 集群配置：**零修改**（未动 Cilium/网络策略/工作负载）。
