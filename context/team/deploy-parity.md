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
| kubectl | `backend/services/<svc>/deploy/{base,overlays/<env>}`（kustomize，`kubectl -k` 内置）+ `application-vpa.yml` + `frontend/apps/consumer/deploy/pre/` + `frontend/apps/consumer-next/deploy/dev.yaml` | `make k8s-dev-all` / `make k8s-pre-all` |

**两份不是主从,是等价**:`helm template` 出来的每一个对象,都必须与裸 manifest 里同 kind/namespace/name 的对象逐字段相同;任一侧多一个、少一个对象也不行。门禁:

```bash
scripts/verify-deploy-parity.sh      # 按 dev、pre 逐环境比;绿:同一套 N 个对象;红:打印 - 裸 / + helm 的 JSON diff
scripts/verify-deploy-parity.sh pre  # 只比一个环境
```

### 多环境:同一份资源、几个字段不同

「dev/pre/prod 大体相同、各自差几个字段」不用整目录复制(2026-09-06 删掉的 `deploy/prod` 就是整抄后烂掉的),
两侧各用自己的原生分层,**共同部分只有一份,环境差异只写差异**:

| 侧 | 共同部分 | 环境差异 | 渲染 |
|---|---|---|---|
| 裸 | `deploy/base/`(deployment/service/…,值以 dev 为准) | `deploy/overlays/<env>/kustomization.yaml`:dev 追加 `httproute.yaml`+`cnp-direct.yaml`;pre 用 JSON6902 补丁改 `DEPLOYMENT_MODE`/selector Secret,`images:` 钉 tag | `kubectl kustomize deploy/overlays/<env>` |
| helm | `values.yaml`(=dev) | `values-<env>.yaml` 只写差异(`deploymentMode`、`configSource.secretName`、`directAccess.enabled=false`、各服务 `image.tag`) | `helm template -f values.yaml -f values-<env>.yaml` |

parity 对每个环境各比一次,所以「本地直连只在 dev」不是靠自觉,是门禁:它出现在 pre 任一侧都会红。
现只有 dev / pre 两个环境;要 prod 时**从 pre 复制**(overlay + values 文件各一份),不要预先造一个没人 apply 的。
⚠️ 两个 overlay 建的是**同名同 ns** 的对象——在同一个集群上 apply pre 会覆盖 dev。pre 要么另一个集群,
要么在 overlay 加 `namespace:` + helm `-n` 隔开,这一步还没做。

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
5. **镜像 tag 两边同写。** CI `backend.yml` 的 `update-manifests` 发版后同时改 `helm/values.yaml` 的 `<svc>.image.tag` 与 `deploy/base/deployment.yaml` 的 `image:`(=dev;pre 的版本在 `overlays/pre` 的 `images.newTag` 与 `values-pre.yaml` 里显式钉,晋级时手改两处)(sed,不用 yq -i——yq 会重排手写文档的注释与缩进),然后跑 parity 再提交。手工改 tag 也照此办。tag 用发布版本号 `X.Y.Z`,不用 `latest`/`dev`/`pre`/`prod` 浮动 tag(structcheck 拦)。
6. **环境用分层不用复制。** 旧 `deploy/prod/` 于 2026-09-06 删除:从未 apply、`:prod` 浮动 tag、Consul 指向不存在的 8501/https、且已与 dev 结构性漂移。现在是 `base` + `overlays/<env>`(裸)与 `values.yaml` + `values-<env>.yaml`(helm),见上「多环境」。
7. **VPA 只在 `application-vpa.yml`(裸侧)与各子 chart 的 `vpa.yaml`(helm 侧)。** 服务目录下不再放 `vpa.yml`;`control-tower-gateway-vpa` 归 control-tower 仓,本仓不持有(本仓那份曾与他们 apply 的版本在 containerName / min-max 上打架)。
8. **Postgres 出站 CIDR 是运行时注入值。** 两条路径都经 `scripts/resolve-postgres-egress-cidr.sh` 取;parity 脚本两侧统一喂 RFC 5737 占位地址,不需要 ssh 到集群。

## 三、怎么改(常见操作)

| 想做 | 改哪里 |
|---|---|
| 给某服务加 env | helm:`helm/templates/_ecommerce.tpl` 的 env 段(全体)或 `helm/values.yaml` 的 `<svc>.extraEnv`(单个);裸:该服务 `deploy/base/deployment.yaml` 同位置同顺序。**在 DEPLOYMENT_MODE 前面插入**会让 `overlays/pre/patch-env.yaml` 的下标失效(有 `op: test` 兜底,parity 会红) |
| 改端口 | `helm/values.yaml` 的 `<svc>.port`;裸:`base/deployment.yaml` 的 containerPort / 两个探针 + `base/service.yaml` 的 `port`(targetPort 是名字 `http`,不用动)+ `overlays/dev/{httproute,cnp-direct}.yaml` 的端口 |
| 改只属于某个环境的值 | helm:`values-<env>.yaml`;裸:`overlays/<env>/`(补丁或 `images:`)。**不要动 base / values.yaml** |
| 加一个新后端服务 | `.service-matrix.yaml` services 段 → `helm/Chart.yaml` dependencies + `helm/charts/<svc>/`(抄一个现成的) + `helm/values.yaml` 顶层段 + `values-pre.yaml` 一行 → 裸 `deploy/base/` + `overlays/dev/` + `overlays/pre/`(整目录抄 cart 的改名字/端口)+ `application-vpa.yml` 一条 + `helm/files/zero-trust.yaml` 的 SA 与 CNP 段 → `backend/Makefile` SERVICES → structcheck 与 parity 都绿 |
| 开/关某服务的局域网直连 | helm:`global.directAccess.enabled`(整体)或删该子 chart 的 `httproute.yaml` + `cnp-direct.yaml`;裸:`overlays/dev/` 下同名的**两个文件**成对增删(HTTPRoute 与放行 `ingress` 实体的 CNP,缺 CNP 就 503/5s)。共享 zero-trust CNP 不动;**pre/prod 的 overlay 不得引用**(见 local-env.md) |
| 加一个非后端工作负载 | 子 chart(参考 `helm/charts/frontend/`)+ 裸文件 + `backend/Makefile` 的 `K8S_EXTRA_MANIFESTS` + parity 脚本 `raw_common` + structcheck `helmNonServiceKeys` |

## 四、验证

```bash
scripts/verify-deploy-parity.sh                                   # 两份等价(dev + pre)
helm template ecommerce helm -n ecommerce \
  --set-string global.postgresEgressCIDR=203.0.113.1/32 | kubectl diff -f -   # 与集群实况的差异(只该剩 CIDR)
cd backend && go test -count=1 ./structcheck/...
```

## 五、触发事故(2026-09-06)

用户要求核对集群与 `deploy/` 目录是否漂移。裸 manifest 与集群零漂移,但仓库里有四份互相打架的「真相源」:helm 渲染出的 Deployment 叫 `cart`、落 default ns、`LoadBalancer`、`pre` 模式、tag `1.6.3`,集群里一个都不存在;CI 发版**只回写 helm**,集群**只 apply 裸 manifest**,于是发版 tag 从未到达集群,而 Makefile 注释、`argocd-app.yml`、`.service-matrix.yaml` 三处对「谁是真相源」各说各话。另有 `deploy/prod/` 从未部署且已漂移、三个服务的 `vpa.yml` 与根文件逐字段重复、`control-tower-gateway-vpa` 跨仓重复。用户拍板两份都留、面向不同人群——那就必须让它们等价并由门禁守住。
