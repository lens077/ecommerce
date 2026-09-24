Type: plan
Status: resolved

# Frontend Pre/Prod Deployment Split

## Overview
拆分 consumer frontend 的部署目录，使 pre 使用 Argo Rollouts Blue-Green，prod 继续使用 Deployment；同时评估并保留 Kustomize 的环境镜像替换能力。

## Architecture Decisions
- `base/` 只放 pre/prod 共享的 ConfigMap、active Service 和 HTTPRoute。
- `pre/` 管理 Rollout 与 preview Service；关闭 frontend VPA，直到验证 VPA 对 Rollout 的支持。
- `overlays/prod/` 管理生产 Deployment，并继续用 Kustomize `images` 钉 immutable tag/digest。
- Helm values 与 Kustomize overlay 保持同一环境语义，`scripts/verify-deploy-parity.sh` 是验收门槛。
- 不创建 Gateway API traffic plugin；第一阶段只做 Blue-Green，生产 active Service 名称保持不变。

## Task List

| Task | Status |
|---|---|
| 拆分 consumer frontend base/pre/prod kustomization | 已完成 |
| 对齐 Helm frontend pre/prod Rollout、Deployment、preview Service 与 VPA 条件 | 已完成 |
| 验证 Kustomize 镜像替换、Helm lint、pre/prod parity 和 KYAML | 已完成 |
| 生成 ArgoCD diff/手动同步前检查清单，不启用自动同步或 promote | 已完成 |

## Checkpoint: Directory Split

| Check | Status |
|---|---|
| pre renders Rollout + preview Service | 已完成 |
| prod renders Deployment without preview Service | 已完成 |
| Kustomize prod `images` replacement remains active | 已完成 |
| Helm and Kustomize parity passes for pre and prod | 已完成 |
| ArgoCD pre diff and manual sync | 待 ApplicationSet/Application 创建后执行 |
| Rollout promote | 待 pre 手动同步和冒烟通过后执行 |

## Risks
- prod overlay 复用 pre 会把 Rollout 泄漏到 prod；拆分后用 parity 阻断。
- VPA 对 Rollout target 的支持需实测；迁移阶段 pre 暂停 frontend VPA。
- active Service selector 由 Rollouts 动态维护；ArgoCD 只忽略 `rollouts-pod-template-hash`。
