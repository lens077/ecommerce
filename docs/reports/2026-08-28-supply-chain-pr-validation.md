# PR 阶段供应链门禁验证

> 日期：2026-08-28。范围：只落地 PR 阶段的 Gitleaks、zizmor、Trivy fs/config；不提前接入 tag 签名、SBOM、镜像扫描或集群验签。

## 结论

三件套可以落地，但不能将首次全量扫描结果直接设为硬门禁。仓库现有告警会导致 CI 恒红：Gitleaks 工作树扫描命中 107 条、zizmor 命中 37 条中高风险、Trivy 配置扫描命中 40 条 HIGH。正确的第一阶段是：

- Gitleaks 只扫描 PR 提交范围；新增秘密立即阻断，不扫描被 `.gitignore` 排除的本地配置副本。
- zizmor 和 Trivy 对全仓扫描，但采用存量指纹棘轮：存量继续可见，新增告警阻断，修复后基线自然下降。
- 基线只能因修复而缩小；发现新增项时不得直接扩基线。

实现入口：

```bash
./scripts/supply-chain-pr.sh
```

CI 入口：`.github/workflows/supply-chain-pr.yml`，仅在 `pull_request` 或手动触发时运行，权限只有 `contents: read`。

## 固定版本

| 工具 | 版本 | 安装与校验 |
|---|---:|---|
| Gitleaks | 8.30.0 | 官方 release tarball + 官方 checksums |
| zizmor | 1.29.0 | 官方 release tarball；macOS ARM64 与 Linux x86_64 摘要直接钉入脚本 |
| Trivy | 0.74.0 | 官方 release tarball + 官方 checksums |

未采用 Gitleaks GitHub Action，避免组织仓 Action 授权问题；CLI 本身仍为 MIT。没有把版本写成 `latest`。

## 首次真实扫描

### Gitleaks

直接执行 `gitleaks dir .` 命中 107 条，其中包括 `.gitignore` 排除的 `backend/infrastructure/consul/consul-kv.json`。这说明工作树全目录扫描会读取本机凭据副本，不适合作为 PR 门禁，也会把「未提交的本地文件」误报成 PR 引入。

门禁改用：

```bash
gitleaks git . --log-opts="<base>..HEAD" --redact
```

当前最近一次提交范围实测为 0 条。PR 中 `BASE_REF` 使用事件提供的 base commit SHA；本地默认使用 `HEAD~1`，也可显式传 `BASE_REF`。

### zizmor

以 regular persona、最低 medium severity/medium confidence 扫描现有 5 个 workflow：

- 原始结果：30 个 finding 对象、43 个定位指纹；
- 主要问题：18 个未按 commit SHA 钉住的第三方 Action、5 个 template injection，以及权限过宽；
- 新增的供应链 workflow 自身使用 SHA 固定的 `actions/checkout` 和 `actions/cache`，并设置 `persist-credentials: false` 与顶层只读权限。

存量问题写入 `.supply-chain-baseline/zizmor.txt`，后续新增定位会阻断。

### Trivy fs/config

使用 `--scanners misconfig --severity HIGH,CRITICAL` 全仓扫描：

- 40 条失败项；
- 主要为 33 条 `KSV-0014`（容器未设置只读根文件系统）、6 条 `KSV-0118`（默认安全上下文）和 1 条 Dockerfile 配置问题；
- 结果说明现有部署清单存在真实加固债务，但一次性修复不属于本阶段，也不能因为存量债务让所有 PR 恒红。

存量问题写入 `.supply-chain-baseline/trivy.txt`，新增 HIGH/CRITICAL 配置误配会阻断。

## 验收结果

- Gitleaks 正常提交范围返回 0；在临时 clone 注入随机格式 AWS 密钥后返回 1，且输出使用 `--redact`，红测通过。
- zizmor 当前 43 条存量定位均被基线识别；在临时 clone 新增 `actions/checkout@v4` 后识别 `unpinned-uses` 和权限问题并返回 1，红测通过。
- Trivy 当前存量基线为 40 条。并行 Agent 新增的 `frontend/apps/consumer-next/deploy/dev.yaml` 被实时识别出 3 条新 HIGH：一条 `KSV-0014` 和两条 `KSV-0118`，门禁正确返回 1。按并行协作约束，本次没有修改该 Agent 的文件，也没有把新告警加入基线。
- 随后为 `frontend/apps/consumer-next/deploy/dev.yaml` 与 `frontend/apps/consumer/deploy/deployment.yaml` 补齐 Pod/Container `securityContext`；为只读根文件系统补挂 Next.js cache、Caddy data/config 与 `/tmp` 可写卷，并将 Caddy 监听端口改为非特权的 `30080`。
- 修复后重跑 `./scripts/supply-chain-pr.sh`：Gitleaks 0 个新增秘密、zizmor 当前 43 条均为存量、Trivy 当前 34 条均为存量，三项全部返回 0。**PR 阶段于 2026-08-28 完成并全绿。**
- 删除既有告警不会失败；后续应同步删除对应基线指纹，使基线只减不增。

## 下一阶段进度与边界

PR 阶段全绿后，只继续验证了 tag 阶段的第一步：Syft 1.51.1 对本地 `ccr.ccs.tencentyun.com/sumery/consumer-next:dev-20260828-2` 镜像生成 SPDX 2.3 JSON，得到 355 个 packages、3999 个 relationships，输出约 3.1 MB；JSON 结构与非空 package 列表校验通过。可复现入口为：

```bash
./scripts/generate-sbom.sh \
  docker:ccr.ccs.tencentyun.com/sumery/consumer-next:dev-20260828-2 \
  /tmp/consumer-next.spdx.json
```

Syft 已接入 `.github/workflows/service-ci.yml`：仅发布 tag 且实际推送镜像时运行，读取 Buildx 输出的不可变 OCI index digest，针对 GHCR digest 分别生成 `linux/amd64` 与 `linux/arm64` SPDX 2.3 SBOM，再连同记录服务、版本、镜像和 index digest 的 `manifest.json` 上传为保留 30 天的 Actions artifact。`actions/upload-artifact` 固定到 commit SHA，不使用浮动 tag。

本地红绿验证结果：指定现有 TCR 镜像的 `linux/arm64` 平台成功生成 355-package SBOM；指定该镜像不存在的 `linux/amd64` 平台返回 1，证明平台缺失不会静默生成错误 SBOM。现有本地/TCR PoC 镜像并非 CI 目标的双架构产物，因此本次没有伪造「双架构远端实跑成功」结论。

### `1.5.2` 远端验收

发布 tag `1.5.2` 指向提交 `8b33eb4`。GitHub Actions run `33152252670` 的 10 个服务测试、双架构构建与 SBOM 上传全部成功，共产生 10 个 `sbom-<service>-1.5.2` artifact。

抽查 `sbom-user-1.5.2`：

- `manifest.json.indexDigest` 为 `sha256:cffac6e6ac2200c38cb276c1d88e0b05c0ecb945ed4aff3d46ff6b67f31b200e`，与 GHCR `user:1.5.2` 远端 OCI index digest 完全一致；
- 远端索引包含 `linux/amd64`、`linux/arm64`，另有 BuildKit provenance 的 `unknown/unknown` manifest；
- `user-amd64.spdx.json` 与 `user-arm64.spdx.json` 均为 SPDX 2.3，各包含 107 个 packages 与 415 个 relationships；
- 三个文件的 JSON 结构、服务名、版本、镜像 digest 与平台列表全部校验通过。

因此，**Syft tag 阶段已完成远端双架构验收**。

### `1.5.3` GHCR keyless 验收

发布 tag `1.5.3` 指向提交 `8f4d223`。GitHub Actions run `33154780470` 的 22 个 jobs 全部成功，10 个服务均生成包含 SPDX 与 Sigstore bundle 的 artifact。

抽查 `user:1.5.3`：

- index digest 为 `sha256:0b4b2a46bc503d8a26e49f5686f3e13c827fb9ceb63d37d3e8da62edbc1e9910`；
- index keyless 签名回验得到 1 个有效签名；
- amd64 child digest 为 `sha256:aa1877d71a894f22194fe7a5214bc2093aaa8823005262f59dd3b328545796cc`，arm64 为 `sha256:e14d0f0af462bf8625c9a1b6bbb3534d112e0ff1f756e0b7769b4a14136ac8b6`；
- 两个平台的 `spdxjson` attestation 均通过 Fulcio CA、透明日志和 Cosign claims 验证；
- `signature.bundle.json` 与两个 attestation bundle 均为 `application/vnd.dev.sigstore.bundle.v0.3+json`，包含 verification material；
- Fulcio 证书 SAN 精确为 `https://github.com/lens077/ecommerce/.github/workflows/service-ci.yml@refs/tags/1.5.3`，issuer 为 Sigstore intermediate；验签同时约束 GitHub Actions OIDC issuer。

因此，**Cosign 3.1.3 GHCR keyless 签名与平台 SBOM attestation 阶段已完成远端验收**。

### `1.5.4` TCR 兼容性验收

发布 tag `1.5.4` 指向提交 `7d9354b`。GitHub Actions run `33169663904` 的 22 个 jobs 全部成功；TCR 探测严格限定为 `user` 服务。

独立从 TCR 回验 `ccr.ccs.tencentyun.com/sumery/user@sha256:1cd199a2fcd4f9b96aed2ecac65e5a009b287bdf1e2e8f5c6396113d9b22d05f`：

- index keyless 签名回验得到 1 个有效签名；
- amd64 child digest `sha256:4237b30c453a836ef3cd0d4d46cef475aaa13b1de8eb29e1f93643840fa12c22` 的 SPDX attestation 回验通过；
- arm64 child digest `sha256:bfb90868cfcfdab48a11fb93ad50cc421ab5971a6e65037b786a97c188e3c536` 的 SPDX attestation 回验通过；
- TCR signature 与两个 attestation bundle 均为 Sigstore bundle v0.3，包含 verification material；
- Fulcio CA、GitHub Actions OIDC issuer、workflow identity、透明日志与 Cosign claims 检查全部通过。

因此，**TCR 个人版在本项目 `user:1.5.4` 的实际 OCI index/child digest 上能够保存并回读 Cosign 3.1.3 keyless signature 与 SPDX attestation**。这是一次有边界的兼容性实测，不等于腾讯云对 TCR 个人版提供官方兼容性承诺；TCR 企业高级版 KMS「镜像签名」仍是不同机制。

仍未验证或落地：其他服务的 TCR 双签扩展、Harbor Helm 签名、Trivy image、Kyverno `verifyImages`。

**下一步指示**：先把 tag 阶段的 Trivy image 扫描接到签名前，按 GHCR 不可变 digest 分别扫描 amd64/arm64，并以 `CRITICAL` + `--ignore-unfixed` 作为初始硬门禁；真实基线稳定后再评估是否提高到 HIGH。镜像扫描全绿后，再把 TCR 双签扩展到其他服务并进入 Kyverno Audit。
