# OKTETO.md — 内环开发（在集群身份下改代码）

> **这份文档回答**：在**本仓**什么时候该用它、怎么用、以及不先做哪一步会出事。
>
> - 不熟悉 Okteto 本身（概念、manifest 字段、与其它工具的取舍）→ 先读
>   [`cloud-native-deploy/okteto/README.md`](https://github.com/lens077/cloud-native-deploy/blob/main/okteto/README.md)（通用指南，与项目无关）
> - 判定规则 + 写 manifest 的七条检查清单（AI/人都要遵守）→ [`context/team/okteto-inner-loop.md`](../context/team/okteto-inner-loop.md)
> - 测试策略（**不要**用它做测试环境）→ [`docs/TESTING.md`](TESTING.md) §8.1
> - 技术栈与分层 → [`STACK.md`](../STACK.md)

---

## 一、它解决什么

**不是替代 `make dev`。** 本地 `go run` 已经很快（原生编译、LAN 直连 pg-dev/dragonfly/consul），
Okteto 在那条路上没有增量。

它替掉的是**"想看它在集群里的样子"**那条链路：

```
现在：改代码 → buildx 双架构 → 推 TCR → CI 回写 helm tag → ArgoCD 同步 → Pod 重启   （分钟~十几分钟）
Okteto：改代码 → 文件同步进 Pod（毫秒）→ 在 Pod 里重跑 go run                      （秒级）
```

**判据：只在"本地跑通了、集群里不一定"的时候才需要它。** 本仓这条缝隙是真实存在的：

| 已踩过的坑 | 本地 `make dev` 能发现吗 | `okteto up` 能吗 |
|---|---|---|
| dev.yml 进集群 → DB ping `context deadline exceeded` | ❌ 本地读的就是 dev.yml | ✅ Pod 里 `DEPLOYMENT_MODE=pre` |
| Secret `0400 root:root` → uid 1000 读不到 selector | ❌ 本地是你自己的 uid | ✅ Pod 强制 uid 1000 |
| 缺 `runAsUser/fsGroup` → CrashLoop | ❌ 本地没有 securityContext | ✅ 继承 Pod 的 securityContext |
| Dockerfile 漏 COPY `pkg/` → 容器里编译不过 | ❌ 本地有完整源码树 | ⚠️ 部分（同步的是全量源码） |
| Consul 注册地址错 → 网关路由不到 | ⚠️ 本地注册的是 Mac IP | ✅ 注册的是 Pod IP |

**不解决**：多服务联调（一次只 up 一个）、数据隔离（打的是共享 pre 库）、前端（vite 本地更快）。

---

## 二、前置

```bash
brew install okteto                                     # CLI 3.22.0 起验证过
okteto context use <kube-context> --namespace ecommerce  # 本仓是 kubernetes-admin@kubernetes
```

**`okteto up` 是开源侧能力，对着普通 k8s 集群即可，不需要装 Okteto 平台、不需要 license。**
（要平台的是 `okteto deploy` 和 `okteto test`——后者我们已在 [`TESTING.md`](TESTING.md) §8.1 否决。）

---

## 三、⚠️ 第一步永远是关掉 ArgoCD 自动同步

`okteto up` 会改集群里的工作负载（见 §五）。ArgoCD 的 `selfHeal` 会把这种"漂移"同步回去，
**你的开发容器会被无声干掉**——表现是敲着敲着 shell 断了，极难往 ArgoCD 身上想。

```bash
scripts/argocd-devwindow.sh off      # 开发前
scripts/argocd-devwindow.sh status   # 查状态
scripts/argocd-devwindow.sh on       # 开发后【必须恢复】
```

脚本往 AppProject 追加一条永远激活的 `deny` 窗口（`manualSync: true`，手工 sync 仍可用），
`on` 时只移除自己那条、不动你手写的窗口。选 AppProject 而不是改 Application/ApplicationSet 的原因
写在脚本头部注释里。

> **关掉期间集群不再自动跟随 Git。** 忘了 `on` 的后果是 GitOps 静默失效——
> 下次部署"为什么没生效"会白排查半天。这条比任何其它注意事项都重要。

---

## 四、工作流

```bash
# 0. 关自动同步
scripts/argocd-devwindow.sh off

# 1. 激活开发容器（首次要拉 golang 镜像 + 建 PVC，约几分钟；之后秒级）
cd backend
okteto up cart -n ecommerce

# 2. 现在你人在集群里的 Pod 中
cart:/workspace$ cd services/cart && go run cmd/server/main.go

# 3. Mac 上照常编辑 → 保存即同步 → Pod 里 Ctrl+C 重跑
#    （想自动重启就在 Pod 里挂 air/reflex；想调试用 dlv，端口已转发）

# 4. 收工
okteto down cart -n ecommerce
scripts/argocd-devwindow.sh on
```

非交互跑一条命令（CI 排查或冒烟用）：`okteto up cart -n ecommerce -- <command>`。

---

## 五、机制：它到底改了什么

**okteto 3.x 不是原地改 Deployment**，而是：

1. 新建一个 `<name>-okteto` Deployment（如 `cart-okteto`），容器镜像换成 dev 镜像、command 换成 sleep；
2. **把原 Deployment 缩到 0 副本**；
3. 建 PVC（`cart-okteto`）持久化 `/go`；
4. 起 syncthing 做 Mac ↔ Pod 双向同步；
5. `okteto down` 时删掉 `-okteto` 那套、把原 Deployment 恢复到原副本数。

> 这一点很重要：**ArgoCD 会看到两处漂移**——原 Deployment 副本数变 0（selfHeal 目标）、
> 多出一个 `-okteto` 资源（prune 目标）。所以 §三 那一步不是可选项。

新 Pod **继承原 Deployment 的其余部分**，这正是它的价值：

```
ENV     DEPLOYMENT_MODE=pre / CONFIG_SOURCE_FILE=/etc/ecommerce/config-source/cart.yaml
        CONSUL_ADDR=consul-expose-servers.consul.svc:8500      ← 集群内 svc 域名，不是 *.app.com
MOUNT   config-source → /etc/ecommerce/config-source (ro, 0400)
        db-ca-cert    → /etc/ssl/certs (ro)   ← 注意：整个目录被替换，见 §七 CA 那条
SEC     runAsUser/Group 1000（你的代码确实以 uid 1000 跑）
NET     Pod IP + 集群 DNS；Consul 注册的是 Pod 地址，网关能路由到你的开发容器
```

**架构不是差异点**：集群三个节点都是 **arm64**（Ubuntu 26.04），与 Mac 同架构。
镜像做多架构是为了兼容别处，不是为了这个集群——所以"本地 arm64 / 集群 amd64"那种
差异在本仓**不存在**，别把它当成用 okteto 的理由。

### 2026-08-11 在 cart 上的实测记录

全链路已跑通，日志原文（`okteto up` → Pod 内 `go build` → 跑起来）：

```
id                    → uid=1000 gid=1000              # 代码确实以非 root 跑
DEPLOYMENT_MODE=pre                                     # 不是 dev.yml
/etc/ecommerce/config-source/cart.yaml → 可读           # Secret 0400 对 uid 1000 有效
go version            → go1.26.5 linux/arm64
go build              → BUILD OK (49M)
------- 启动日志 -------
setting up ssl mode: verify-ca
database connected successfully to postgres-postgresql.postgres.svc   ← 集群内 svc 域名
redis connected successfully {"addr": "dragonfly.dragonfly.svc"}
Service registered with Consul using TTL check
http server starting {"addr": "0.0.0.0:30006"}  environment: "pre"
配置已热更新 {"source": "config_center"}
```

**过程中踩到并已修掉的四个坑**（都写进了 §六/§七）：init 容器 root 冲突、
系统 CA 被挂载遮蔽、openebs PVC 节点亲和、以及一个与 okteto 无关的节点故障。

---

## 六、manifest 说明（`backend/okteto.yaml`）

只声明 `cart` 一个目标，铺开前先在它身上跑通。几处非显然的决定：

| 决定 | 原因 |
|---|---|
| dev key 必须是 `cart` | 要与集群里的 Deployment 名逐字一致。**历史教训**：此前 11 份 okteto.yaml 的 key 全是 `connect-example-go`（旧项目身份），集群里没有这个 Deployment，`okteto up` 只会报找不到。这 11 份已删除 |
| 用官方 `golang:1.26.5`，不自建镜像 | 官方镜像把 `GOPATH`(/go) 设成 1777，uid 1000 能写，正好满足 Pod 的 `runAsUser: 1000` |
| 用 Debian 变体而非 `-alpine` | `command: bash`，alpine 只有 ash |
| 版本必须等于 `go.mod` 的 go 指令 | 否则 Go 会试图自动下载 toolchain |
| `HOME=/go` + `GOCACHE=/go/.cache/go-build` | 默认 `HOME=/root`，uid 1000 写不进去 → GOCACHE permission denied |
| **不**改 securityContext 去当 root | 保留 uid 1000 正是为了让"Secret 读不到"这类问题当场暴露。改成 root 等于把要验的东西关掉 |
| `sync: .:/workspace`（整个 backend/） | 单一 go.mod：编译 cart 需要 `api/` `pkg/` `constants/` 全在。排除规则见 `backend/.stignore` |
| `persistentVolume.enabled: true` | 不开的话每次 up 都重新拉全部依赖 |

---

## 七、排错

| 症状 | 原因 | 处理 |
|---|---|---|
| shell 敲着敲着断了 | ArgoCD selfHeal 把漂移同步回去了 | `scripts/argocd-devwindow.sh off` |
| `okteto up` 报找不到目标 | manifest 的 dev key 与 Deployment 名不一致 | `kubectl get deploy -n ecommerce` 核对 |
| Pod 卡 `Init:0/2` 很久 | init 镜像 `ghcr.io/okteto/okteto:<ver>` 来自 ghcr.io，LAN 内拉可能很慢 | 可用 `OKTETO_CLI_IMAGE` 指向 TCR 镜像副本 |
| Pod 卡 `ContainerCreating`、**零事件、无 IP** | **不是 okteto 的问题**，是节点起不了新 Pod | 见下节 |
| GOCACHE permission denied | 没设 `HOME`/`GOCACHE` | 见 §六 |
| 文件同步卡住 | syncthing 状态坏了 | `okteto up cart --reset` |
| `okteto up` 报 `container's runAsUser breaks non-root policy` | okteto 的 init 容器硬编码 `runAsUser: 0`，与继承来的 `runAsNonRoot: true` 冲突 | manifest 里显式 `runAsUser: 1000` + `runAsNonRoot: false`，见 §六 |
| `go mod download` 报 `x509: certificate signed by unknown authority` | **系统 CA 被挂载遮蔽**，见下 | `SSL_CERT_DIR=/usr/share/ca-certificates/mozilla` |
| Pod 一直 Pending，报 `didn't match PersistentVolume's node affinity` | openebs 是本地 LVM 卷，okteto 的缓存 PVC 钉死在首次调度的节点上 | `kubectl delete pvc <svc>-okteto` 让它重新分配 |

### ⚠️ 系统 CA 被 `db-ca-cert` 挂载遮蔽（2026-08-11 实测发现）

Deployment 把 `db-ca-cert` 挂到 `/etc/ssl/certs`，**这会替换整个目录**——
容器里 `ls /etc/ssl/certs` 只剩一个 `pg_ca.crt`，Debian/Alpine 自带的 CA 包全部不可见。
后果是容器内任何走公网 HTTPS 的调用都验不过证书。

- **dev 容器的表现**：`go mod download` 全线 `x509: certificate signed by unknown authority`。
  修法是 `SSL_CERT_DIR=/usr/share/ca-certificates/mozilla`（原始证书还在那里，150 份），
  已写进 `backend/okteto.yaml`；
- **生产侧同样成立**：`payment → 支付宝`、`user → Casdoor` 这类出站 HTTPS 会踩同一个坑。
  正确修法不是加环境变量，而是**把 pg CA 追加进系统 CA 包**（挂成
  `/usr/local/share/ca-certificates/pg_ca.crt` 后跑 `update-ca-certificates`，
  或用 `subPath` 只挂单个文件而不是整个目录）。

### 判别"是 okteto 还是集群"的通用手法

零事件 + 无 IP + 卡 `ContainerCreating` **不是镜像问题**（镜像问题会有 `Pulling`/`Failed` 事件）。
一条命令定位到节点：

```bash
# 拿一个已在集群里跑着的镜像，钉到另一个节点起个 Pod
kubectl run probe -n ecommerce --image=<集群里已有的镜像> --restart=Never \
  --overrides='{"spec":{"nodeName":"node2","imagePullSecrets":[{"name":"tcr-pull-secret"}],
                "containers":[{"name":"probe","image":"<同上>","command":["sleep","60"]}]}}'
```

**换个节点秒起 = 原节点故障**，处置是 `kubectl cordon <node>`（阻止新 Pod 落上去，
已有 Pod 不受影响，`kubectl uncordon` 恢复）。

---

## 八、铺开到其它服务

跑通 cart 之后再加，每个服务在 `dev:` 下加一个与 Deployment 同名的 key，其余字段照抄。
优先级按"集群与本地差异最大"排：`payment`（支付宝回调要公网可达）→ `behavior`（gorse）→ 其余。

**不要一次写 10 份**——这正是上一批 okteto.yaml 烂掉的方式：写完没人用，项目改名后集体过期。
