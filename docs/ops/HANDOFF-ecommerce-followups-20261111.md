# 交接：PalCommerce 剩余三项（2026-11-11）

> 本文只覆盖三件事：① 监控告警（已落地）；② ecommerce `.service-matrix.yaml` / structcheck 协调（未做）；③ ecommerce Pod 节点重均衡（未做）。
> 前置上下文见同级仓 `palcommerce/docs/shop/HANDOFF-gateway-20261110.md`。
>
> 来源：从 `palcommerce/docs/shop/HANDOFF-ecommerce-followups-20261111.md` 迁入本仓 `docs/ops/`。
> 执行状态见文末「执行记录」。

---

## 一、监控告警（已完成）

### 指标来源

| 指标 | 来源 | 位置 |
|---|---|---|
| `cnpg_pal_topup_pending_total` | CNPG custom queries | `palcommerce/deploy/helm/palcommerce/templates/db-metrics.yaml` |
| `cnpg_pal_topup_pending_oldest_seconds` | 同上 | 同上 |
| `cnpg_pal_topup_closed_paid_total` | 同上 | 同上 |
| `cnpg_pal_delivery_unknown_total` | 同上 | 同上 |
| `cnpg_pal_delivery_failed_1h_total` | 同上 | 同上 |
| 网关 401/403/5xx | 网关自带 OTel HTTP 指标 | `http_server_request_duration_seconds_count{service_name="control-tower-gateway"}` |

指标名规则是 `cnpg_<query key>_<metric name>`，所以 ConfigMap 里 key 写短、SQL 列名写 `total` / `seconds`。

### 告警规则（8 条，已加载进 vmalert）

文件：`kubernetes/components/vmalert/rules/palcommerce.yml`

| 告警 | 表达式要点 | for |
|---|---|---|
| `PalTopUpPendingBacklog` | `cnpg_pal_topup_pending_total > 2` | 15m |
| `PalTopUpPendingStale` | `cnpg_pal_topup_pending_oldest_seconds > 1800` | 10m |
| `PalTopUpPaidButClosed` | `cnpg_pal_topup_closed_paid_total > 0` | 5m |
| `PalDeliveryUnknown` | `cnpg_pal_delivery_unknown_total > 0` | 10m |
| `PalDeliveryFailureBurst` | `cnpg_pal_delivery_failed_1h_total > 5` | 15m |
| `PalGatewayServerErrorRate` | 网关 5xx 占比 > 1% 且有流量门槛 | 10m |
| `PalGatewayAuthRejectedSpike` | 401+403 占比 > 50% 且 5m 内 > 60 次 | 15m |
| `PalBusinessMetricsMissing` | `absent(cnpg_pal_topup_pending_total)` | 15m |

### 踩过的坑（复现时必看）

1. **CNPG 读不到 ConfigMap**：instance manager 的 SA `palcommerce/pal-pg` 默认没有
   `get configmaps` 权限，日志报 `configmaps "pal-business-metrics" is forbidden`。
   已在 `db-metrics.yaml` 里加最小 Role/RoleBinding（仅这一个 ConfigMap 的 get）。
2. **Argo 项目不允许 RBAC**：AppProject `palcommerce` 的 `namespaceResourceWhitelist`
   原先没有 `rbac.authorization.k8s.io` 的 Role/RoleBinding，sync 会报
   `resource ... is not permitted in project palcommerce`。
   已 patch（**这个对象不在 Git 里**，重建 Argo 时必须重放）：

   ```bash
   kubectl -n argocd patch appproject palcommerce --type json -p '[
     {"op":"add","path":"/spec/namespaceResourceWhitelist/-","value":{"group":"rbac.authorization.k8s.io","kind":"Role"}},
     {"op":"add","path":"/spec/namespaceResourceWhitelist/-","value":{"group":"rbac.authorization.k8s.io","kind":"RoleBinding"}}]'
   ```

3. **数据库权限**：custom query 以 `cnpg_metrics_exporter` 执行，非 superuser。
   shop 表 owner 是 `root`，必须显式授权：

   ```sql
   GRANT USAGE ON SCHEMA public TO cnpg_metrics_exporter;
   GRANT SELECT ON shop_alipay_topups, shop_delivery_jobs, shop_delivery_attempts TO cnpg_metrics_exporter;
   ```

   不授权时指标静默缺失，日志里是 `permission denied for table ... (SQLSTATE 42501)`。

4. **custom queries 需要重启 PG 实例**才加载：改 ConfigMap 后
   `kubectl -n palcommerce delete pod pal-pg-1`，约 15 秒恢复。单实例 PG 会短暂不可用。
5. **采集范围**：otel collector 的 `job_name: cnpg` 原来只扫 `postgresql` namespace，
   已加 `palcommerce`（`kubernetes/components/opentelemetry/values.yaml`）。
   不加的话指标只存在于 Pod 的 9187，永远进不了 VictoriaMetrics。
6. **vmalert 不自动重读规则**：`components/vmalert/install.sh` 末尾会 reload。
   本机缺 PyYAML 时脚本的 lint 会失败，可跳过 lint 直接 patch ConfigMap 后
   `POST /-/reload`（vmalert 的 8880 端口）。

### 发布命令

```bash
cd /Users/lens/lens077/kubernetes
bash components/opentelemetry/install.sh   # 只在改了采集配置时需要
bash components/vmalert/install.sh         # 规则变更
```

验证：

```bash
kubectl -n observability exec deploy/vmalert -- wget -qO- http://127.0.0.1:8880/api/v1/rules | grep PalTopUp
# 业务指标（约 30s 一个点）
kubectl -n victoriametrics exec vm-single-victoria-metrics-single-server-0 -- \
  wget -qO- 'http://127.0.0.1:8428/api/v1/query?query=cnpg_pal_topup_pending_total'
```

### 遗留

- 业务指标只覆盖 5 个状态量；「notify 失败」没有独立的失败计数，用 PENDING 积压 + 最老等待时长间接覆盖。
- 告警走 alertmanager → ntfy（`alert-bridge`），未新增通知渠道。

---

## 二、ecommerce `.service-matrix.yaml` 与 structcheck 协调（未做）

### 背景

`ecommerce/backend/structcheck` 用 `control-tower/routes` 包与 `.service-matrix.yaml` 双向核对：

- 匿名路径必须进 `gateway.anonymous_paths`，且 **dev 和 pre 两个模板都要有**；
- 服务前缀必须与 matrix 的 services 对齐；
- direct host 约定是 `ecommerce-<svc>-service.ecommerce.svc`。

### 已存在的偏差（本次故意没修）

1. PalCommerce 商城新增的 5 条匿名 RPC（`ListCategories` / `ListProducts` / `GetPalOptions` /
   `ListPalPassives` / `ListTopUpPackages`）只在 `routes/pre.yaml`，dev 模板故意没有；
2. `package: shop` 与 `package: qqbot` 的 target 是仓外服务
   （`pal-shop-service.palcommerce.svc:30011`、`pal-qqbot-service.palcommerce.svc:30012`），
   不符合 `ecommerce-<svc>-service.ecommerce.svc` 约定，`serviceFromDirectHost` 会判为
   「matrix 里没有对应服务」。

**为什么当时不改**：一旦把匿名路径写进 matrix，ecommerce 当前 pin 的旧版 routes 包会让 CI 立刻红；
而 matrix 又不能只写 pre。所以必须等 control-tower 发版后一次性处理。

### 正确做法（一次性）

1. control-tower 发版（含 `package: shop` / `package: qqbot` 与 5 条匿名路径的 routes 包）；
2. ecommerce 升级 `control-tower` 依赖到该版本；
3. `.service-matrix.yaml` 增加 shop / qqbot 两个服务条目，并新增 externals 段描述仓外直连主机；
4. `structcheck` 放宽 direct host 校验：允许 matrix 里显式声明的 externals 主机；
5. 同步 `routes/dev.yaml`：加同样的 5 条匿名路径（dev-local 的端口冲突问题见
   `HANDOFF-gateway-20261110.md` 第七节第 4 条）。

### 验收

```bash
cd /Users/lens/lens077/ecommerce
go test ./backend/structcheck/...   # 全绿
cd /Users/lens/lens077/control-tower && make check-deploy
```

---

## 三、ecommerce Pod 节点重均衡（未做）

### 现状

13 个业务 Pod 在 k1/k2/k3 的分布约为 **7/6/1**（2026-11-10 实测）。

### 根因

- 每个服务的副本有 required pod anti-affinity（同服务不共享节点）；
- suite 级的 topologySpreadConstraints 原本是 `DoNotSchedule`，而 part-of=ecommerce 的计数已经漂移成
  7/6/1，唯一满足 `maxSkew=1` 的目标节点是 k3；
- 结果任何单副本服务重建都会被 anti-affinity 排除 k3，只能挤在 k1/k2，形成死锁
  （2026-11-10 网关第二个副本永久 Pending 即此原因）。

已于 `control-tower/deploy/chart/control-tower/templates/gateway/deployment.yaml` 把网关的
spread 降为 `ScheduleAnyway`，HA 仍由 required anti-affinity 保证。但**其他服务的计数漂移还在**。

### 建议做法

1. 先确认所有服务都已是软约束或可接受的硬约束：
   `kubectl -n ecommerce get deploy -o yaml | grep -A3 topologySpreadConstraints`
2. 逐个 `kubectl -n ecommerce rollout restart deploy/<svc>`，一次一个，等 Ready 后再下一个；
   scheduler 会把新 Pod 放到节点数最少的节点（前提是 spread 不是 DoNotSchedule）；
3. k3 当前只有 1 个 Pod，Cilium/CNPG 等系统组件也在 k3，注意资源余量：
   `kubectl describe node k3 | sed -n '/Allocated resources/,/Events/p'`。

### 验收

```bash
kubectl -n ecommerce get pods -o wide | awk '{print $7}' | sort | uniq -c
# 目标：三个节点各 4-5 个（±1）
```

### 风险

- 重启期间该服务单副本不可用（Recreate 类服务）或短暂双副本（RollingUpdate）；
- 不要在网关滚动的同时重启上游服务。

---

## 红线

1. 不打印、不落盘 Secret（`pal-qqbot-secrets`、`pal-pg-app`、operator token 等）。
2. 改 CNPG custom queries 后必须重启 PG 实例才会加载；重启前确认没有正在跑的对账/发货。
3. vmalert 规则发布后要 `POST /-/reload`，否则 95 秒后仍是旧表达式。
4. AppProject `palcommerce` 的 RBAC 白名单是手工 patch，不在 Git；换集群要重放第一节的命令。

---

## 执行记录（2026-11-11）

### 第一节：只读核对，确认已落地

- vmalert 已加载全部 8 条 `Pal*` 规则（`/api/v1/rules` 可查到）。
- `cnpg_pal_topup_pending_total` 已进入 VictoriaMetrics（`pal-pg-1`，namespace `palcommerce`）。
- AppProject `palcommerce` 的 `namespaceResourceWhitelist` 已含 `rbac.authorization.k8s.io` 的
  `Role` / `RoleBinding`，第一节第 2 条的 patch 无需重放。

### 第二节：已完成

- control-tower 正式发布 **0.4.1**（裸 tag `0.4.1` 触发 CI，`v0.4.1` 作为 Go 模块消费指针；
  两者同 commit）。发布前补跑了 `deploy-render`，修掉 `deploy/pre/gateway/{deployment,httproute}.yaml`
  与 chart 的渲染差异。
- `routes/dev.yaml` 补齐 5 条商城匿名路径；dev 仍不接 shop 路由，请求按 `ROUTE_NOT_FOUND` 处理。
- ecommerce 依赖升级到 `github.com/lens077/control-tower v0.4.1`。
- `.service-matrix.yaml`：
  - `gateway.anonymous_paths` 增加 5 条 `/shop.v1.shopService/*`；
  - 新增 `services.shop` / `services.qqbot`，标记 `out_of_repo: true`、`gateway_envs: [pre]`、
    `direct_host: pal-*-service.palcommerce.svc`；
  - 新增 `externals.pal_shop` / `externals.pal_qqbot`，显式声明仓外直连主机。
- structcheck：
  - `serviceEntry` 支持 `gateway_envs` / `out_of_repo` / `direct_host`；
  - `TestGatewayWiringMatchesMatrix` 允许 matrix `externals.host` 声明的直连主机；
  - 目录、部署入口、Dockerfile、适配层、分层导入、zero-trust SA 等检查跳过仓外服务。
- 验收：`go test ./backend/structcheck/...` 全绿；`go build ./...` 通过。

#### 版本漂移说明（0.4.0 → 0.4.1）

线上网关镜像 `0.4.0` 不是 CI 发版产物：`values-pre.yaml` 的 gateway tag 在提交 `7d07887`
（T1 断言 + shop mTLS）里被手工从 `0.3.0` 改成 `0.4.0`，而 Git 最新 release tag 只到 `0.3.0`。
直接重打 `0.4.0` 会覆盖已发布镜像，且 ArgoCD 因 tag 字符串不变不会滚动网关。因此本次正式发布
用 **0.4.1**：CI 重新构建三个镜像并回写 `values-pre.yaml`，ArgoCD 通过 GitLab webhook 滚动上线。

### 第三节：已完成

- 从 `7/7/1` 重平衡到 **`5/5/5`**（skew=0，全部 Deployment Ready）。
- 按序重启 4 个单副本 Deployment，每次等 Ready 再下一个：
  `ecommerce-address-deploy`（k1→k3）、`ecommerce-frontend-deploy`（k2→k3）、
  `ecommerce-behavior-deploy`（k1→k3）、`ecommerce-search-deploy`（k2→k3）。
- 重启前检查：三节点 requests（k3 最低，余量充足）；CES 122 个 endpoint 与存活 Pod UID
  对比 0 陈旧。
- 未重启 `control-tower-gateway` 与 `consumer-next`（多副本）。
- **遗留**：`consumer-next` 两个副本仍同在 k2。软反亲和 + suite-wide 硬 spread 在 5/5/5 下
  没有合法目标节点可分开，需先挪走 k2 上另一个 Pod 再重启它，属于后续单独操作。
