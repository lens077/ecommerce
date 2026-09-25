# 生产清单与多架构发布

本入口用于 node3~node5 集群的 ecommerce 工作负载。网关和 Config Center 仍由 control-tower 仓库管理；数据库、Pangolin 和其他集群组件不由本清单接管。

## 环境与接管边界

| 内容 | pre | prod |
|---|---|---|
| Helm 差异 | `helm/values.yaml` | 追加 `values-prod.yaml` |
| 后端裸清单 | `deploy/base` | `deploy/overlays/prod` |
| 前端裸清单 | consumer 的 `deploy/pre`、consumer-next 的 `deploy/base` | 两个 app 的 `deploy/overlays/prod` |
| 后端运行模式 | `pre` | `prod`（须先准备独立配置与授权） |
| selector Secret | `ecommerce-config-source-pre` | `ecommerce-config-source-prod` |
| 迁移 Secret | `ecommerce-db-migrate` | `ecommerce-db-migrate-prod` |

2026-09-15 起没有 dev 层：原 dev 集群已删除，开发改走 remote-dev（见 `context/team/local-env.md`），`values.yaml` / `deploy/base` 即 pre 基线，局域网直连路由随 dev 一并移除。

prod 是部署目标，不代表 Config Center 已存在 `prod` 配置。不要仅通过改环境变量切换配置或数据库。Config Center 环境迁移需要独立准备 selector、权限和 Bootstrap，并验证后再更新两侧清单。

初始 prod 基线保留九个后端的 `1.6.3` 镜像；search 和两个前端固定 `sha-98ba5d1` 的 digest〔实测 2026-09-12〕。这三个应急镜像仍是 amd64-only，只在 prod 基线中引用，不覆盖公共 pre 值。后续晋级会统一替换为发布版本与多架构 index digest。

prod 首次接管（2026-09-14）只发版，不接管两类对象，由 `values-prod.yaml` 的两个开关控制（两条部署路径与 parity 一起认）：`global.networkPolicy.enabled=false` 跳过零信任 CNP（线上零 CNP、规则未在该集群验证，待办要求先走审计模式）；`global.otelAuthExternalSecret.enabled=false` 跳过 `otel-auth` ExternalSecret（引用的 `vault` store 线上不存在，现有静态 Secret 可用）。开关默认在 `values.yaml` 为 true，dev/pre 不受影响。

prod 清单不是现网全量快照：不会包含 live 注解、手工直连路由或其他仓库对象。首次接管必须审阅 diff，尤其是安全策略、Secret 引用和已退役对象。普通 apply 不会删除历史孤儿路由；不要用 `--prune` 或删除 namespace 处理差异。`search.apikv.com`、`cart-api.apikv.com` 的历史直连入口是否保留，需要单独处理，不因新清单默认无直连而声称它们已关闭。

## 发布流程

前置条件：代码和 Dockerfile 修改已提交；TCR 凭据与 `MANIFEST_PUSH_TOKEN` 已在 GitHub Secrets 配好。只有获得发布授权后才推 tag。

1. 选用新的裸 semver tag `X.Y.Z`，推送到 `github` 远端。不复用旧版本或应急 SHA 标签。
2. `backend.yml` 对发布 tag 构建全部十个后端，包含 search，不因路径差异跳过服务。手动 dispatch 保留后端按服务构建能力。
3. 同一入口调用 `frontend-release.yml`：consumer 与 consumer-next 分别在 `ubuntu-24.04` 和 `ubuntu-24.04-arm` 原生构建，不安装 QEMU。
4. 各前端平台制品以 digest 推送；检查镜像配置中的 Linux 架构，合并后检查 index 同时含 amd64、arm64。已有版本或 SHA 标签指向不同 digest 时，拒绝覆盖。
5. 同一入口构建 `dbmigrate`，复用后端扫描、签名和 SBOM；全部十三个制品成功后，CI 校验双架构 index，将版本与 digest 同时回写 pre 的 Helm 和裸清单并运行 parity。prod 不随发布自动升级；手动 dispatch 只构建，不晋级应用或迁移清单。
6. 部署入口先运行迁移 Job，只有 `Complete=True` 才 apply 新工作负载。原生 Helm/Argo 使用 hook，裸入口调用同一模板。失败保留 Job，停止发布，不自动回滚 schema。Secret、种子生命周期和审计保留见 [dbmigrate](../backend/tools/dbmigrate/README.md#集群发布门禁)。

`frontend.yml` 仍是定时登录 smoke，与镜像发布分工独立。前端流程本次补齐的是构建、平台校验和清单接线，不代表它已经具有后端的全部 Trivy/Cosign/SBOM 供应链步骤。GitHub 实际构建、TCR 发布和线上新版本验收必须在首次发布后记录；本地 actionlint 不能替代这些验收。

## 显式晋级 prod

在工作区没有其他会话修改这些清单时执行。先登录 TCR，指定已经成功发布的版本：

```bash
python3 scripts/promote-release.py --environment prod --version X.Y.Z --check
python3 scripts/promote-release.py --environment prod --version X.Y.Z
```

将 `X.Y.Z` 替换为实际版本。脚本会先核验全部十三个制品，任何缺失、权限错误或单架构镜像都会中断，尚不写文件。全部检查通过后，成对写入版本与 index digest；parity 失败时恢复脚本修改前的清单内容。脚本不提交、不推送，也不调用集群 API。

审阅 `git diff`，更新 TODO 后按提交规范提交。正式部署前用 `kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}'` 确认 context 指向线上集群（2026-09-09 起本机默认 context `kubernetes-admin@kubernetes` 即线上；`KUBE_CONTEXT` 仍必须显式写出）。

## 渲染、差异检查与部署

离线验证不需要 SSH、真实数据库地址或集群凭据：

```bash
bash scripts/verify-deploy-parity.sh
python3 scripts/test-promote-release.py
```

生产操作需要显式 `KUBE_CONTEXT`。运行时数据库出站 CIDR 应由受控环境提供，不入库。先渲染到本地临时文件并审阅，再向明确选择的集群执行 `kubectl diff`；返回 1 代表有差异，其他非零返回码必须调查。

```bash
helm template ecommerce helm -n ecommerce \
  -f helm/values.yaml -f helm/values-prod.yaml \
  --set-string global.postgresEgressCIDR="$POSTGRES_EGRESS_CIDR" > /tmp/ecommerce-prod.yaml
kubectl --context "$KUBE_CONTEXT" diff -f /tmp/ecommerce-prod.yaml
```

只有部署已获授权且差异审阅通过后，选择其中一条路径，不要两条同时执行：

```bash
# Helm 渲染后 apply；不会安装 Helm release 或启用 ArgoCD。
DEPLOY_ENV=prod KUBE_CONTEXT="$KUBE_CONTEXT" DRY_RUN=1 bash scripts/deploy-k8s.sh
DEPLOY_ENV=prod KUBE_CONTEXT="$KUBE_CONTEXT" bash scripts/deploy-k8s.sh

# 或裸清单路径：同一套受 parity 验证的对象。
make -C backend k8s-prod-all KUBE_CONTEXT="$KUBE_CONTEXT" KUBECTL_ARGS=--dry-run=server
make -C backend k8s-prod-all KUBE_CONTEXT="$KUBE_CONTEXT"
```

两条路径都需要现成的 selector Secret、镜像拉取凭据及相关基础设施。prod 入口拒绝空 context；目前没有生产 ArgoCD Application，因此 prod 的 `DEPLOY_MODE=argocd` 被拒绝。

## 部署前检查（2026-09-14 首次发布的教训）

apply 之前先做三件事，每件都是这次真实踩到的：

1. `kubectl -n ecommerce get deploy` 的 READY 列不能有空值。网关 `control-tower-gateway` 当时 READY 为空（readyz 连续 503 两天），表格里一眼可见却被忽略；发布不会修它，只会让「新版本上线了」和「公网 503」同时成立。
2. 看 node3 负载：`ssh node3 cat /proc/loadavg`，5 分钟平均 > 20 就不要开始滚动——新 Pod 的 PG ping 与 search 的 ES 深检都有 4–10 秒期限，风暴期必超时；老 Pod 靠已建连接池能撑，新 Pod 起不来。等 load 回到个位数再 apply。
3. 滚动策略保证不断服（1 副本 + `maxSurge 25%` → 新 Pod 就绪前旧 Pod 不下线），所以 CrashLoop 不等于事故；但 `rollout status` 会一直等，用 `get pods` 看具体 Pod 与 `--previous` 日志判断是启动期限还是真错。

## 验收与回退

- 等待十二个本仓 Deployment 的 rollout，检查实际 `imageID` 和 readiness，不把零副本的 Available 当作上线成功。
- 验证 `shop.apikv.com` 首页和真实静态资源、商品 SSR，以及经 `gateway.apikv.com` 的真实搜索请求。搜索还要检查 Elasticsearch 深健康。
- 保留已有 Pangolin node4/node5 双 target 与鉴权策略；本发布流程不创建或变更 target。
- 回退时恢复先前审阅过的 prod 清单版本及 digest，检查对应制品仍在仓库，然后按同一路径重新 diff、部署和验收。不要重新构建旧标签来充当回滚。
