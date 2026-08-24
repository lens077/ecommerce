# 环境实测真相 — 2026-08-24

采集方式：直接 `kubectl` / `docker` / `brew` / 文件系统探测。**这份是实测，不是设计意图。**
用途：给「规则与环境重新对齐」任务当校对基准。任务结束后归档或删除。

## 集群

| 项 | 实测值 |
|---|---|
| context | `kubernetes-admin@kubernetes` |
| 版本 | v1.36.4 |
| 节点 | node101/102/103 = 192.168.3.101-103，**全部 arm64** |
| OS / runtime | Ubuntu 26.04 LTS，containerd 2.3.4 |
| 本机 docker | Server 29.7.2，**当前零运行容器** |

**不存在 192.168.3.202 这台「集群内 node2」** —— 集群只有 101/102/103。矩阵里那句排比要改。

## GitOps 现状（最大漂移点）

ArgoCD **已装且在跑**（argocd ns，argocd-server/repo-server/application-controller 均 Running），
但：

- `kubectl get applications -A` → **No resources found**
- `kubectl get applicationsets -A` → **No resources found**
- AppProject 只有 `default`

结论：**当前没有任何东西由 ArgoCD 管**。仓库根的 `argocd-app.yml` / `argocd-proj.yml` /
`argocd-repo.yml` 从未 apply（或已被删）。由此连带失效的说法：

1. `.service-matrix.yaml` 说 `helm/values.yaml` 是「ArgoCD GitOps 的集群权威真相源」→ 假的，
   集群现状由 `backend/services/*/deploy/` 手工路径产生。
2. AGENTS.md 反直觉约定里「ArgoCD selfHeal 会把漂移同步回去、无声干掉开发容器」→ 现在不成立，
   没有 Application 就没有 selfHeal。`scripts/argocd-devwindow.sh` 目前是空转。
3. `.github/workflows/deploy-consistency.yml` 若以 GitOps 为前提，需复核。

另有 argo-rollouts CRD 已装（analysisruns/rollouts 等），同样未见使用。

## ecommerce 命名空间实测

```
deployment/control-tower-gateway        2/2   11h   ← 新网关已切流上线
deployment/ecommerce-{address,behavior,cart,inventory,merchant,order,payment,product,search,user}-deploy  1/1  2d16h
deployment/ecommerce-outbox-relay       1/1   2d14h
deployment/ecommerce-search-indexer     1/1   2d14h
```

- **旧网关 Deployment 已不存在**，`ecommerce-gateway-service` (LB 192.168.3.131:8080)
  现在指向 `control-tower-gateway`。仓库里的 `gateway/` 目录已是纯历史包袱。
- LB IP：user .123 / search .124 / product .125 / order .126 / inventory .127 /
  merchant .128 / address .129 / payment .130 / gateway .131。
  behavior、cart 是 ClusterIP（cart 另有 HTTPRoute `cart-api.dev.test`）。

## config-center 现状（**迁移已完成**，名字是遗留标签）

`config-center` ns 里两个 Deployment 仍叫老名字，但**镜像已经是 control-tower 的**：

```
config-center       ccr.ccs.tencentyun.com/sumery/control-tower-config:sha-a27f90a
config-center-web   ccr.ccs.tencentyun.com/sumery/control-tower-config-web:sha-a27f90a
control-tower-gateway (ecommerce ns)  .../control-tower-gateway:sha-143ef5f
```

→ **control-tower 的 gateway 与 config 两个服务都已切流上线**，与 `deploy/dev/` 清单
（TCR + sha 钉）逐字一致。`config-center` 这个 ns/Deployment 名只是没改的遗留标签，
不代表旧 config-center 仓还在跑。HTTPRoute 仍是 `config-api.app.com` / `config.app.com`。

注意 control-tower 仓里 `deploy/dev` 是 TCR + sha 钉（= 线上实况），
`deploy/pre` 反而是 `ghcr.io/...:dev` 浮动 tag —— 两者命名与内容有点反直觉，别看反。

因此仓库侧待清理的是**纯历史包袱**：ecommerce 的 `gateway/` 目录、`gateway` git remote、
以及各处仍把 config-center 描述成独立仓/独立服务的文档。

## 基础设施实测（对照矩阵 externals）

| 组件 | 实测 | 与矩阵的差 |
|---|---|---|
| PostgreSQL | `pg-main-1` Running (postgresql ns, CNPG) | 一致 |
| Dragonfly | dragonfly ns 1 Running；集群内 `dragonfly.dragonfly.svc:6379`；LAN 经 Cilium Gateway `192.168.3.122:6380` | 一致，但需补 LAN 口 |
| **redis ns** | **不存在**（NotFound） | 矩阵说「已 scale 0 关停留备回滚」→ **回滚路径已消失**，该句作废 |
| Consul | `consul-server-0` 1 副本；LB `consul-expose-servers` 192.168.3.120 | 一致（仅注册发现） |
| NATS | nats-0/1/2 JetStream | 一致 |
| Meilisearch | `meilisearch-0` (search ns)，HTTPRoute search.dev.test | 一致 |
| **Kafka / strimzi** | **零残留**（grep 全集群无匹配） | 矩阵说「仅剩 strimzi operator 残留」→ 已清干净，该句作废 |
| **Casdoor** | **不在集群**，仍是外部 casdoor.apikv.com | 矩阵说「2026-08-20 定稿收编进集群」是计划，别写成已完成 |
| Elasticsearch | 已退役，无实例 | 一致 |

## 矩阵里完全没提、但真实存在的集群能力

这些 ns 都活着，属于「AI 每次都要现搜一遍的结构性事实」，按矩阵自己的判据应当入表：

`cert-manager`、`trust-system`(trust-manager)、`external-secrets`、`openbao`(openbao-0，Vault 系)、
`openfga`、`kyverno`、`keda`、`argo-rollouts`、`cilium-secrets` + Cilium Gateway API
(`cilium-gateway` 192.168.3.121 :80/:443)、`spegel`（镜像 P2P 分发）、`openebs`、
`cnpg-system`、`victoriametrics`(vm-single)、`observability`(grafana + jaeger)、`logging`(loki)。

内网域名（HTTPRoute）：argocd.dev.test / consul.dev.test / grafana.dev.test / jaeger.dev.test /
logs.dev.test / search.dev.test / cart-api.dev.test / config-api.app.com / config.app.com。

## 本机工具链实测

`brew leaves`：
`hcom(aannoo/hcom)` `argocd` `bash` `buf` `cocoapods` `crane` `k9s` `fd` `ffmpeg` `gh`
`golangci-lint` `helm` `kubernetes-cli` `okteto` `pipx` `shellcheck` `splitdns(soulteary/tap)`
`sqlc` `tree` `uv` `wget` `yq`

`brew list --cask` → 空。

## Agent 工具层实测

- 全局 MCP（`~/.claude.json` 顶层）：`ccteam`、`codex`、`goland`、`kitesurf`
- 项目级 MCP：`/Users/sumery/lens077/go-connect-template-cli` → `playwright`（**不是本仓**）
- 本仓 `.claude/kaneo-mcp.json`：`kaneo`（http，kaneo.apikv.com）—— 未挂进 settings，需确认是否仍用
- 全局 skills `~/.claude/skills/`：41 个
- 本仓 `skills/` 只有一个 README.md；`.claude/skills/kaneo-sync/SKILL.md`
- `.cursor/rules/` 12 条 .mdc
- `.impeccable/` 有 design.json + 历史截图 + hook 缓存

## 仓库 git 现状

- remotes：`origin`=GitLab(sumery/ecommerce)、`github`=GitHub(lens077/ecommerce)、
  **`gateway`=github.com/lens077/ecommerce-gateway.git（旧网关仓，已无用）**
- 最新 tag `1.5.1`；另有 `backup/pre-control-tower-20260823`
- 工作区有未提交改动：各服务 `Makefile` / `compose.yaml`（control-tower 迁移遗留）
