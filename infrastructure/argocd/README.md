# 安装

推荐使用OLM安装一个帮助管理集群上运行的 Operator 的工具

```shell
curl -sL https://github.com/operator-framework/operator-lifecycle-manager/releases/download/v0.28.0/install.sh | bash -s v0.28.0
```

https://github.com/argoproj-labs/argocd-operator/releases/tag

```shell
VERSION="v0.9.1"
wget https://github.com/argoproj-labs/argocd-operator/archive/refs/tags/${VERSION}.zip
```

安装操作员, 此 Operator 将安装在 “operators” 命名空间中，并可从集群中的所有命名空间中使用

```shell
kubectl create -f https://operatorhub.io/install/argocd-operator.yaml
kubectl get csv -n operators
```

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
| `argocd` CLI（原生 gRPC） | `argocd-api.dev.test` | `http://argocd-api.apikv.com`（Pangolin rid 66） | `http` 80 | **明文 h2c** |

- Web UI 路由：`server/helm/gateway/http-route.yml`（只挂 443）。
- CLI 路由：`server/helm/argocd-api-routes.yml`（只挂 80，同时匹配 `argocd-api.dev.test` 与 `argocd-api.apikv.com`）。
- 两个主机名互不串用：API 主机名在 443 返 404，UI 主机名在 80 返 404。

**明文风险已由用户于 2026-09-24 明确接受**：80 不加密，admin 密码与 session token 以明文过链路。
因此 `argocd-api` 只允许 remote-dev / VPN 来源，Pangolin 资源必须配访问规则拒绝其余来源。

### 为什么 CLI 不走 443

`cilium-config` 的 `enable-gateway-api-alpn: false`，HTTPS 监听器不宣告 h2 ALPN，原生 gRPC 拿不到 HTTP/2；
gRPC-Web 经 Envoy 的 HTTP/1.1 转发后 ArgoCD 返回 `404 page not found`（CLI 表现为 `code = Unimplemented`）。
Cilium Envoy 上游协议镜像下游协议：客户端以 h2c 连 80 时上游也是 h2c，`argocd-server`（`server.insecure=true`）
用 cmux 把 HTTP/2 分给 gRPC 监听器。2026-09-23/24 集群内实测只有「原生 gRPC → 80 h2c」成功。

打开 `enable-gateway-api-alpn` 与 `enable-gateway-api-app-protocol` 需要重启 `cilium-operator` 与 `cilium-envoy`，
属于全站 L7 入口中断，须排维护窗口；打开后才可退回 443 上的「GRPCRoute + `appProtocol` h2c」标准形态。

### Pangolin 资源 `argocd-api.apikv.com`

必须通过面板或 API 创建，不能直接改数据库：

| 字段 | 值 | 说明 |
|---|---|---|
| 类型 | HTTP resource | |
| SSL / HTTPS | **关** | 公网侧即明文 HTTP 80，不生成 `redirect-to-https` |
| 站点 | `k8s-cluster`（集群内 newt） | 与 rid 60 同一站点 |
| target method | **`h2c`** | 用 `http` 会把 gRPC 降成 HTTP/1.1，ArgoCD 不接 |
| target 地址 | `<cilium-gateway LB IP>:80` | `kubectl -n default get gateway cilium-gateway` 现查，当前 `10.10.31.240` |
| 自定义 Host | 不填 | 路由已匹配 `argocd-api.apikv.com` |
| 认证（SSO） | 关 | 由 ArgoCD 自己处理 admin/token 认证 |
| 访问规则 | remote-dev / VPN 出口 CIDR `ACCEPT`，其余拒绝 | 明文入口不得对任意公网来源开放 |
| 健康检查 | 不勾 | 勾了又不配对 `hcPort/hcPath` 会被判 unhealthy → 503 |

`argocd-api` 只承载 CLI。REST/token 自动化继续走 `https://argocd.apikv.com/api/...`：target 为 `h2c` 时，
HTTP/1.1 的 REST 请求会被 Traefik 以 HTTP/2 转发，ArgoCD cmux 不会把非 gRPC 的 HTTP/2 交给 REST 处理器。

### 部署与验证

```bash
kubectl apply -f infrastructure/argocd/server/helm/argocd-api-routes.yml
```

LAN 直连 Gateway（`argocd-api.dev.test` 解析到 Gateway VIP）：

```bash
argocd login argocd-api.dev.test:80 --username admin --password "$ARGOCD_PASSWORD" --plaintext
```

remote-dev 经 Pangolin（资源建好后）：

```bash
argocd login argocd-api.apikv.com:80 --username admin --password "$ARGOCD_PASSWORD" --plaintext
argocd version   # 验收：打印出 argocd-server: vX.Y.Z
```

不要加 `--grpc-web`，也不要去掉 `:80` 和 `--plaintext`。2026-09-24 从 Mac 经 rid 66 实测 `argocd version` 返回 `argocd-server: v3.5.3`。

**不要用 curl 验收这个入口**：`curl http://argocd-api.apikv.com/api/version` 返回 `503 upstream connect error ... connection termination` 属于预期——target 是 `h2c`，HTTP/1.1 的 REST 请求被转成 HTTP/2，ArgoCD cmux 只把带 `content-type: application/grpc` 的 HTTP/2 交给 gRPC 监听器，其余连接直接关闭。`argocd-api.dev.test` 只在机房 LAN 可解析，Mac 上 `Could not resolve host` 同样是预期。

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
