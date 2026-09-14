# 电商交易实现 Resources

## Knowledge

- [PostgreSQL 18: Explicit Locking](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS)
  已读取官方文档。用于理解 FOR UPDATE 的保护范围、事务结束释放行锁，以及统一锁序如何降低死锁风险。
- [sqlc: Using transactions](https://docs.sqlc.dev/en/v1.31.1/howto/transactions.html)
  已读取官方文档。用于把 Queries 绑定到 tx；特别注意传递 context 不会自动把连接池查询变成事务内查询。版本号是本次读取的文档版本，不代表仓库工具版本。
- [PostgreSQL 18: Data-Modifying Statements in WITH](https://www.postgresql.org/docs/18/queries-with.html#QUERIES-WITH-MODIFYING)
  已读取官方文档。用于辨认「同一语句直接读目标表」与「读 RETURNING」的可见性差异，不能把 CTE 当成按书写顺序执行的步骤。
- [React: useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
  已读取官方文档及其 Markdown 源。用于理解稳定、不可变的外部 store 快照；它不是数据库事务，也不自动提供多标签页一致性。
- [本仓 checkout v2](../../docs/design/order/checkout.md)
  本项目设计真相源。课程依照 §3.2、§6 的 ReserveGroup、reservation_id、payload_hash 和库存不变量；这些目标不等于已实现。
- [本仓购物车契约决策](../../docs/design/cart/api-decisions.md)
  读取文首已确认的 cart_item_id 迁移决策；历史正文不能覆盖现行 proto。
- [本仓 Go 测试判定](../../context/team/go-testing.md)
  用于选择验证方式：biz 分支可用 fake，数据库语义必须用隔离的真实 PostgreSQL。具体测试基建入口看 [docs/TESTING.md](../../docs/TESTING.md)。

## Wisdom (Communities)

暂未选择外部社群，也未询问加入意愿。先把练习答案带回本会话做代码推演；如需要外部评审，再筛选 PostgreSQL／Go 官方社区。分享问题时不得上传凭据或真实客户数据。

## Gaps

- Go、SQL、并发与事务的实际熟练程度尚未确认。
- 本轮没有运行后端数据库实验；浏览器模拟器仅展示状态模型。
- 后续需练习同 key 重放、释放墓碑、死锁重试预算及提交结果未知的恢复；不要把第一课当作完整库存方案。
- 通用搜索服务额度不足，未更换付费服务；知识来源改为直接读取官方文档。
