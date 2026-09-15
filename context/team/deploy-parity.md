---
name: deploy-parity
layer: team
description: 部署清单的两份真相源(helm/ 与裸 manifest)必须渲染出同一套集群对象;门禁是 scripts/verify-deploy-parity.sh。改 helm/、backend/services/*/deploy/、application-vpa.yml、frontend/apps/*/deploy/ 任一处前必读
affects:
  - helm
  - scripts/verify-deploy-parity.sh
---

# 部署清单双真相源:helm ≡ 裸 manifest

## 一、判定

仓库里同时保留两份 K8s 部署描述,面向两类使用者:

| 使用者 | 用哪份 | 入口 |
|---|---|---|
| helm / ArgoCD | `helm/`(umbrella + 12 个子 chart) | `make deploy`、`argocd-app.yml` |
| kubectl | `backend/services/<svc>/deploy/{base,overlays/prod}`（kustomize，`kubectl -k` 内置）+ `application-vpa.yml` + `frontend/apps/consumer/deploy/pre/` + `frontend/apps/consumer-next/deploy/base/` | `make k8s-dev-all` / `make k8s-pre-all` |

**两份不是主从,是等价**:`helm template` 出来的每一个对象,都必须与裸 manifest 里同 kind/namespace/name 的对象逐字段相同;任一侧多一个、少一个对象也不行。门禁:

```bash
scripts/verify-deploy-parity.sh      # 按 pre、prod 逐环境比;绿:同一套 N 个对象;红:打印 - 裸 / + helm 的 JSON diff
scripts/verify-deploy-parity.sh pre  # 只比一个环境
```

### 多环境:同一份资源、几个字段不同

「pre/prod 大体相同、各自差几个字段」不用整目录复制(2026-09-06 删掉的 `deploy/prod` 就是整抄后烂掉的),
两侧各用自己的原生分层,**共同部分只有一份,环境差异只写差异**:

| 侧 | 共同部分 | 环境差异 | 渲染 |
|---|---|---|---|
| 裸 | `deploy/base/`(deployment/service/…,即 pre 基线) | `deploy/overlays/prod/kustomization.yaml`:`resources: ../../base` + `images:` 钉 prod 的 version@digest | `kubectl kustomize deploy/overlays/<env>` |
| helm | `values.yaml`(=pre) | `values-prod.yaml` 只写差异(各服务 `image.tag`、两个策略开关) | `helm template -f values.yaml -f values-prod.yaml` |

现有 pre / prod 两个环境（2026-09-15 起；原 dev 集群已删除，dev 层与局域网直连路由一并移除）。prod 后端 overlay 继承 base 的运行配置，但独立固定镜像；
两个前端的 prod overlay 固定镜像，consumer-next 同时设置公网 publicURL。环境名不代表镜像架构。
⚠️ 各环境建的是**同名同 ns** 的对象，在同一集群 apply 会相互覆盖。生产入口必须显式指定
`KUBE_CONTEXT`，不能依赖本机默认 context。prod 暂沿用 `pre` 的运行模式及 selector Secret，
不凭目录名切换 Config Center。完整手顺见 [PRODUCTION-RELEASE.md](../../docs/PRODUCTION-RELEASE.md)。

三个实付的坑,改模板前先读:
- `defaultMode: 0400` 这种八进制字面量两侧要写成十进制 `256`:kustomize 按 YAML 1.1 读成 256,yq 按 1.2 读成 400,同一段文本两个解析器两个值。
- 改 env 用 JSON6902 按下标 `replace`(前面加一条 `op: test` 核对 name),**不要用 strategic merge**:kustomize 的 SMP 会把补丁过的项挪到列表最前,env 顺序进 pod template hash,顺序变了就是一次无意义的 rollout,parity 也会红。
- kustomize 渲染会丢注释;注释只活在源文件里,这正是裸侧保留手写文件的价值,别拿渲染结果回写源文件。

`scripts/verify-quick.sh` 并行跑它,CI `deploy-consistency.yml` 每个发布 tag 跑它,`backend/structcheck` 里有同名 Go 测试(缺 helm/yq 时跳过——脚本那道不跳)。

## 二、硬约束

1. **改一边必改另一边,同一个提交。** 加 env、改探针、改端口、改 replicas,两份都动;门禁红了就是有一边没跟上,不要用「先合了再补」绕过。
2. **共享的对象只有一份来源:`helm/files/`。** ServiceAccount ×11、CiliumNetworkPolicy、ExternalSecret `otel-auth` 放在 `helm/files/zero-trust.yaml` 与 `helm/files/otel-auth-externalsecret.yaml`,helm 经 `templates/*.yaml` 的 `.Files.Get`/`tpl` 输出,裸路径经 `scripts/render-zero-trust.sh` 用**同一条 helm 命令**渲染。不要在 `deploy/` 下再复制一份 SA。
3. **`otel-auth-externalsecret.yaml` 必须留在 `helm/files/` 并用 `.Files.Get` 输出,不能挪回 `templates/` 走模板引擎。** 里面的 `{{ .k8s }}` 是 ESO 的占位符,Helm 会把它吃成空串,Secret 照样 SecretSynced 但 token 为空,所有 OTLP 请求 401 静默丢弃(2026-08-27 实测)。
4. **helm 共用模板放 `helm/templates/_ecommerce.tpl`,不再有 `helm/library/` 与打包 tgz。** Helm 的命名模板是全局的,子 chart 直接 `include` 父 chart 的 define。原来的 library subchart 要 `helm dependency build` 打成 tgz 提交到每个子 chart 里,源码改了 tgz 没重打就静默渲染旧模板——structcheck 曾专门写测试去比对 tgz 内容,那是给错误设计打的补丁。structcheck 现在断言 `helm/library` 不存在。
5. **版本与 digest 两边同写。** 发布 tag 构建十个后端及两个前端，全部成功后 `backend.yml` 调用 `scripts/promote-release.py --environment pre`，校验十二个 index 均含 amd64/arm64，再同时更新公共 values 与裸清单并跑 parity。prod 使用同一脚本的 `--environment prod` 显式晋级，不随发布自动切换。脚本保留手写 YAML 格式；任何单架构镜像均不能晋级。tag 用发布版本 `X.Y.Z`，并固定 index digest，不用 `latest`/`dev`/`pre`/`prod` 浮动 tag。初始 prod 的应急 digest 只作为接管基线保留，不回写 pre。
6. **环境用分层不用复制。** 旧 `deploy/prod/` 于 2026-09-06 删除:从未 apply、`:prod` 浮动 tag、Consul 指向不存在的 8501/https、且已与 base 结构性漂移。现在是 `base` + `overlays/prod`(裸)与 `values.yaml` + `values-prod.yaml`(helm),见上「多环境」。
7. **VPA 只在 `application-vpa.yml`(裸侧)与各子 chart 的 `vpa.yaml`(helm 侧)。** 服务目录下不再放 `vpa.yml`;`control-tower-gateway-vpa` 归 control-tower 仓,本仓不持有(本仓那份曾与他们 apply 的版本在 containerName / min-max 上打架)。
8. **Postgres 出站 CIDR 是运行时注入值。** 两条路径都经 `scripts/resolve-postgres-egress-cidr.sh` 取;parity 脚本两侧统一喂 RFC 5737 占位地址,不需要 ssh 到集群。

## 三、怎么改(常见操作)

| 想做 | 改哪里 |
|---|---|
| 给某服务加 env | helm:`helm/templates/_ecommerce.tpl` 的 env 段(全体)或 `helm/values.yaml` 的 `<svc>.extraEnv`(单个);裸:该服务 `deploy/base/deployment.yaml` 同位置同顺序。**在 DEPLOYMENT_MODE 前面插入**会让 `overlays/pre/patch-env.yaml` 的下标失效(有 `op: test` 兜底,parity 会红) |
| 改端口 | `helm/values.yaml` 的 `<svc>.port`;裸:`base/deployment.yaml` 的 containerPort / 两个探针 + `base/service.yaml` 的 `port`(targetPort 是名字 `http`,不用动)+ `overlays/dev/{httproute,cnp-direct}.yaml` 的端口 |
| 改只属于某个环境的值 | helm:`values-<env>.yaml`;裸:`overlays/<env>/`(补丁或 `images:`)。**不要动 base / values.yaml** |
| 加一个新后端服务 | `.service-matrix.yaml` services 段 → `helm/Chart.yaml` dependencies + `helm/charts/<svc>/`(抄一个现成的) + `helm/values.yaml` 顶层段 + `values-prod.yaml` 一行 → 裸 `deploy/base/` + `overlays/prod/`(整目录抄 cart 的改名字/端口)+ `application-vpa.yml` 一条 + `helm/files/zero-trust.yaml` 的 SA 与 CNP 段 → `backend/Makefile` SERVICES → structcheck 与 parity 都绿 |
| 加一个非后端工作负载 | 子 chart(参考 `helm/charts/frontend/`)+ 裸文件 + `backend/Makefile` 的 `K8S_EXTRA_MANIFESTS` + parity 脚本 `raw_common` + structcheck `helmNonServiceKeys` |

## 四、验证

```bash
scripts/verify-deploy-parity.sh                                   # 两份等价(pre + prod)
helm template ecommerce helm -n ecommerce \
  --set-string global.postgresEgressCIDR=203.0.113.1/32 | kubectl diff -f -   # 与集群实况的差异(只该剩 CIDR)
cd backend && go test -count=1 ./structcheck/...
```

## 五、触发事故(2026-09-06)

用户要求核对集群与 `deploy/` 目录是否漂移。裸 manifest 与集群零漂移,但仓库里有四份互相打架的「真相源」:helm 渲染出的 Deployment 叫 `cart`、落 default ns、`LoadBalancer`、`pre` 模式、tag `1.6.3`,集群里一个都不存在;CI 发版**只回写 helm**,集群**只 apply 裸 manifest**,于是发版 tag 从未到达集群,而 Makefile 注释、`argocd-app.yml`、`.service-matrix.yaml` 三处对「谁是真相源」各说各话。另有 `deploy/prod/` 从未部署且已漂移、三个服务的 `vpa.yml` 与根文件逐字段重复、`control-tower-gateway-vpa` 跨仓重复。用户拍板两份都留、面向不同人群——那就必须让它们等价并由门禁守住。
