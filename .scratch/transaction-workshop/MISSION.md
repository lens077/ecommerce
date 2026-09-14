# Mission: 独立实现并排查电商交易问题

## Why

以本仓库存与后端购物车为练习对象，获得独立设计、实现和排查交易逻辑的能力，而不只会接受 AI 给出的方案。用户已确认以「独立实现并排查问题」为教学目标。

## Success looks like

- 能解释事务、幂等、资源归属检查各自防止哪一种错误。
- 能沿 service → biz ← data 追踪数量和身份，并指出事务外写入或参数漏传。
- 能设计失败路径，在真实 PostgreSQL 中证明整组回滚、零行更新处理和重复请求行为。
- 能区分教学示意、现行代码与尚未实现的 checkout v2 设计。

## Constraints

- 短课、小练习、即时反馈；先库存，再后端购物车。
- 暂按能读 Go／SQL 安排起点，实际熟练程度尚未获得证据，随回答调整。
- 前端原子同步由 agent 直接实现；后端本轮只教学，不改代码或数据库。
- 保留现有工作树改动；不提交、不部署、不派子代理。
- 课程是教学投影，不替代 context/、docs/design/ 或 TODO.md。

## Out of scope

- 本轮不实现支付、Saga、消息搬运或完整生产库存系统。
- 不切换技术栈，不新建通用 provider 框架，不连接生产库练习。

从 [库存预占课](lessons/0001-inventory-atomicity.html) 开始，再学 [购物车数量命令](lessons/0002-cart-quantity-command.html)。
