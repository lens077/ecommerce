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

## 受限 API/CLI 入口

Web UI 在集群内使用 `argocd.dev.test`，经 Pangolin 公网化时再创建对应 HTTP resource；CLI/API 不与 Web UI 共用一个 HTTPS HTTPRoute，且**分两个协议入口**：

| 端口 | 用途 | 能不能跑原生 gRPC |
|---|---|---|
| `443` HTTPS | Web UI / REST / token 自动化（`/api/...`） | 当前 HTTPRoute 只承载 Web UI 和 REST |
| `80` 明文 h2c | `argocd` CLI 原生 gRPC | 能，但只能在受限管理通道使用 |

### 为什么 CLI 必须走明文 80

Cilium 生成的 Envoy cluster 使用 `useDownstreamProtocolConfig`，**上游协议镜像下游协议**。本集群
`cilium-config` 里两个开关都是关的：

- `enable-gateway-api-alpn: false` → HTTPS 监听器不宣告 h2 ALPN，客户端只能协商到 HTTP/1.1；
- `enable-gateway-api-app-protocol: false` → Service 上的 `appProtocol: kubernetes.io/h2c` 被完全忽略。

叠加后果：经 443 的原生 gRPC 拿不到 h2、不可能成立；经 443 的 gRPC-Web 会被 Envoy 的 HTTP/1.1
转发破坏，ArgoCD 返回 `404 page not found`（外层表现为 `code = Unimplemented`）。而客户端用 h2c
明文直连 80 时，Envoy 镜像出 h2c 上游，请求正确落到 gRPC 监听器。

打开这两个开关需要重启 `cilium-operator` 与 `cilium-envoy`（3 节点 DaemonSet，承载全部 Gateway 路由），
属于全站 L7 入口中断，须排维护窗口。开关打开后才可以退回「GRPCRoute + `appProtocol` h2c」的标准形态，
并废弃 80 端口路由。

### Pangolin 侧要求

必须通过面板或 API 创建资源，不能直接改数据库：

- REST 资源 target 指向 Cilium Gateway 的 `443`；CLI 资源 target 指向 `80`。地址以运行时查询结果为准，不写死 ClusterIP。
- 资源关闭交互式 SSO/登录跳转，由 ArgoCD 自己处理 admin/token 认证。
- 只允许管理网段或 VPN 出口来源；公网普通来源必须在 Pangolin policy 层拒绝。
- 不要对 CLI/API 请求返回 Pangolin 登录页或 `302`；应原样转发 ArgoCD 的 `401`、gRPC 状态和响应头。
- 创建资源后等待 Pangolin 动态配置刷新，再验证两个端口。

**明文链路的安全边界**：80 端口传输不加密，admin 密码与 session token 以明文过链路。这条路径只允许
在受源地址限制的通道内使用，禁止暴露给任意公网来源。若无法保证来源限制，改用下面的 K8s API 通道。

Kubernetes 侧部署：

```bash
kubectl apply -f infrastructure/argocd/server/helm/argocd-api-routes.yml
```

CLI 验证（明文 h2c，不加 `--grpc-web`）：

```bash
argocd login argocd-api.apikv.com \
  --username admin \
  --password "$ARGOCD_PASSWORD" \
  --plaintext
```

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
