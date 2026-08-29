# 供应链安全演变全景

> 日期：2026-08-28。本文记录供应链安全从初始方案到实际落地的演变、已完成能力、未完成项、已知遗漏，以及距离目标状态的剩余路径。命令、告警指纹与单次验收细节见 [PR 阶段供应链门禁验证](2026-08-28-supply-chain-pr-validation.md)。

## 目标

目标不是一次性安装所有安全工具，而是建立一条可验证、低噪声、按风险逐步收紧的供应链：

```text
PR
  Gitleaks + zizmor + Trivy fs/config
    ↓ 全绿
Tag
  Buildx → Syft SPDX → Trivy image → Cosign sign/attest
    ↓ 全绿
Registry
  TCR 主镜像 + GHCR keyless 验签源 + Harbor Helm OCI
    ↓ 实测兼容
Cluster
  Kyverno 单副本 Audit → 资源/延迟达标 → Enforce
```

完成状态必须满足：

- 门禁经过红测，不能只证明正常输入返回 0；
- SBOM、扫描、签名均绑定不可变 digest，不依赖可变 tag；
- 多架构镜像按 amd64/arm64 child digest 分别处理；
- keyless 验签约束 GitHub Actions OIDC issuer 与受信任 workflow identity；
- TCR 能力以实际写入和回读为准，不把腾讯云企业版 KMS「镜像签名」等同于 Cosign keyless；
- Kyverno 必须先在当前 ARM64 小集群以 Audit 单副本测量，再决定是否 Enforce。

## 最初问题与演变

### 1. 从「启用三工具」演变为存量棘轮

首次全仓扫描得到：Gitleaks 工作树扫描 107 条、zizmor 43 个存量定位、Trivy 40 条 HIGH。直接硬门禁会让所有 PR 恒红；`gitleaks dir .` 还会读取 `.gitignore` 排除的本地凭据副本，不能代表 PR 引入。

最终策略：

- Gitleaks 只扫描 PR base commit 到 HEAD；
- zizmor 与 Trivy 全仓扫描，但只阻断基线外新增问题；
- 基线只能因修复而缩小，不允许为变绿而扩大。

### 2. 从「CI 能运行」演变为必须证明会阻断

门禁增加红测：模拟 AWS 密钥必须被 Gitleaks 阻断；未钉 commit SHA 的 Action 必须被 zizmor 阻断；新增 Kubernetes HIGH 配置误配必须被 Trivy 阻断。

红测发现两个前端 Deployment 的真实问题。没有将告警加入基线，而是补齐 Pod/Container `securityContext`，并为 Next.js cache、Caddy data/config 与 `/tmp` 提供受控可写卷。

### 3. 从「一份 SBOM」演变为多架构精确关联

本地 PoC 镜像只有 `linux/arm64` 与一个 `unknown/unknown` provenance manifest。若不指定平台，Syft 仍能产出看似正常的 SBOM，容易被误写成多架构覆盖。

最终按 Buildx OCI index 解析 amd64/arm64 child digest，分别生成 SPDX 2.3，并在 `manifest.json` 中记录 index 与平台 digest。缺少任一平台时硬失败。

### 4. 从「存在签名」演变为可信 workflow 身份

Cosign 签名不仅要通过密码学验证，还必须证明签名来自本仓发布 workflow。验签因此同时约束：

- OIDC issuer：`https://token.actions.githubusercontent.com`；
- 仓库：`lens077/ecommerce`；
- workflow：`backend.yml` 或 `service-ci.yml`；
- ref：裸 semver tag。

index digest 由 keyless signature 覆盖；amd64/arm64 SPDX 分别 attested 到对应 child digest。

### 5. 从「TCR 待确认」演变为有边界的兼容结论

GHCR 与 TCR 的镜像 digest 一致，只能证明内容一致，不能证明 TCR 能保存 Cosign 工件。因此先限定 `user` 服务做硬失败探测：写入 index signature 与两个平台 attestation，再立即从 TCR 回验。

`1.5.4` 探测成功。结论仅覆盖本项目该实际 digest，不升级为腾讯云对 TCR 个人版的官方兼容承诺。

## 已完成

### PR 阶段

- Gitleaks `8.30.0`：提交范围扫描、输出 redact、红测通过；
- zizmor `1.29.0`：GitHub Actions 全仓审计、存量棘轮、未钉 Action 红测通过；
- Trivy `0.74.0` fs/config：HIGH/CRITICAL 存量棘轮、新误配红测通过；
- PR 三件套最终返回 0；Trivy 存量由 40 条降为 34 条；
- 新增 workflow 权限仅为 `contents: read`，新增第三方 Action 使用 commit SHA。

实现：

- `.github/workflows/supply-chain-pr.yml`；
- `scripts/supply-chain-pr.sh`；
- `.supply-chain-baseline/`。

### Tag：Syft SBOM

- Syft `1.51.1` 固定版本并校验官方 checksums；
- 对 Buildx 不可变 OCI index 分别生成 amd64/arm64 SPDX 2.3；
- 保存服务、版本、index digest、平台 child digest；
- Actions artifact 保留 30 天；
- tag `1.5.2`、commit `8b33eb4`、run `33152252670`：22 个 jobs 全绿，10 个服务 artifact 齐全；
- 抽查 `user`：两平台各 107 packages、415 relationships，artifact digest 与 GHCR 一致。

### Tag：GHCR Cosign keyless

- Cosign `3.1.3` 固定版本并校验官方 checksums；
- index keyless signature；
- amd64/arm64 child digest 分别附 SPDX attestation；
- 保存 Sigstore bundle v0.3；
- 同一 job 回验 Fulcio CA、透明日志、claims、OIDC issuer 与 workflow identity；
- tag `1.5.3`、commit `8f4d223`、run `33154780470`：22 个 jobs 全绿；
- 抽查证书 SAN：`https://github.com/lens077/ecommerce/.github/workflows/service-ci.yml@refs/tags/1.5.3`。

### Tag：TCR Cosign 兼容性

- GHCR/TCR index 与两个 child digest 一致；
- 只对 `user` 做 TCR index 签名和双平台 SPDX attestation；
- tag `1.5.4`、commit `7d9354b`、run `33169663904`：22 个 jobs 全绿；
- 独立从 TCR 回验 index 得到 1 个有效签名，两个平台 attestation 均通过；
- 三个 TCR bundle 均为 Sigstore bundle v0.3。

## 没有做什么

### 尚未接入 Trivy image

当前 Trivy 只覆盖 PR 的 fs/config。tag 流水线还不能阻止带可修复 CRITICAL 镜像漏洞的制品被签名。

### 尚未部署 Kyverno

没有安装 Kyverno，没有创建 `verifyImages` 策略，也没有测量当前三节点 ARM64 集群的常驻资源和 admission P95/P99。Audit/Enforce 均未开始。

### 尚未将 TCR 双签扩展到全部服务

TCR 结论只来自 `user:1.5.4`。其他服务尚未逐一写入并回读 Cosign 工件。

### 尚未签 Harbor Helm OCI

没有对 Helm chart 生成或附加签名，也没有验证 Harbor 的 Cosign/Notation referrers 生命周期。

### 没有长期双跑 Grype

这是有意选择。Syft + Trivy 是主链路；Grype只用于争议 CVE 或扫描结果复核。没有证据支持宣称任一扫描器在所有场景绝对更准确。

### 没有使用长期 Cosign 私钥

GHCR/TCR 使用 GitHub Actions OIDC、Fulcio 短期证书和透明日志，没有在仓库或 GitHub Secrets 保存长期签名私钥。

## 已知遗漏与风险

1. **签名前缺少镜像漏洞门禁**：这是当前最大缺口。
2. **TCR 样本有限**：仅验证一个服务和一次实际 digest，未覆盖多服务并发、超大 attestation、垃圾回收和 retention。
3. **referrer 生命周期未测**：删除 tag/index、重推 tag、registry GC 后签名和 attestation 是否保留尚未验证。
4. **attestation 会累积**：相同 child digest 在多次发布中可能存在多个有效 attestation；Kyverno 需要明确「至少一个可信」还是更严格的 predicate 选择策略。
5. **SBOM 内容策略缺失**：目前只校验 SPDX 版本、非空 packages 和 digest 关联，尚未加入 license、禁止包、supplier 或完整度规则。
6. **zizmor 存量仍有 43 个定位**：包括旧 Action 未钉 SHA、template injection、权限过宽和 `secrets: inherit`。
7. **Trivy config 存量仍有 34 条**：棘轮防止新增，不表示现有配置已全部安全。
8. **Harbor 与 Helm 尚未进入实际验证**。
9. **Kyverno 的 ARM64 小集群成本未知**：不能套用官方高规格 x86_64/KinD/KWOK 压测结果。

## 距离目标还需要做什么

### 阶段 A：Trivy image

目标顺序：

```text
Buildx push
  → Syft SPDX
  → Trivy image
  → Cosign sign/attest
```

初始门禁：

- 扫描 GHCR 不可变 child digest；
- amd64、arm64 分别扫描；
- `CRITICAL` + `--ignore-unfixed`；
- 任一平台发现可修复 CRITICAL 时停止签名；
- JSON/SARIF 随发布 artifact 保存；
- 真实噪声稳定后再评估是否提升至 HIGH。

### 阶段 B：TCR 与 Harbor

- 将 TCR 双签从 `user` 扩展到其余服务；
- 测试删除、重推、GC、retention 对 Cosign referrers 的影响；
- 为 Harbor Helm OCI 选择并实测 Cosign/Notation 签名路径；
- 保持 TCR 企业版 KMS 签名与 Cosign keyless 的机制边界。

### 阶段 C：Kyverno Audit

- 单副本、Audit 模式；
- 先实施禁止 `latest` 与强制 digest；
- `verifyImages` 先指向已验证的 GHCR identity；
- TCR 仅在扩大双签和生命周期验证后加入；
- 记录常驻 CPU/内存、admission P50/P95/P99、失败率和业务 P99 变化；
- 明确故障开放/关闭策略和应急旁路。

### 阶段 D：Kyverno Enforce

只有 Audit 持续稳定且资源/延迟达到门槛后才进入 Enforce。Enforce 前还需完成回滚演练、签名服务不可用演练、策略例外审计和 break-glass 手册。

## 当前全景

```text
PR
├─ Gitleaks                         已完成、红测通过
├─ zizmor                           已完成、存量棘轮
└─ Trivy fs/config                  已完成、存量棘轮
        │
        ▼
Tag
├─ Buildx amd64/arm64               已完成
├─ Syft SPDX                        已完成，1.5.2 远端全绿
├─ Trivy image                      未开始 ← 当前最大缺口
├─ GHCR Cosign keyless              已完成，1.5.3 远端全绿
└─ TCR Cosign                       user 单服务完成，1.5.4 远端全绿
        │
        ▼
Registry
├─ GHCR 镜像签名/attestation        已验证
├─ TCR 镜像签名/attestation         有边界兼容实测
└─ Harbor Helm OCI                  未验证
        │
        ▼
Cluster
├─ Kyverno 单副本 Audit             未开始
├─ 禁 latest / 强制 digest          未开始
├─ verifyImages                     未开始
├─ 资源与 admission 延迟测量        未开始
└─ Enforce                          未开始
```

## 下一步

只进入 Trivy image 阶段：按 GHCR amd64/arm64 child digest 扫描 `CRITICAL` 且忽略无修复漏洞，扫描失败时禁止进入 Cosign 签名。该阶段远端全绿后，再扩展 TCR 双签并开始 Kyverno 单副本 Audit。