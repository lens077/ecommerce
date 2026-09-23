---
name: image-supply-chain
layer: team
description: 镜像搬运与签名验证的两条硬边界：跨架构镜像必须显式 --platform；cosign 3.x 的 bundle 签名格式与验证器（Kyverno）必须对齐
---

# 镜像供应链：搬运与验签的两条硬边界

两笔都在 2026-09-22 实付过学费，现象都是「命令全部成功，集群上就是不工作」。

## 1. 从 Mac 搬镜像到 TCR：每条命令都带 `--platform linux/amd64`

机房节点拉不动的上游镜像（`reg.kyverno.io`、`registry.k8s.io` 等，单镜像 1 小时以上）走
「Mac `docker pull` → `docker push` 到 TCR → 节点从 TCR 拉」这条路。**Mac 是 arm64**，
`docker pull` 默认取 arm64 变体，`docker push` 只推本地已有的那个平台，节点上 `crictl` 拉到的就是
arm64 层——Pod `CrashLoopBackOff`，日志一行：`exec /ko-app/<bin>: exec format error`。

正确写法（三处都要）：

```bash
docker pull --platform linux/amd64 reg.kyverno.io/kyverno/kyverno:v1.19.1
docker tag  reg.kyverno.io/kyverno/kyverno:v1.19.1 ccr.ccs.tencentyun.com/sumery/kyverno:v1.19.1
docker push --platform linux/amd64 ccr.ccs.tencentyun.com/sumery/kyverno:v1.19.1
```

- `docker tag` 指向本地 tag 时解析到**先拉的那个平台**；已经拉过 arm64 再 `pull --platform amd64`
  会显示「Image is up to date」，但 tag 仍指 arm64。`push --platform` 才是决定推哪个变体的开关。
- 推错之后节点缓存里留着错架构层，`helm upgrade`/重启 Pod 不会刷新——先 `crictl rmi <image>` 再拉。
- 推送后 digest 变了才说明换了变体；单平台 manifest 的 `docker manifest inspect` 不带 `platform` 字段，
  看不出架构，只能靠节点上真跑起来。
- 验收判据：`kubectl get nodes -o custom-columns=ARCH:.status.nodeInfo.architecture` 与
  `docker version --format '{{.Server.Arch}}'` 不一致，就必须显式 `--platform`；不要凭
  「chart 支持 arm64」这类过期备注判断（本集群三节点是 amd64，Tetragon 旧 README 写的 ARM64 是重建前的机器）。

## 2. cosign 3.x 默认写 sigstore bundle：验证器必须认这个格式

发布链（`.github/workflows/service-ci.yml`）用 cosign 3.1.x keyless 签名，**默认**把签名存成
sigstore bundle（OCI referrers artifact；TCR 个人版没有 Referrers API，落成 `sha256-<digest>` 回退 tag，
`tccli tcr DescribeImagePersonal` 看得到）。legacy 的 `sha256-<digest>.sig` tag **不再产生**。

后果：任何按 legacy 格式找签名的验证器会对**已签名**镜像报 `no signatures found`——
Kyverno `kyverno.io/v1` `verifyImages` 默认的 `type: Cosign` 就是这样。对齐方式：

- Kyverno legacy 策略：`verifyImages[].type: SigstoreBundle`（keyless 专用，需 `issuer` + `subjectRegExp`；
  静态 key 签名不支持这个类型）。
- Kyverno `ImageValidatingPolicy`（CEL）：走 sigstore-go，原生认 bundle；1.19.1 起修了跨仓库 referrers 发现。
- 反过来要兼容旧验证器就得在 CI 加 `--new-bundle-format=false`，但那是让签名迁就验证器，不推荐。

验收必须正反向：同一策略下**已签名 digest → pass、未签名镜像 → fail**。只测未签名会漏掉「格式不认导致
全部 fail」这类假阳性——2026-09-22 就是签名镜像也 fail 才暴露的问题。`infrastructure/kyverno/smoke.sh`
固化了这两条断言。

Kyverno 读私有仓（TCR）的签名 manifest 需要自己的拉取凭据：chart 值 `existingImagePullSecrets`
（对应 `--imagePullSecrets` 参数），这和 Pod 的 `imagePullSecrets` 是两回事。

## 快速自检

```bash
# 节点架构 vs 本机 docker
kubectl get nodes -o custom-columns=NAME:.metadata.name,ARCH:.status.nodeInfo.architecture
docker version --format '{{.Server.Os}}/{{.Server.Arch}}'
# 某 tag 在 TCR 上有没有 bundle 签名(回退 tag)
tccli tcr DescribeImagePersonal --RepoName sumery/user --Limit 60 | jq -r '.Data.TagInfo[].TagName' | grep '^sha256-'
```
