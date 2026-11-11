# 交接：control-tower 0.4.2 发布收尾与 ecommerce 最终重均衡（2026-11-11 23:22 CST）

> 本文接 [HANDOFF-ecommerce-followups-20261111.md](HANDOFF-ecommerce-followups-20261111.md)。
> 三项里第一节、第二节代码侧、第三节第一次回平均已完成；**剩下的只有 0.4.2 发布收尾、三个镜像版本验证、最终重均衡**。
> 新会话按本文顺序执行即可，不要重做已完成的部分。

---

## 一、当前事实（生成本文时）

| 项目 | 状态 |
|---|---|
| control-tower 发布 tag | `0.4.2` / `v0.4.2`，同 commit `abb4a0b`，已推 GitHub + GitLab |
| 已废弃 tag | `0.4.1` / `v0.4.1` 已删除。原因：补渲染 `6b41056` 时移动过 tag，Go module 版本不可变，不能复用 |
| CI 运行 | GitHub Actions run `43045505964`（`CI` / `0.4.2`）**仍在进行** |
| CI 已完成 job | `test`、`web`、`codegen up-to-date`、`image (control-tower-config-web)` 全部 success |
| CI 进行中 job | `image (control-tower-config)`、`image (control-tower-gateway)` |
| 线上镜像 | gateway `0.4.0`（2/2）、config-center `0.3.0`（1/1）、config-center-web `0.3.0`（1/1） |
| ecommerce Pod 分布 | **k1/k2/k3 = `6/4/5`**（15 个 Running） |
| ecommerce 依赖 | `github.com/lens077/control-tower v0.4.2`，`structcheck` 全绿、`go build ./...` 通过 |
| ecommerce 本地提交 | `bb4156e3 build(backend): control-tower 改为 v0.4.2`、`6be73825 feat(structcheck): 接入 control-tower v0.4.1 与仓外网关拓扑`（**未 push**） |
| 当前分支/远端 | control-tower `main` = `abb4a0b`（GitHub 与 GitLab 同步）；ecommerce `main` 比 GitLab `origin/main` 多 2 个本地提交 |

### 分布为什么从 5/5/5 变成 6/4/5

第一次回平到 `5/5/5` 后，用户在 control-tower 提交了 `6b41056`（`customer:order.cancel.self`），
ArgoCD 于 `15:03Z` 同步 GitLab `main` 并滚动网关。网关第二个副本从 k2 换到 k1，
分布随之变成 `6/4/5`。这不是回平失败，等 0.4.2 发布把网关再滚一次后统一回平即可。

---

## 二、剩余步骤（按顺序）

### 1. 等 0.4.2 的 image/release job 跑完

```bash
cd /Users/lens/lens077/control-tower
gh run watch 43045505964 --exit-status
# 或只看状态
gh run view 43045505964 --json status,conclusion,jobs \
  --jq '{status,conclusion,jobs:[.jobs[]|{name,status,conclusion}]}'
```

通过标准：

- `image (control-tower-gateway)`、`image (control-tower-config)` 均为 success；
- 出现并成功 `release → pre (GitOps)`；
- release job 会：改 `deploy/chart/control-tower/values-pre.yaml` 三个 tag 为 `0.4.2` →
  渲染 `deploy/pre` → 提交 `release: 0.4.2 → pre [skip ci]` → 推 GitHub main → fast-forward 推 GitLab main。

如果失败：

- 先看失败 job 的日志，不要重复推同一个 tag。
- 修复后**必须发新版本号**（例如 `0.4.3`），不要移动 `0.4.2`：Go module 版本一旦被解析就不可变，
  移动 tag 会让不同时间拉取得到不同内容。
- 发版方式与本次相同：裸 tag `X.Y.Z` 触发 CI，`vX.Y.Z` 作为 Go module 消费指针，两者同 commit。

### 2. 确认 release 已回写并触发 ArgoCD

```bash
cd /Users/lens/lens077/control-tower
git fetch origin gitlab
git log --oneline -3 origin/main
grep -n "tag:" deploy/chart/control-tower/values-pre.yaml   # 三个都应为 0.4.2

kubectl -n argocd get application control-tower-gateway control-tower-config \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.sync.revision}{" "}{.status.sync.status}{" "}{.status.health.status}{"\n"}{end}'
```

预期：两个 Application 都 `Synced/Healthy`，revision 为 release 提交（`release: 0.4.2 → pre`）。

### 3. 验证三个镜像版本与健康状态

```bash
# 三个镜像都应为 0.4.2
kubectl -n ecommerce get deploy control-tower-gateway \
  -o jsonpath='{.spec.template.spec.containers[0].image} ready={.status.readyReplicas}/{.spec.replicas}{"\n"}'
kubectl -n config-center get deploy \
  -o jsonpath='{range .items[*]}{.metadata.name} {.spec.template.spec.containers[0].image} ready={.status.readyReplicas}/{.spec.replicas}{"\n"}{end}'

# 网关公网探活（根路径 404 是预期，不能用 / 探活）
curl -fsS https://gateway.apikv.com/readyz

# 滚动未完成时等就绪
kubectl -n ecommerce rollout status deploy/control-tower-gateway --timeout=300s
kubectl -n config-center rollout status deploy/config-center --timeout=300s
kubectl -n config-center rollout status deploy/config-center-web --timeout=300s
```

若 config-center 升级后不健康：先看 Pod 事件与日志，再考虑把 `values-pre.yaml` 的三个 tag 回退到
`0.3.0`/`0.4.0` 对应版本并重新提交；不要在 Pod 未就绪时继续做重均衡。

### 4. 最终重均衡（目标 5/5/5）

前提：网关和 config 都已 Ready，且**没有正在进行的滚动更新**。不要重启
`control-tower-gateway` 与 `consumer-next`（多副本）。

```bash
# 当前分布
kubectl get pods -n ecommerce -o json | python3 -c '
import sys,json,collections
d=json.load(sys.stdin); c=collections.Counter()
for p in d["items"]:
 if p["status"].get("phase")=="Running": c[p["spec"].get("nodeName","?")]+=1
print(dict(sorted(c.items())))
'

# 从「计数最多」的节点上挑一个单副本 Deployment，逐个重启，等 Ready 再下一个
kubectl -n ecommerce rollout restart deploy/<svc>
kubectl -n ecommerce rollout status deploy/<svc> --timeout=180s
```

调度规则（硬 spread `DoNotSchedule` + `maxSkew=1`）：新 Pod 会落在当前计数最少的节点，
只要 `目标节点计数 + 1 - 最小计数 <= 1`。所以：

- 每次只重启「最多节点」上的单副本 Pod；
- 重启后重新看分布，不要连续重启同一节点；
- 若新 Pod 回到原节点（说明该节点已是最小），换一个最多节点上的 Pod；
- 到 `5/5/5` 立即停手。

可重启的单副本 Deployment：`ecommerce-{address,behavior,cart,frontend,inventory,merchant,order,payment,product,search,user}-deploy`。

终态验收：

```bash
kubectl get pods -n ecommerce -o json | python3 -c '
import sys,json,collections
d=json.load(sys.stdin); c=collections.Counter()
for p in d["items"]:
 if p["status"].get("phase")=="Running": c[p["spec"].get("nodeName","?")]+=1
print(dict(sorted(c.items())))
'
kubectl -n ecommerce get deploy --no-headers | awk '{split($2,a,"/"); if(a[1]!=a[2]) print "NOT-READY:",$1,$2}'
```

目标：`k1/k2/k3 = 5/5/5`，没有 `NOT-READY`。

### 5. 更新执行记录

把最终结果写回
[HANDOFF-ecommerce-followups-20261111.md](HANDOFF-ecommerce-followups-20261111.md) 的「执行记录」：

- 三个镜像实际版本与 ArgoCD 同步 revision；
- 最终 Pod 分布；
- 0.4.2 release job 的 run id 与结论。

### 6. ecommerce 是否 push（需用户确认）

ecommerce 的两个本地提交尚未 push。`ecommerce-prod` 的 ArgoCD source 是 GitLab `main`，
但这批改动只涉及 `go.mod`、`.service-matrix.yaml`、`structcheck` 与文档，不改变 Helm 渲染结果，
push 不会触发工作负载滚动。按用户规则，push 前需要明确确认。

```bash
cd /Users/lens/lens077/ecommerce
git log --oneline origin/main..HEAD   # 应只有 bb4156e3、6be73825
```

---

## 三、红线

1. **不要复用或移动已发布的 Go module tag**。`0.4.1` 已因此删除；修复发布只能发新版本号。
2. 不打印、不落盘 Secret（`pal-qqbot-secrets`、`pal-pg-app`、operator token 等）。
3. 网关滚动期间不要重启上游服务；等 `control-tower-gateway` Ready 后再做重均衡。
4. 不要把仓库里预先存在的未提交文件混进提交：
   `README.md`、`README.zh-CN.md`、`.lint-baseline/revive-exported.txt`、
   `docs/architecture/ecommerce-stack-diagram*`、`docs/gitops/`。
5. `consumer-next` 两个副本仍同在 k2，属于遗留项；在 5/5/5 的硬 spread 下没有合法目标节点可分开，
   要处理必须单独设计（先制造节点差值或临时改软 spread），不要混进本次回平。

---

## 四、关键引用

- 交接原文与执行记录：`ecommerce/docs/ops/HANDOFF-ecommerce-followups-20261111.md`
- control-tower 发版脚本：`control-tower/scripts/promote-release.sh`
- 渲染一致性检查：`control-tower/scripts/deploy-render.py --check`
- 路由模板：`control-tower/routes/{dev,pre}.yaml`
- ecommerce 结构门禁：`ecommerce/backend/structcheck/`
- 本次 CI：`https://github.com/lens077/control-tower/actions/runs/43045505964`
