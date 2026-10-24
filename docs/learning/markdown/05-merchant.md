# 05 商家：有管理员权限，也可能批准了整张表

[学习入口](README.md) · 前置：[用户](03-user.md)、[平台](01-platform.md) · 关联：[商品](06-product.md)、[订单](10-order.md)

## 0. Git 证据：早期申请链与后期明确的企业店 MVP

[f3fe86d3 README](https://github.com/lens077/ecommerce/blob/f3fe86d3/README.md#L870-L878) 将商家/履约/结算和后台列为第二阶段，不能拿商家未完成单独否定首期六服务，也不能说它当时不存在设计。

最早精确接口在 [76b96ed2 merchant.proto](https://github.com/lens077/ecommerce/blob/76b96ed2/backend/api/merchant/v1/merchant.proto)（2026-05-30）：提交、审批/驳回、查询、激活，审批注释还要求发领域事件。同期[data](https://github.com/lens077/ecommerce/blob/76b96ed2/backend/services/merchant/internal/data/merchant.go)真实实现UUID申请写入和查询，Approve/Reject/Activate仍panic。首版是「提交/查询切片」，没有审核激活闭环。

| 演进内容 | 已读取历史 | 现在受限在哪里 |
|---|---|---|
| 审批首次改SQL | [87a2762a SQL](https://github.com/lens077/ecommerce/blob/87a2762a/backend/services/merchant/internal/data/queries/merchant.sql)，2026-06-03 | 当时UPDATE就没WHERE，至今仍在；不是后来抽象层过多才引入 |
| 两段式入驻定稿 | [37f0be34 onboarding](https://github.com/lens077/ecommerce/blob/37f0be34/docs/design/merchant/onboarding.md)，08-14（文内日期08-13） | 明确原文「MVP一个商家一个店铺」「MVP先做企业店」，用户→商家无人工审核、开店需审核；当前混合模型没兑现 |
| handler角色防线 | [1c8d87d0 service](https://github.com/lens077/ecommerce/blob/1c8d87d0/backend/services/merchant/internal/service/merchant_service.go)，09-11 | RequireRole(admin)已存在，但授权不能修复SQL目标范围 |
| 诚实报告未实现 | [5df835ba service](https://github.com/lens077/ecommerce/blob/5df835ba/backend/services/merchant/internal/service/merchant_service.go)，09-23 | Create/Reject/Activate由断连panic改Unimplemented，是失败体验改善，不是功能完成 |

**早期申请→审核→激活范围：不满足；后期作者明确的一商家一企业店MVP：也不满足。** 创建/协议/归属/审核状态仍缺，不能称「核心已跑通，只缺生产优化」。**生产判定：不满足**，全表更新是直接阻断。应先修M1，再沿既定两段式模型演进，不能继续堆运营功能。

## 1. 商家域从什么业务开始

最小模型：一个主体提交经营申请，平台读取申请，作出批准或拒绝决定，形成可识别的经营主体。

- **多租户（Multi-tenancy）**：同一系统服务多个商家，各商家的数据和操作相互隔离。
- **Tenant / merchant_id**：隔离与经营归属的标识，不等于登录 user_id。
- **状态机**：申请只能按允许顺序迁移，例如待审到批准；不是随便 UPDATE 一段字符串。
- **CAS（Compare-and-Swap）**：带旧状态/版本条件地更新，并检查影响行数，防止并发覆盖。
- **审计（Audit）**：留下谁、何时、对哪条申请、从何状态作出何决定的记录；不是把全部身份证信息写到普通日志。

[入驻设计](../design/merchant/onboarding.md) 与 [路线](../design/merchant/roadmap.md) 描述「成为商家 → 申请开店」两段式。现行接口还没有完整兑现这个模型，不能将用户、商家、店铺三种身份混为一张表。

## 2. 当前实现与已补上的保护

[merchant.proto](../../backend/api/merchant/v1/merchant.proto) 提供七个 RPC：协议、创建商家、提交/批准/驳回/查询申请、激活。

阅读顺序：[service](../../backend/services/merchant/internal/service/merchant_service.go) → [data](../../backend/services/merchant/internal/data/merchant.go) → [SQL](../../backend/services/merchant/internal/data/queries/merchant.sql) → [迁移](../../backend/services/merchant/internal/data/migrations/00001_merchant.sql)。

已具备：

- UUIDv7 申请 ID，不靠客户端给自己指定任意主键。
- 状态映射、sqlc 查询、领域错误到 Connect code 的转换。
- Approve/Reject/Activate 的 handler 内已有 requireAdmin，不只依靠网关粗粒度策略。
- Create/Reject/Activate 的可达 handler 已显式 Unimplemented，不再直接 panic 让 HTTP 断连。
- [service 测试](../../backend/services/merchant/internal/service/merchant_service_test.go) 验证部分错误码与普通用户/访客在业务调用前被拒绝。

这都是有效进展。问题在于：**能进门的人对哪一条记录做事，还没有守住。**

## 3. 当前最危险的断点

### M1 ApproveApplication 全表 UPDATE

SQL 的 UPDATE 设置 status、audit_comment、reviewed_at、updated_at，却没有 WHERE。data 层也没有把 ApplicationId 传到这条查询。

一个合法管理员批准申请 A，数据库可能把所有申请都改成批准。管理员鉴权再强，也不能补救目标范围缺失。

修法必须同时约束：

1. 目标申请 ID。
2. 允许审核的旧状态，例如 pending。
3. 当前操作者与动作权限。
4. 更新影响行数必须恰好符合预期。
5. 审核结果与审计记录同事务提交。

注意 `:exec` 的「SQL 没报错」不等于「目标被正确修改」。应选能返回行数或更新结果的生成查询，再做业务判断。

**教师反问**：如果 WHERE 加上 ID 但不加旧状态，两个管理员一批一驳会怎样？后提交者可能覆盖前一个决定。权限、目标范围、状态守卫是三道不同的防线。

### M2 申请没有完整的对象归属

现申请表缺少稳定的 owner_user_id/merchant_id 归属，Submit/Get handler 不传主体。仅根据 application_id 查申请，不能完成跨商家隔离。

应先根据两段式设计决定申请属于「尚未建商家的用户」还是「已建商家的开店申请」，再建立正确的主体关系。不能为了加 WHERE 临时用 company_name 或 contact_phone 充当 owner。

历史数据如何回填也是迁移的一部分；无法证明归属的旧行不能随便归给当前提交者。

### M3 协议接口仍会返回零值成功

GetMerchantAgreement 的 repo 当前不查协议表，直接成功返回空版本、空 URL、零时间。不是只有表为空才出错，而是现实现根本没有读表。

**协议版本**是用户同意了什么内容的证据，不是一个随意展示字符串。未能取得有效协议应返回明确错误，不能让 UI 用空协议完成申请。

Create/Reject/Activate 当前显式未实现，是诚实状态；不要把内部尚不可达的 panic 与现行 handler 的行为混写。后续接通这些路径时再逐个移除桩并验证状态转换。

### M4 ID、状态、时间的含义尚未统一

本域 merchant_id 使用较宽松字符串，而 product 将 merchant_id 作为 UUID。Submit 的状态与 Get 的状态表示也不一致；提交申请时填入 reviewed_at，会把「还没审核」误表示为「已经审核过」。

修复应定义稳定 merchant ID 及兼容迁移；审核时间只有审核发生才有值。不要用当前时间填一切可空字段，让下游无法区分未知与真实发生。

## 4. 商家与商品、订单、前端怎样对接

| 对接 | 契约 | 不允许的捷径 |
|---|---|---|
| 用户 → merchant | 一个登录用户如何成为/管理商家；代理角色、组织归属 | userId直接充当merchantId，角色merchant就能访问全部商家 |
| merchant → product | 稳定merchantId、经营状态、店铺关系 | 商品请求自己声称merchantId就算授权 |
| merchant → order | 订单商家快照及接受订单资格 | 历史订单随商家改名而变化；从前端拿结算主体 |
| admin前端 → 审核 | 明确申请ID、审核动作、预期旧状态/版本、意见 | 只显示列表成功而不验证实际只改了一行 |
| 协议 → 申请 | agreement version、生效时间、同意证据 | 空协议成功返回，或服务升级后无法追溯当时内容 |

matrix 里 merchant 当前无跨服务 RPC。表中是对接目标与验收责任，不是已接线证明。

## 5. 高内聚、低耦合与性能

申请审核、经营主体、店铺状态可以在同一服务内分模块，由清晰用例组织。不要把支付结算和库存逻辑塞入 merchant，也不要为每张表拆一个微服务。

性能先处理按归属/状态过滤的列表、稳定分页、查询索引；图片和证照存对象存储，SQL 保存经过验证的引用。身份证和营业执照属于敏感资料，需要明确访问范围、日志裁剪与保留策略，不能为了后台搜索方便全量打印。

扩容前把审核并发放在数据库状态条件和事务里；单进程锁无法跨副本保护。

## 6. 分阶段练习

| 练习 | 操作范围 | 验收 |
|---|---|---|
| M-A 审批不误伤 | ApplicationId贯通、WHERE旧状态、影响行数、审计 | 创建A/B两条，仅A变化；重复/并发审核有确定结果；普通用户不触发SQL |
| M-B 主体模型 | 按设计完善用户→商家→申请关系与ID/时间 | A商家不能查询/修改B；未审核时间为空；跨服务ID不靠强制转换 |
| M-C 正式流程 | 协议、创建、驳回、激活逐个实现 | 旧协议拒绝；重复创建不重复主体；非法状态跳转无副作用；前端显示准确失败 |

先修 M-A，因为它是当前可达路径的批量破坏风险。复杂状态机或 OpenFGA 接入不能成为继续保留无 WHERE 更新的理由。
