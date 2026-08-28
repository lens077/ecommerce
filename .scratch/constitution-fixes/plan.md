# 宪法矛盾修复计划（ecommerce 侧）

Status: ready-for-agent
日期：2026-08-26　依据：mall 宪法 v1.0.0 的 25 项裁决表（`../mall/.specify/memory/constitution.md`）
基准（用户裁决）：**以 ecommerce 自家真相源为准**（STACK 定稿 + TECH-RADAR 拍板 + 运行实况），
宪法作矛盾定位清单；与宪法相悖的 4 处按实况写（OpenFGA 演进、Config Center 保留、
Consul 标注退役中、网关 = control-tower）。

## P0 · 文档收敛（2026-08-26 当日完成 ✅）

| # | 矛盾 | 处置 |
|---|---|---|
| 1 | 消息底座一题六文三答 | README/architecture/checkout/consistency/sales 全部收敛 NATS JetStream + outbox（STACK 定稿）；Kafka 仅存「已退役」表述 |
| 2 | 搜索引擎 | README 改 Meilisearch（ES 已退役） |
| 3 | 缓存 | README 改 Dragonfly 仅可丢缓存；inventory.md Redis 分布式锁节废止（正确性唯一锚点 = PG 行锁/CAS，checkout v2） |
| 4 | 注册发现 | README 标注 Consul 定稿退役中 → K8s Service DNS（迁移完成前运行仍需，不删） |
| 5 | Seata | consistency.md 标注集群残留待下线（→P1） |
| 6/7 | MinIO / 日志管道 | README 改 SeaweedFS 迁移中、Vector→VictoriaLogs 迁移中 |
| 8/9 | 授权引擎/认证位置 | rbac.md 裁决横幅：认证只在网关（08-19 已改造）、服务零 IdP SDK；Casbin 现行 + OpenFGA 拍板演进（雷达 §4），不长期双头 |
| 10 | 网关实现 | README 改 control-tower（go-kratos 二开与 Connect-go 两说俱废）；架构图网关篇标历史快照 |
| 11/12 | 并发正确性/会话 | performance.md **整篇删除**（墓碑在 docs/design/README.md）；Redis 锁/会话/sqlc 读写路由虚构能力随之清零 |
| 16 | 履约归属与事件表 | architecture.md：OrderPaid 不再触发履约，新增 OrderReadyForFulfillment 行；checkout 自注「需修订」闭环 |
| 17 | 拓扑口径 | architecture.md 四个虚构支撑服务撤规划；唯一事实表 = .service-matrix.yaml |
| 20 | 库存公式 | inventory.md 唯一化 `available = on_hand − reserved − locked` |
| 21 | 支付模型 | payment.md 作废横幅 → checkout v2 |
| 22 | 错误包装 | error-handling.md 文字改 %w 唯一（与示例/STACK 一致） |
| 23 | 调度 | sales.md 收敛 K8s CronJob（Forbid + SKIP LOCKED），Temporal 须 ADR |
| 24 | 配置来源 | 保留 Config Center（control-tower，运行实况）；README 链接改 control-tower |
| 25/四类 | 死链/性能目标 | config-center/design.md 三处引用清零；性能数字随 performance.md 删除，重立须绑压测 |

## P1 · 契约与安全债（代码/基础设施）

1. **[cart] cart.proto 金额 float64 → int64 分**：STACK 自认活违规；改 proto + sqlc/前端生成链 + 迁移。验收：buf breaking 走 reserved 流程、交易链路零 float。
2. **[cart] 条目契约迁回 cart_item_id**（2026-08-26 用户裁决）：并行数组属未记录翻转；checkout v2 的 BatchGetCartItems/按数量核销依赖此语义。含前端调用改造 + ADR 记录。
3. **[infra] 下线 seata-server 与 Kafka/Strimzi 集群残留**：设计已弃用组件不得部署（consistency.md/STACK）。kubectl/helm 卸载属不可逆动作，执行前需用户授权。
4. **[backend] 清理 5 服务 auth 配置块**：认证收网关后的存量；服务零 IdP SDK 收尾（rbac.md 裁决横幅）。
5. **[platform] 东西向服务身份**：mTLS 或服务 token + 被调方校验；替代「inventory.v1.* 整段放给 admin 角色」的临时通道（admin-roadmap 既知债）。

## P2 · 数据模型收敛

6. **[order/inventory] 跨 schema FK → ID+快照**：order.item REFERENCES products.skus 违铁律；库存表迁出 products schema。
7. **[全域] merchant_id BIGINT ↔ UUID 漂移收敛**：迁移方案先出 ADR（表/proto/搜索投影三处对齐）。
8. **[全域] 金额存量 DECIMAL(10,2) → NUMERIC/int64 分**：与 #1 联动排期。
9. **[product] listing google.type.Money 展示层豁免 ADR**：豁免或迁移，二选一成文。
10. **[platform] 性能目标重立**：绑定部署形态 + 压测脚本 + benchstat 统计后才允许写数字。

## kaneo 同步说明

- 目标：新 project（非「备忘录」）；每条 P1/P2 建 task，title 带 `[P1]`/`[P2]` 前缀，desc 引用本文件对应条目。
- P0 为已完成文档修复，不建 task（或建一条 done 归档卡）。
