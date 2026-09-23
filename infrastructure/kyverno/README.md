# Kyverno：ecommerce 命名空间准入策略（GitOps）

本目录保存 ecommerce 命名空间级的 Kyverno `Policy`，由 ArgoCD `Application/ecommerce-kyverno`
（`argocd-application.yml`）自动同步：合入 GitLab `main` 即生效，回滚 = revert。
集群级 `ClusterPolicy`（无 limits / `:latest` 审计）和 Kyverno 本体归 kubernetes 仓 `components/kyverno/`。

## 文件

- `policies/ecommerce-image-provenance.yaml`：`verifyImages` keyless 审计，只覆盖
  `ccr.ccs.tencentyun.com/sumery/user*`，`failureAction: Audit`、`mutateDigest: false`。
- `argocd-application.yml`：ArgoCD Application，`CreateNamespace=true` + 自动同步 + prune + selfHeal。
- `smoke.sh`：正反向冒烟（见下）。
- 根目录 `argocd-proj.yml` 的 `namespaceResourceWhitelist` 已加 `kyverno.io/Policy`。

## 为什么只覆盖 user、只 Audit

发布链只在 `user` 上完成了 TCR Cosign 兼容探测（`.github/workflows/service-ci.yml`
「Probe TCR Cosign compatibility」），其余服务在 TCR 侧没有签名。现在就把它们纳入，PolicyReport 会被
一整页无法行动的 fail 淹没。扩到全服务的前置：CI 对全部服务在 TCR 上签名并回读通过，然后把
`imageReferences` 改成 `ccr.ccs.tencentyun.com/sumery/*`。

转 `Enforce` 的前置（kubernetes 仓 `components/kyverno/README.md`「签名纪元」）：14 天零误报 +
存量运行 digest 补签 + 删 pod 强制重建演练。Enforce 阶段的验收才是「拒绝测试」；当前 Audit 阶段的
验收是「放行但记 fail」。

## `type: SigstoreBundle` 不能省

发布链用 cosign 3.x，默认把签名存成 sigstore bundle（OCI referrers；TCR 个人版没有 Referrers API，
落成 `sha256-<digest>` 回退 tag，`tccli tcr DescribeImagePersonal` 能看到）。`verifyImages` 默认的
`type: Cosign` 只找 legacy `sha256-<digest>.sig` tag，对**已签名**镜像也报 `no signatures found`
（2026-09-22 实测）。`type: SigstoreBundle` 走 sigstore-go 的 bundle 路径，签名镜像才判 pass。

Kyverno 侧读 TCR 私有仓需要拉取凭据：kubernetes 仓 `components/kyverno/values.yaml` 的
`existingImagePullSecrets: [tcr-pull-secret]`（这是 `--imagePullSecrets` 参数，不是 Pod 的
`imagePullSecrets`）。

## 验收

```bash
# 正反向：已签名 digest → pass，未签名 → fail，两者都放行（Audit）
bash infrastructure/kyverno/smoke.sh
# PASS: Audit 放行两者；PolicyReport provenance-signed=pass provenance-unsigned=fail
```

`SIGNED_REF` 默认取 `backend/services/user/deploy/base/deployment.yaml` 里钉住的 digest。

### 未签名反例怎么来

TCR 上 `user` 的每个 release digest 都带签名（每次发版 CI 都签），没有天然反例。冒烟用一个一次性
探针 tag `ccr.ccs.tencentyun.com/sumery/user:kyverno-unsigned-probe`（Mac 上 `docker tag busybox:1.36 …`
+ `docker push --platform linux/amd64 …`，**不签名**）。它只是 busybox，不是 user 服务；用完可以
`tccli tcr DeleteImagePersonal --RepoName sumery/user --Tag kyverno-unsigned-probe` 删掉，
下次跑冒烟前再推一个。不要用 `dev` / `sha-*` tag 当反例——它们和 release 指向同一个已签名 digest。

## 后续

- `kyverno.io/v1 Policy` 已标 deprecated，迁移目标是 `policies.kyverno.io NamespacedImageValidatingPolicy`
  （CEL）。迁移时保留同一套 issuer / subjectRegExp，并重跑 `smoke.sh`。
- ArgoCD 只在 GitLab `main` 有 `infrastructure/kyverno/policies` 后才能 Synced；首次接管前
  策略本体由 `kubectl apply` 直接放上去验证过，ArgoCD 接管只会差 `tracking-id` 注解。
