---
name: okteto-inner-loop
layer: team
description: 内环开发用 okteto up 在集群身份下跑代码——什么时候该用、必须先关 ArgoCD 自动同步、以及它不是测试环境。动 okteto 前必读
---

# 内环开发（okteto up）：判定与硬约束

> **操作手册（命令、manifest、排错）在 [`docs/OKTETO.md`](../../docs/OKTETO.md)。**
> 本文件只写判定与不可协商的约束。

## 一、什么时候用（判定）

| 场景 | 用什么 |
|---|---|
| 改业务逻辑、调接口、写单测 | **`make dev`**（本地 `go run`，最快） |
| 跑集成测试 | **testcontainers**，见 [go-testing.md](go-testing.md) |
| **验"本地通了、集群里不一定"的东西** | **`okteto up`** |
| 验配置/Secret/权限/网络身份在集群里的行为 | **`okteto up`** |

**判据一句话**：只有当问题的成因是**集群身份**（配置来源 pre.yml、Secret 0400 可读性、
uid 1000、Pod IP、集群 DNS、amd64）时才用它。其余场景本地更快。

## 二、硬约束

1. **`okteto up` 之前必须先 `scripts/argocd-devwindow.sh off`**，之后必须 `on`。
   okteto 会新建 `<svc>-okteto` Deployment 并把原 Deployment 缩到 0——ArgoCD 的 selfHeal
   会把两处漂移都同步回去，开发容器被无声干掉。**忘了 `on` 更糟**：GitOps 静默失效。
2. **不要把开发窗口写进 `argocd-proj.yml`**——"临时暂停"一旦进 Git 就变成永久状态。
3. **不要改 securityContext 去当 root**。保留 uid 1000 正是为了让"Secret 读不到"当场暴露；
   改成 root 等于把要验的东西关掉。GOCACHE 权限问题用 `HOME=/go` + `GOCACHE=/go/.cache/go-build` 解决。
4. **dev key 必须与集群里的 Deployment 名逐字一致**。历史教训：11 份 okteto.yaml 的 key
   全是 `connect-example-go`（旧项目身份），集群里没这个 Deployment，`up` 只会报找不到。已删除。
5. **不要一次给 10 个服务写 manifest**。上一批就是这么烂掉的：写完没人用，改名后集体过期。
   跑通一个再加下一个。
6. **它不是测试环境**（打的是共享 pre 库，无数据隔离）。见 [`docs/TESTING.md`](../../docs/TESTING.md) §8.1。

## 二之三、写/改 `okteto.yaml` 的检查清单

七条，每条都对应一个**已经踩过的**失败。写完逐条核对，不要凭印象：

| # | 必须 | 不这么做会怎样 |
|---|---|---|
| 1 | `dev:` 下的 key **等于集群 Deployment 名**（`kubectl get deploy -n ecommerce` 核对） | `okteto up` 报找不到目标。旧 11 份 manifest 全栽在这（key 是 `connect-example-go`） |
| 2 | `image` 版本 **等于 `backend/go.mod` 的 go 指令**（当前 `golang:1.26.5`），且用 Debian 变体 | 版本不符会触发 toolchain 自动下载；alpine 没有 bash，`command: bash` 起不来 |
| 3 | `environment` 里有 `HOME=/go` + `GOCACHE=/go/.cache/go-build` | 默认 `HOME=/root`，uid 1000 写不进去 → 编译报 permission denied |
| 4 | `environment` 里有 `SSL_CERT_DIR=/usr/share/ca-certificates/mozilla` | `db-ca-cert` 挂载替换了整个 `/etc/ssl/certs`，系统 CA 全没 → `go mod download` 全线 x509 失败 |
| 5 | `securityContext` 同时有 `runAsUser: 1000` **和** `runAsNonRoot: false` | 只写前者：okteto 的 init 容器（硬编码 `runAsUser: 0`）被 kubelet 拒绝；只写后者：业务容器跑成 root，要验的权限问题被掩盖 |
| 6 | `sync` 指向 **整个 `backend/`**，不是服务子目录 | 单一 go.mod，缺 `api/` `pkg/` `constants/` 编译不过 |
| 7 | `persistentVolume.enabled: true` | 每次 `up` 重新下载全部依赖 |

新增服务时**照抄 cart 那份改 key 即可**，其余字段全是服务无关的。

## 三、排错的第一判别

Pod 卡 `ContainerCreating`、**零事件、无 IP** → **不是 okteto 也不是镜像问题**
（镜像问题会有 `Pulling`/`Failed` 事件），是节点起不了新 Pod。
拿一个已在集群里的镜像钉到另一个节点起 Pod 对照，秒起就说明原节点故障，
处置 `kubectl cordon <node>`（可逆，`uncordon` 恢复）。详见 [`docs/OKTETO.md`](../../docs/OKTETO.md) §七。

**注意副作用**：openebs 是本地 LVM 卷，okteto 的缓存 PVC 会**钉死在首次调度的节点**上。
换节点后必须 `kubectl delete pvc <svc>-okteto` 让它重新分配，否则 Pod 永远 Pending
（报 `didn't match PersistentVolume's node affinity`）。

## 四、不属于这一层的

- 命令、manifest 字段、逐条排错 → [`docs/OKTETO.md`](../../docs/OKTETO.md)
- 测试怎么写 → [go-testing.md](go-testing.md) + [`docs/TESTING.md`](../../docs/TESTING.md)
- 本地地址与配置分环境 → [local-env.md](local-env.md)
