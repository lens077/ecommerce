# 生产清单与多架构发布

本入口用于 node3~node5 集群的 ecommerce 工作负载。网关和 Config Center 仍由 control-tower 仓库管理；数据库、Pangolin 和其他集群组件不由本清单接管。

## 环境与接管边界

| 内容 | dev | pre | prod |
|---|---|---|---|
| Helm 差异 | `helm/values.yaml` | 追加 `values-pre.yaml` | 追加 `values-prod.yaml` |
| 后端裸清单 | `deploy/overlays/dev` | `deploy/overlays/pre` | `deploy/overlays/prod` |
| 前端裸清单 | consumer 的 `deploy/pre`、consumer-next 的 `deploy/base` | 同 dev | 两个 app 的 `deploy/overlays/prod` |
| 后端运行模式 | `dev` | `pre` | 暂沿用现网 `pre` |
| selector Secret | `ecommerce-config-source-dev` | `ecommerce-config-source-pre` | 暂沿用现网 `ecommerce-config-source-pre` |
| 服务直连路由 | 有，仅用于开发 | 无 | 无 |

prod 是部署目标，不代表 Config Center 已存在 `prod` 配置。不要仅通过改环境变量切换配置或数据库。Config Center 环境迁移需要独立准备 selector、权限和 Bootstrap，并验证后再更新两侧清单。

初始 prod 基线保留九个后端的 `1.6.3` 镜像；search 和两个前端固定 `sha-98ba5d1` 的 digest〔实测 2026-09-12〕。这三个应急镜像仍是 amd64-only，只在 prod 基线中引用，不覆盖公共 dev 值。后续晋级会统一替换为发布版本与多架构 index digest。

prod 清单不是现网全量快照：不会包含 live 注解、手工直连路由或其他仓库对象。首次接管必须审阅 diff，尤其是安全策略、Secret 引用和已退役对象。普通 apply 不会删除历史孤儿路由；不要用 `--prune` 或删除 namespace 处理差异。`search.apikv.com`、`cart-api.apikv.com` 的历史直连入口是否保留，需要单独处理，不因新清单默认无直连而声称它们已关闭。

## 发布流程

前置条件：代码和 Dockerfile 修改已提交；TCR 凭据与 `MANIFEST_PUSH_TOKEN` 已在 GitHub Secrets 配好。只有获得发布授权后才推 tag。

1. 选用新的裸 semver tag `X.Y.Z`，推送到 `github` 远端。不复用旧版本或应急 SHA 标签。
2. `backend.yml` 对发布 tag 构建全部十个后端，包含 search，不因路径差异跳过服务。手动 dispatch 保留后端按服务构建能力。
3. 同一入口调用 `frontend-release.yml`：consumer 与 consumer-next 分别在 `ubuntu-24.04` 和 `ubuntu-24.04-arm` 原生构建，不安装 QEMU。
4. 各前端平台制品以 digest 推送；检查镜像配置中的 Linux 架构，合并后检查 index 同时含 amd64、arm64。已有版本或 SHA 标签指向不同 digest 时，拒绝覆盖。
5. 全部构建成功后，CI 校验十二个镜像的双架构 index，并将版本与 digest 同时回写 dev 的 Helm 和裸清单，运行三个环境的 parity。prod 不随发布自动升级。

`frontend.yml` 仍是定时登录 smoke，与镜像发布分工独立。前端流程本次补齐的是构建、平台校验和清单接线，不代表它已经具有后端的全部 Trivy/Cosign/SBOM 供应链步骤。GitHub 实际构建、TCR 发布和线上新版本验收必须在首次发布后记录；本地 actionlint 不能替代这些验收。

## 显式晋级 prod

在工作区没有其他会话修改这些清单时执行。先登录 TCR，指定已经成功发布的版本：

```bash
python3 scripts/promote-release.py --environment prod --version X.Y.Z --check
python3 scripts/promote-release.py --environment prod --version X.Y.Z
```

将 `X.Y.Z` 替换为实际版本。脚本会先核验全部十二个制品，任何缺失、权限错误或单架构镜像都会中断，尚不写文件。全部检查通过后，成对写入版本与 index digest；parity 失败时恢复脚本修改前的清单内容。脚本不提交、不推送，也不调用集群 API。

审阅 `git diff`，更新 TODO 后按提交规范提交。正式部署前准备并检查线上 kubeconfig；本机默认 kubeconfig 不能被假定为生产。

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

## 验收与回退

- 等待十二个本仓 Deployment 的 rollout，检查实际 `imageID` 和 readiness，不把零副本的 Available 当作上线成功。
- 验证 `shop.apikv.com` 首页和真实静态资源、商品 SSR，以及经 `gateway.apikv.com` 的真实搜索请求。搜索还要检查 Elasticsearch 深健康。
- 保留已有 Pangolin node4/node5 双 target 与鉴权策略；本发布流程不创建或变更 target。
- 回退时恢复先前审阅过的 prod 清单版本及 digest，检查对应制品仍在仓库，然后按同一路径重新 diff、部署和验收。不要重新构建旧标签来充当回滚。
