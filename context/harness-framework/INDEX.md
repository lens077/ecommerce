# context/harness-framework/ — 框架工程级

**范围**：AI 协作机制**本身**的规则。不是业务约束，是「知识怎么组织、错误怎么沉淀」的元规则。

| 文件 | 约束什么 |
|---|---|
| [knowledge-layering.md](knowledge-layering.md) | 一条知识该写进哪一层的判定规则 |
| [self-refinement.md](self-refinement.md) | 纠错 → 判断模式性 → 沉淀 → 下次复用的闭环 |
| [graph-engineering.md](graph-engineering.md) | 多闭环 AI 工作流方法论存档（2026-08-08 从仓库根移入）：锚点命令、冻结节点、Loop 0~4 分工 |
| [delivery-efficiency.md](delivery-efficiency.md) | AI Coding 交付效率治理：可信状态、P50/P85 与长尾、日报证据和人机责任边界 |
| [e3-execution.md](e3-execution.md) | E3 执行策略（先估计→最小执行→失败才扩张）：出处、按规模路由、过度阅读护栏 hook 的配置与再验证 |
| [evolution-log.md](evolution-log.md) | harness 本身每次改动的原因与**触发它的具体事故**——改硬规则/门禁前后都要看一眼，防止把改对的东西改回去 |

## 这一层为什么存在

没有这一层，`context/` 会在几十条知识之后开始腐化：同一条约束出现在两个地方且逐渐分叉、
新知识不知道往哪放、一次性的调试细节和长期约束混在一起。

这一层的作用是让知识库**可以长期演进**，而不只是一次性堆出来的文档。

## 现阶段的裁剪说明

QQ音乐原方案在这一层还有「五阶段 + 四门禁」的完整流程定义（需求评审 / 设计评审 / Dev 进入 / 服务仓库检查）。

**本项目是单仓 + 单人，暂不引入这套流程门禁**：

- 三仓联动 ❌ 不需要 —— 本仓的 proto 契约（`backend/api/`）和业务代码在同一个 repo，不存在分支漂移
- 需求评审 / 设计评审门禁 ❌ 不引入 —— 单人项目自己评自己没有意义
- 契约门禁 ✅ **值得引入** —— `buf breaking` 拦 proto 破坏性变更，见 `context/team/proto-design.md`
- 配置门禁 ✅ **值得引入** —— 校验 Consul KV 必需键存在（当前缺，已知踩过坑）

团队规模变化时再回来重新评估。
