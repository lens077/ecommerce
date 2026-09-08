---
name: 2026-09-02-two-remote-ci-split
layer: decisions
status: implemented
description: GitLab（origin）跑代码门禁，GitHub 只由发布 tag 触发跑发布链；同一 tag 只允许一边写镜像仓
---
# 决策：两个远端各管一件事——GitLab 门禁、GitHub 发布

## 问题

仓库有两个远端：`origin` 是 GitLab（日常 push / MR 的去处），`github` 是 GitHub（public 镜像，Actions 在这边）。
2026-08-20 起 GitHub 侧改为**只由发布 tag 触发**（重 workflow 收敛，见 evolution-log 同日条目），于是 MR / 分支 push
在两边都没有任何代码门禁，只剩知识库结构检查；前端更极端，`pnpm ready` 此前不在任何 CI 里。
2026-09-02 复盘时还发现 pnpm 版本在三处手抄且不一致，`.gitlab-ci.yml` 头注把"按纪律不在这里发布"误写成"这里不能跑 CI"。

## 决策

- **GitLab（origin）= 门禁**。`.gitlab-ci.yml` 三道门：`context-gate`（`verify-context.sh` + canary）、
  `backend-gate`（`go build && go vet && go test -short ./...`，含 structcheck）、`frontend-gate`（`pnpm ready`）；
  后两道就是 AGENTS.md「命令与验收锚点」原样搬进 CI，按 `rules: changes` 路径触发。顶层 `workflow: rules` 单点决定
  建不建流水线：MR 事件建、分支 push 建、已有 MR 的分支 push 不重复建、**tag 一律不建**；`default: interruptible: true`
  让同分支新 push 取消旧流水线（gitlab.com compute minutes 计量）。pnpm 版本从 `frontend/package.json` 的 `packageManager` 读。
- **GitHub = 发布**。只由裸 semver tag 触发：多架构镜像、Trivy、Cosign 签名、SBOM、回写清单。
  MR / 分支 push 在这边没有代码门禁——这是 GitLab 那三道门补的。
- **同一发布 tag 只允许一边写镜像仓与回写清单**，所以 GitLab 对 tag 不建流水线。
  两边职责与手顺定稿在 [git-commit.md](../../team/git-commit.md)「两个远端的 CI 职责切分」。

## 考虑过的替代方案

- **把发布链搬到 GitLab，一边管全部** — 签名身份（Fulcio 证书里的 GitHub workflow ref）、SARIF 上报目的地、
  buildx 的 gha 缓存、零计费的 public runner 都绑在 GitHub 上，搬家换不到任何新能力，只换来重建成本。
- **两边都跑门禁** — 同一套门禁逻辑双写必然漂移（pnpm 版本三处不一致就是双写的现成样本）；
  门禁放在日常 push 的去处一处即可。
- **GitHub 恢复 per-push 门禁** — 2026-08-20 收敛到 tag 触发的理由仍然成立：重 workflow（多架构构建、扫描、签名）
  per-push 跑既慢又贵，而轻门禁在 GitHub 上跑等于把日常 push 的去处从 origin 改掉。
- **门禁写成 GitLab 专用脚本** — 改为直接调用本地锚点命令，本机与 CI 同一份逻辑，红了本地可复现。

## 后果

- 分支 push 到 origin 会跑三道门；`frontend-gate` 首次进入 CI，前端回归从此有机器把关。
- 发布节奏不变：打 tag 推 `github`。忘了推 GitLab 不会触发任何发布，忘了推 GitHub 不会跑任何发布。
- gitlab.com 共享 runner 的耗时与 compute minutes 消耗在决策时**未验证**，等首个流水线页面（日志条目记有此项）。
- 钉住行为的验证：`glab ci lint` 通过；`scripts/verify-quick.sh` 本地全绿说明两道新门首跑不会因存量问题红；
  `.gitlab-ci.yml` 顶层注释自述职责切分，改动它前先读本文件。
