---
name: portable-harness
layer: harness-framework
description: 可跨项目复用的 harness 能力清单与新项目采纳步骤；lens077 根目录 symlink 登记处（正文在仓内受门禁，根外只放相对链接——08-18 判例）
---

# Portable Harness —— 跨项目共用能力

lens077 工作区的其他项目（mall / control-tower / …）可直接复用本仓沉淀的协作机制。
**分发模式**：正文永远住在本仓（可 diff、受 `verify-context.sh` 门禁、重装不丢），
工作区根 `/Users/sumery/lens077/` 只放**相对 symlink**——根外裸副本在 2026-08-14 机器
重装时整个丢失 4 天无人察觉，此后定型为 symlink 模式（见 evolution-log 2026-08-18 条）。

## 根目录 symlink 登记（新增/删除链接必须同步本表）

| lens077 根条目 | 指向（相对） | 用途 |
|---|---|---|
| `AGENTS.md` | `ecommerce/AGENTS.md` | 跨工具行为基线（2026-08-18 起） |
| `HARNESS.md` | `ecommerce/context/harness-framework/portable-harness.md` | 本文——共享能力入口 |
| `backpass-distill.sh` | `ecommerce/scripts/backpass-distill.sh` | Session 反传蒸馏器（见下） |

## 可复用能力清单

| 能力 | 载体 | 复用方式 |
|---|---|---|
| E3 执行策略（估计→最小执行→失败才扩张） | [e3-execution.md](e3-execution.md) + AGENTS.md 常驻节 | 新仓 AGENTS.md 抄常驻节，护栏 hook 是用户级已全局生效 |
| 纠错沉淀闭环（在线反传） | [self-refinement.md](self-refinement.md) | 方法论直接引用；experience 四段格式随之 |
| 知识分层判定 | [knowledge-layering.md](knowledge-layering.md) | 新仓建 `context/{team,harness-framework,project/<名>}` 同构三层 |
| 方向性审计 + Session 反传（离线反传） | [flywheel-audit.md](flywheel-audit.md) | 审计清单六项照用；审计记录表各仓自建 |
| **Session 反传蒸馏器** | `scripts/backpass-distill.sh` | **天然跨仓**：`backpass-distill.sh <仓路径> [天数]`，覆盖 Claude Code / Codex / DSH 三存储，剔 skill 注入噪音 |
| 结构门禁 + 元评测模式 | `scripts/verify-context.sh` + `scripts/verify-context-canary.sh` | 模板级复制后按新仓路径改造；**canary 的「注错断言会红」模式必须一起搬**——恒绿门禁三次事故的教训 |
| 基线棘轮（存量冻结只拦新增 + 反向棘轮） | `scripts/lint-baseline.sh` | 采集函数按新仓工具链重写，棘轮骨架照搬；采集器必须带失聪自检 |
| 子代理派发三约定 | [subagent-dispatch.md](subagent-dispatch.md) | 直接引用 |
| harness 演进日志（四要素） | [evolution-log.md](evolution-log.md) 的「写法」节 | 新仓自建日志文件，抄四要素模板；「没有事故就别改规则」 |
| 中文文档风格 | `tech-doc-style-chinese` skill（用户级） | 已全局；项目覆盖条款进各仓 AGENTS.md |

## 新项目采纳步骤（最小集，约半小时）

1. `ln -s <本仓相对路径>/AGENTS.md` 或按新仓差异手写（硬规则 1/5/6/7 + E3 节 + 锚点区必留）；
2. 建三层 `context/` + 各层 `INDEX.md`，抄 knowledge-layering 的判定流程；
3. 复制 verify-context.sh + canary，改路径常量，**先注错验证会红再接 CI**；
4. 建 evolution-log（四要素模板），第一条记「采纳 portable harness」的动机；
5. 满一个迭代后跑首轮 `backpass-distill.sh <新仓>` 做 Session 反传。

不搬的东西：`.service-matrix.yaml`/structcheck（业务拓扑强绑定）、TODO 预算数值（按各仓
体量自定）、impeccable/kaneo 等项目绑定接线。判据同 [cordis-evaluation.md](cordis-evaluation.md)：
收益不抵维护成本的不搬。
