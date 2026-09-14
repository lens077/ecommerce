---
name: 2026-09-12-prod-release-baseline
layer: decisions
status: implemented
description: prod 独立覆盖层保留现网配置，前端原生双架构构建，发布与生产晋级分离
---

# 决策：生产基线与多架构发布分离

## 问题

2026-09-12 部署时，两个前端缺少 amd64 镜像，search 的旧发布版不支持现用配置；三个工作负载此前被缩到零。手工镜像恢复了业务，但线上没有独立的成对部署清单。Next.js 在本机 QEMU 构建时出现 SIGSEGV。

## 决策

- prod 使用独立 Helm values 与 kustomize overlay，不复制完整部署对象，也不更改 dev/pre 的既有镜像。
- prod 首次基线固定已发布镜像的 digest。保留现网 `pre` 运行模式和 selector Secret；部署环境名不等于 Config Center 的配置环境名。
- 前端在 amd64、arm64 runner 上分别原生构建，全部成功后合并 manifest index。不覆盖已有单架构应急标签。
- semver 发布构建完整后端集合（包含 search）和两个前端。CI 回写 dev；prod 仅通过显式晋级更新两份清单，不自动 apply。

## 考虑过的替代方案

- **把应急 amd64 标签写入公共 values**：会令 arm64 使用者无法拉起，且旧标签不能重新定义。
- **复制 pre 并直接把模式改成 prod**：现网并未证明存在 prod selector 和 Bootstrap；目录改名不应改变数据依赖。
- **继续 QEMU 构建 Next.js**：已发生 worker SIGSEGV，采用原生 runner 避免重试模拟器故障。
- **CI 发布后直接升级线上**：混淆制品发布与生产晋级，无法在切流前独立验收。

## 后果

prod 接管前仍需检查 Secret、运行时出站地址与 live diff；既有直连路由的删除属于安全策略变更，不能由清单生成隐式执行。多架构发布及实际生产晋级是否执行成功，以 CI 和集群证据为准，不以代码就绪代替。
