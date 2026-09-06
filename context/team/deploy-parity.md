---
name: deploy-parity
layer: team
description: 部署清单的两份真相源(helm/ 与裸 manifest)必须渲染出同一套集群对象;门禁是 scripts/verify-deploy-parity.sh。改 helm/、backend/services/*/deploy/、application-vpa.yml、frontend/apps/*/deploy/ 任一处前必读
---

# 部署清单双真相源:helm ≡ 裸 manifest

## 一、判定

仓库里同时保留两份 K8s 部署描述,面向两类使用者:

| 使用者 | 用哪份 | 入口 |
|---|---|---|
| helm / ArgoCD | `helm/`(umbrella + 12 个子 chart) | `make deploy`、`argocd-app.yml` |
| kubectl | `backend/services/<svc>/deploy/dev/` + `application-vpa.yml` + `frontend/apps/consumer/deploy/pre/` + `frontend/apps/consumer-next/deploy/dev.yaml` | `make k8s-dev-all` |

**两份不是主从,是等价**:`helm template` 出来的每一个对象,都必须与裸 manifest 里同 kind/namespace/name 的对象逐字段相同;任一侧多一个、少一个对象也不行。门禁:

```bash
scripts/verify-deploy-parity.sh      # 绿:同一套 N 个对象;红:打印 - 裸 / + helm 的 JSON diff
```

`scripts/verify-quick.sh` 并行跑它,CI `deploy-consistency.yml` 每个发布 tag 跑它,`backend/structcheck` 里有同名 Go 测试(缺 helm/yq 时跳过——脚本那道不跳)。

## 二、硬约束

1. **改一边必改另一边,同一个提交。** 加 env、改探针、改端口、改 replicas,两份都动;门禁红了就是有一边没跟上,不要用「先合了再补」绕过。
2. **共享的对象只有一份来源:`helm/files/`。** ServiceAccount ×11、CiliumNetworkPolicy、ExternalSecret `otel-auth` 放在 `helm/files/zero-trust.yaml` 与 `helm/files/otel-auth-externalsecret.yaml`,helm 经 `templates/*.yaml` 的 `.Files.Get`/`tpl` 输出,裸路径经 `scripts/render-zero-trust.sh` 用**同一条 helm 命令**渲染。不要在 `deploy/` 下再复制一份 SA。
3. **`otel-auth-externalsecret.yaml` 必须留在 `helm/files/` 并用 `.Files.Get` 输出,不能挪回 `templates/` 走模板引擎。** 里面的 `{{ .k8s }}` 是 ESO 的占位符,Helm 会把它吃成空串,Secret 照样 SecretSynced 但 token 为空,所有 OTLP 请求 401 静默丢弃(2026-08-27 实测)。
4. **helm 共用模板放 `helm/templates/_ecommerce.tpl`,不再有 `helm/library/` 与打包 tgz。** Helm 的命名模板是全局的,子 chart 直接 `include` 父 chart 的 define。原来的 library subchart 要 `helm dependency build` 打成 tgz 提交到每个子 chart 里,源码改了 tgz 没重打就静默渲染旧模板——structcheck 曾专门写测试去比对 tgz 内容,那是给错误设计打的补丁。structcheck 现在断言 `helm/library` 不存在。
5. **镜像 tag 两边同写。** CI `backend.yml` 的 `update-manifests` 发版后同时改 `helm/values.yaml` 的 `<svc>.image.tag` 与 `deploy/dev/deployment.yaml` 的 `image:`(sed,不用 yq -i——yq 会重排手写文档的注释与缩进),然后跑 parity 再提交。手工改 tag 也照此办。tag 用发布版本号 `X.Y.Z`,不用 `latest`/`dev`/`pre`/`prod` 浮动 tag(structcheck 拦)。
6. **只有 `dev` 一个环境目录。** `deploy/prod/` 于 2026-09-06 删除:从未 apply、`:prod` 浮动 tag、Consul 指向不存在的 8501/https、且已与 dev 结构性漂移(order 缺 vpa)。要 prod 时从 dev 复制再改,并同时给 helm 加一份 values 覆盖——不要再造一份没人跑的目录。
7. **VPA 只在 `application-vpa.yml`(裸侧)与各子 chart 的 `vpa.yaml`(helm 侧)。** 服务目录下不再放 `vpa.yml`;`control-tower-gateway-vpa` 归 control-tower 仓,本仓不持有(本仓那份曾与他们 apply 的版本在 containerName / min-max 上打架)。
8. **Postgres 出站 CIDR 是运行时注入值。** 两条路径都经 `scripts/resolve-postgres-egress-cidr.sh` 取;parity 脚本两侧统一喂 RFC 5737 占位地址,不需要 ssh 到集群。

## 三、怎么改(常见操作)

| 想做 | 改哪里 |
|---|---|
| 给某服务加 env | helm:`helm/templates/_ecommerce.tpl` 的 env 段(全体)或 `helm/values.yaml` 的 `<svc>.extraEnv`(单个);裸:该服务 `deploy/dev/deployment.yaml` 同位置同顺序 |
| 改端口 | `helm/values.yaml` 的 `<svc>.port`;裸:`deployment.yaml` 的 containerPort / 两个探针 + `service.yaml` 的 `port`(targetPort 是名字 `http`,不用动) |
| 加一个新后端服务 | `.service-matrix.yaml` services 段 → `helm/Chart.yaml` dependencies + `helm/charts/<svc>/`(抄一个现成的,只有 Chart.yaml/values.yaml/三个 include 模板) + `helm/values.yaml` 顶层段 → 裸 `deploy/dev/{deployment,service}.yaml` + `application-vpa.yml` 一条 + `helm/files/zero-trust.yaml` 的 SA 与 CNP 段 → `backend/Makefile` SERVICES → structcheck 与 parity 都绿 |
| 加一个非后端工作负载 | 子 chart(参考 `helm/charts/frontend/`)+ 裸文件 + `backend/Makefile` 的 `K8S_EXTRA_MANIFESTS` + parity 脚本 `raw_sources` + structcheck `helmNonServiceKeys` |

## 四、验证

```bash
scripts/verify-deploy-parity.sh                                   # 两份等价
helm template ecommerce helm -n ecommerce \
  --set-string global.postgresEgressCIDR=203.0.113.1/32 | kubectl diff -f -   # 与集群实况的差异(只该剩 CIDR)
cd backend && go test -count=1 ./structcheck/...
```

## 五、触发事故(2026-09-06)

用户要求核对集群与 `deploy/` 目录是否漂移。裸 manifest 与集群零漂移,但仓库里有四份互相打架的「真相源」:helm 渲染出的 Deployment 叫 `cart`、落 default ns、`LoadBalancer`、`pre` 模式、tag `1.6.3`,集群里一个都不存在;CI 发版**只回写 helm**,集群**只 apply 裸 manifest**,于是发版 tag 从未到达集群,而 Makefile 注释、`argocd-app.yml`、`.service-matrix.yaml` 三处对「谁是真相源」各说各话。另有 `deploy/prod/` 从未部署且已漂移、三个服务的 `vpa.yml` 与根文件逐字段重复、`control-tower-gateway-vpa` 跨仓重复。用户拍板两份都留、面向不同人群——那就必须让它们等价并由门禁守住。
