# 交接：2026-11-18 状态与继续入口

> 本文只做索引，不复制状态：计划与进度看 [TODO.md](../../TODO.md)，设计目标看 [docs/design](../../docs/design/README.md)。
> 换机后按本文链接续读即可，不需要回读旧交接。

## 一、仓库状态

| 项 | 值 |
|---|---|
| 分支 / HEAD | `main`；最新提交用 `git log -1` 现查 |
| 远端同步 | GitLab `origin/main` 与 GitHub `github/main` 均与本地一致 |
| 最新发布 tag | `1.8.1` |
| 工作区 | 干净；`.trae-html-share-packages/`（Trae 分享包 zip）已加入 `.gitignore` |
| 分支合并 | `harness/generic-kit`（harness kit 0.3.4）已合入 `main`，分支保留在两个远端作历史 |

## 二、计划与进度

| 内容 | 真相源 |
|---|---|
| 进度与剩余任务（P0/P1/P2） | [TODO.md](../../TODO.md) |
| 架构设计与验收标准 | [docs/design/README.md](../../docs/design/README.md) |
| 技术选型与目标拓扑 | [docs/TECH.md](../TECH.md) |
| 服务拓扑、网关路由、外部依赖 | [.service-matrix.yaml](../../.service-matrix.yaml) |
| 工程规范与硬规则 | [context/INDEX.md](../../context/INDEX.md)、[AGENTS.md](../../AGENTS.md) |
| 发布手顺 | [docs/PRODUCTION-RELEASE.md](../PRODUCTION-RELEASE.md) |
| 操作入口 | [context/team/runbook.md](../../context/team/runbook.md) |

推进顺序（摘自 TODO）：交易缺陷止血 → 按 checkout v2 打通下单、预占、支付、取消/退款 → 商家、管理与履约；安全、备份恢复、告警与发布治理并行。

最近一周（11-13 → 11-18）完成的是前端工具链与 CI：Node 26 + Vite+ 1.6 + pnpm 12.21、i18next 27 / jsdom 31 适配、node5 `vp lint` SIGABRT 改裸 oxlint、knip 绕行、登录冒烟周 cron 改手动触发、Trae 托管部署通路入库（未实跑验收）。对应悬项见 TODO 的前端与「供应链与交付流水线」两节。

## 三、换机继续

```bash
git clone git@gitlab.com:sumery/ecommerce.git && cd ecommerce
scripts/verify-quick.sh                # 提交前默认入口
cd backend && go build ./... && go vet ./...
cd frontend && pnpm install && pnpm ready
```

其余按改动类型查 [runbook](../../context/team/runbook.md) 的必读路由。

## 四、红线

- 凭据不入仓；密码与密钥只存在 Config Center 和本地环境。
- 不可逆动作（prod 部署、force push、删 PV/namespace）先说明影响再执行；commit ≠ push，dev ≠ prod。
- Helm 与 kustomize 两份部署清单必须逐字段等价，改一边必改另一边。
