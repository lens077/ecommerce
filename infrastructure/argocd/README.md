# ArgoCD 运维入口

本仓不再维护 OLM 或 ArgoCD Operator 的旧安装教程。当前安装、路由和 CLI 入口以仓内脚本与 `server/helm/` 清单为准；是否已安装、是否有业务 Application/ApplicationSet，必须按 `context/team/local-env.md` 对当前集群只读查询。

## 本仓现行安装入口

- Helm 安装脚本：`server/helm/Install.sh`
- CLI 安装脚本：`cli/install.sh` 或 `server/install-cli.sh`
- CLI/API 的 Kubernetes 路由：`server/helm/argocd-api-routes.yml`
- Web UI 路由示例：`server/helm/gateway/http-route.yml`

应用 API/CLI 路由前，先确认 `argocd-server` 使用 `server.insecure: "true"`。它在该模式下用 cmux 按协议分流：
HTTP/1.1 交给 HTTP handler，HTTP/2 交给 gRPC 监听器。下面的入口设计完全建立在这个行为上。

## 入口拆分：Web UI 走 TLS，CLI/API 走 HTTP 明文

| 用途 | 集群内 Host | 公网 / remote-dev | Gateway 监听器 | 协议 |
|---|---|---|---|---|
| Web UI + REST/token 自动化 | `argocd.dev.test` | `https://argocd.apikv.com`（Pangolin rid 60） | `https` 443 | TLS |
| `argocd` CLI（原生 gRPC） | `argocd-api.dev.test` | 同左，Mac 经 sshuttle（`ssh k1`）直连 VIP；无公网入口 | `http` 80 | **明文 h2c** |

- Web UI 路由：`server/helm/gateway/http-route.yml`（只挂 443）。
- CLI 路由：`server/helm/argocd-api-routes.yml`（只挂 80，只匹配 `argocd-api.dev.test`）。
- 两个主机名互不串用：API 主机名在 443 返 404，UI 主机名在 80 返 404。

**明文风险已由用户于 2026-09-24 明确接受**：80 不加密，admin 密码与 session token 以明文过链路。
因此 CLI 入口不走公网：Mac 用 `sshuttle -r k1 <gateway-vip-cidr> <node-cidr>` 打通 VIP 后直连。
两段网段按 `context/team/local-env.md` 现查，不写进本仓——内网拓扑不入库。

### 为什么 CLI 不走 443

`cilium-config` 的 `enable-gateway-api-alpn: false`，HTTPS 监听器不宣告 h2 ALPN，原生 gRPC 拿不到 HTTP/2；
gRPC-Web 经 Envoy 的 HTTP/1.1 转发后 ArgoCD 返回 `404 page not found`（CLI 表现为 `code = Unimplemented`）。
Cilium Envoy 上游协议镜像下游协议：客户端以 h2c 连 80 时上游也是 h2c，`argocd-server`（`server.insecure=true`）
用 cmux 把 HTTP/2 分给 gRPC 监听器。2026-09-23/24 集群内实测只有「原生 gRPC → 80 h2c」成功。

打开 `enable-gateway-api-alpn` 与 `enable-gateway-api-app-protocol` 需要重启 `cilium-operator` 与 `cilium-envoy`，
属于全站 L7 入口中断，须排维护窗口；打开后才可退回 443 上的「GRPCRoute + `appProtocol` h2c」标准形态。

### 不建 Pangolin 公网 CLI 入口

曾建过 `argocd-api.apikv.com`（rid 66，HTTP resource、SSL 关、target `h2c://<VIP>:80`），2026-09-24 实测可用后**已删除**：
sshuttle 一条命令就能让 Mac 直连 VIP，没必要留一个公网明文 gRPC 口。REST/token 自动化继续走 `https://argocd.apikv.com/api/...`（rid 60）。
若将来非要公网 CLI，target 必须是 `h2c`（`http` 会把 gRPC 降成 HTTP/1.1），且访问规则只放行固定出口 CIDR。

### 部署与验证

```bash
kubectl apply -f infrastructure/argocd/server/helm/argocd-api-routes.yml
```

LAN 直连 Gateway（`argocd-api.dev.test` 解析到 Gateway VIP）：

```bash
argocd login argocd-api.dev.test:80 --username admin --password "$ARGOCD_PASSWORD" --plaintext
```

Mac（sshuttle 开着）：同上，`argocd version` 打印出 `argocd-server: vX.Y.Z` 即通。

不要加 `--grpc-web`，也不要去掉 `:80` 和 `--plaintext`。2026-09-24 从 Mac 经 sshuttle 实测通。

**不要用 curl 验收这个入口**：`curl http://argocd-api.apikv.com/api/version` 返回 `503 upstream connect error ... connection termination` 属于预期——target 是 `h2c`，HTTP/1.1 的 REST 请求被转成 HTTP/2，ArgoCD cmux 只把带 `content-type: application/grpc` 的 HTTP/2 交给 gRPC 监听器，其余连接直接关闭。`argocd-api.dev.test` 只在机房 LAN 可解析，Mac 上 `Could not resolve host` 同样是预期。

### GitLab webhook → ArgoCD 即时刷新（2026-09-24）

不加 webhook 时 ArgoCD 每 3 分钟轮询 GitLab；加上后 push 到 GitLab 立刻刷新。

- GitLab 侧：项目 hook id `89881395`，URL `https://argocd.apikv.com/api/webhook`，只勾 push events，SSL 校验开。
  经 Pangolin rid 60（SSO 关）到 argocd-server；`/api/webhook` 本身不需要 ArgoCD 登录，靠 token 校验。
- ArgoCD 侧：shared secret 存在 `argocd-secret` 的 `webhook.gitlab.secret`（集群内，不入库），
  GitLab hook 的 Secret token 是同一个值。token 不对会被 ArgoCD 拒绝，实测 2026-09-24。
- 验收：`glab api projects/83474117/hooks/89881395/test/push_events -X POST`，然后
  `kubectl -n argocd logs deploy/argocd-server --since=2m | grep -i webhook` 应看到
  `Received push event repo: https://gitlab.com/sumery/ecommerce` 与 `refreshing app from webhook`。
- 轮换：`openssl rand -hex 24` 生成新值，同时 patch `argocd-secret` 与 `glab api projects/83474117/hooks/89881395 -X PUT -f token=…`。
- 它只刷新 source 为该仓的 Application；ApplicationSet 用的是 list generator，不受 webhook 影响。

### 不经任何入口的通道

kubeconfig 的 API server 是公网直达的，ArgoCD CLI 内置了走这条通道的模式，不碰 Pangolin、不碰
Cilium Gateway、全程 TLS：

```bash
export ARGOCD_OPTS='--port-forward --port-forward-namespace argocd --plaintext'
argocd app list
```

或直连 CRD（需要 kubeconfig 的 context namespace 为 `argocd`，否则报 `configmap "argocd-cm" not found`）：

```bash
argocd app list --core
```

`--core` 绕过 ArgoCD 自身的 RBAC/SSO，权限由 K8s RBAC 决定，且 `app logs` / `app terminal` 不可用。

密码只从本地环境或交互式输入提供，不写入仓库、脚本或命令历史。
