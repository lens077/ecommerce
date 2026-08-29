# 统一 Session 与关系授权模型设计

> 从根 `DESIGN.md` 拆出（2026-08-08），已按 control-tower ADR-0002 更新。
>
> **已落地**：control-tower gateway 的 BFF session/legacy JWT、Casbin RPC 级 RBAC、
> 入站 `x-md-global-*` 剥离与可信身份头注入；角色继承链为
> `admin ⊃ merchant ⊃ customer ⊃ public`。
>
> **未落地**：统一的数据级 owner 过滤、商家子账号、服务工作负载身份与 OpenFGA；这些仍是迁移缺口。
> address 等存量越权风险说明「网关 RBAC 通过」不等于「对象归属正确」。
>
> Casdoor 是身份提供方，control-tower 是 session owner 和入口授权点；业务服务不解析
> 浏览器凭据，只消费可信身份头并执行领域/数据权限。

**后续决策覆盖（2026-08-28）**：存量 legacy JWT + Casbin procedure RBAC 仍在迁移中，但目标已被 [TECH.md](../../TECH.md) §8 覆盖：完全废弃 JWT；Casdoor 有状态 Session 管认证及 admin/merchant/customer 粗粒度角色，OpenFGA 以 merchant/store/order 关系模型承担对象级授权。

### 核心角色与权限定义

基于 B2B2C 业务模型，定义三个核心角色，明确每个角色的权限边界：

| 角色名称          | 角色描述         | 核心权限范围                                                    |
|---------------|--------------|-----------------------------------------------------------|
| 消费者（Customer） | 平台普通用户，商品购买者 | 商品浏览、搜索、收藏；订单创建、支付、取消；售后申请、评价管理；个人信息、收货地址管理               |
| 商家（Merchant）  | 平台入驻商家，商品提供者 | 店铺信息管理；SPU/SKU 商品管理、上下架；订单发货、售后审核；运费模板、促销活动配置；财务结算、经营数据查看 |
| 平台管理员（Admin）  | 平台运营管理者      | 商家入驻审核、资质管理；平台类目、品牌管理；订单争议仲裁；平台佣金配置、财务对账；平台运营数据统计、系统配置管理  |

### 权限模型设计

权限分成三层，不能互相替代：

1. **入口身份**：Casdoor 完成 OAuth2/OIDC 与有状态 Session；Web/Tauri 会话存入独立 Dragonfly Session 实例（`noeviction` + 持久化），登出删除 Session 即刻撤权。存量 legacy bearer JWT 仅描述迁移现状，目标不保留兼容路径。
2. **粗粒度角色**：admin/merchant/customer 由 Casdoor 管理，control-tower 默认拒绝未授权入口。存量 Casbin procedure 策略在迁移期继续运行，但不再是目标授权真相源。
3. **对象关系授权**：control-tower 调 OpenFGA `Check` 判断 merchant 的 admin/staff、store 的 manager/member，以及 order 的 customer/父 store 关系；业务服务仍执行状态机与领域不变量，Repository 继续附带 tenant/owner 条件作为数据隔离防线。OpenFGA 尚未落地的部分不得写成现有能力。

### 权限校验流程

```text
Client Session（迁移期可能仍有 legacy JWT）
→ gateway 通过 Casdoor/Dragonfly 验证 Session 并取得粗粒度角色
→ OpenFGA Check 校验 merchant/store/order 对象关系
→ 剥离后重注入 x-md-global-user-id / merchant-id / roles
→ service/biz 校验领域动作
→ repository 带 owner 条件访问 PostgreSQL
```

任何一步失败都应 fail-closed。gateway 的 `permission denied` 不能掩盖 service/repository 缺少 owner 条件；后者会造成 IDOR。

### Casdoor 与 OpenFGA 集成边界

- Casdoor 管理账号、admin/merchant/customer 基础角色与 Session，control-tower 执行 Session 校验并调用 OpenFGA；目标 Identity Service 保存 UserProfile、Merchant、Store、MerchantMember 等业务身份与组织关系。
- Web 使用 httpOnly cookie，Tauri 使用 session header；前端不保存或解析 access/refresh token。
- 业务微服务不通过 Casdoor SDK 验证用户凭据。存量 auth 配置块与 SDK 引用属于迁移债，不是推荐模式。
- 第三方登录是否启用取决于 Casdoor 应用配置；未完成端到端验收前不宣称微信/支付宝登录可用。
