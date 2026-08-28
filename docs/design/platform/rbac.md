# RBAC 权限模型设计

> 从根 `DESIGN.md` 拆出（2026-08-08），已按 control-tower ADR-0002 更新。
>
> **已落地**：control-tower gateway 的 BFF session/legacy JWT、Casbin RPC 级 RBAC、
> 入站 `x-md-global-*` 剥离与可信身份头注入；角色继承链为
> `admin ⊃ merchant ⊃ consumer ⊃ public`。
>
> **未落地**：统一的数据级 owner 过滤、商家子账号、服务工作负载身份与 OpenFGA。
> address 等存量越权风险说明「网关 RBAC 通过」不等于「对象归属正确」。
>
> Casdoor 是身份提供方，control-tower 是 session owner 和入口授权点；业务服务不解析
> 浏览器凭据，只消费可信身份头并执行领域/数据权限。

### 核心角色与权限定义

基于 B2B2C 业务模型，定义三个核心角色，明确每个角色的权限边界：

| 角色名称          | 角色描述         | 核心权限范围                                                    |
|---------------|--------------|-----------------------------------------------------------|
| 消费者（Consumer） | 平台普通用户，商品购买者 | 商品浏览、搜索、收藏；订单创建、支付、取消；售后申请、评价管理；个人信息、收货地址管理               |
| 商家（Merchant）  | 平台入驻商家，商品提供者 | 店铺信息管理；SPU/SKU 商品管理、上下架；订单发货、售后审核；运费模板、促销活动配置；财务结算、经营数据查看 |
| 平台管理员（Admin）  | 平台运营管理者      | 商家入驻审核、资质管理；平台类目、品牌管理；订单争议仲裁；平台佣金配置、财务对账；平台运营数据统计、系统配置管理  |

### 权限模型设计

权限分成三层，不能互相替代：

1. **入口身份**：Casdoor 完成 OAuth2/OIDC；control-tower 用机密客户端交换 token，并把 Web/Tauri 会话保存在 Dragonfly。迁移期 legacy bearer JWT 仍由 gateway 验签。
2. **RPC 级 RBAC**：Casbin 以「角色 × Connect procedure」匹配 allow/deny，策略由 Config Center Watch，默认拒绝。审批、退款、发货等动作必须按 procedure 授权，不能整段服务放行。
3. **数据/对象权限**：Repository 或领域层必须按可信 `user_id`/`merchant_id` 加 owner 条件。商家只能操作本店商品、订单和售后；消费者只能操作本人订单与地址。该层尚未统一落地，OpenFGA 是演进方向，不得在落地前当成现有能力。

### 权限校验流程

```text
Client session/JWT
→ gateway 验证凭据并取得 roles
→ Casbin 校验 Connect procedure
→ 剥离后重注入 x-md-global-user-id / merchant-id / roles
→ service/biz 校验领域动作
→ repository 带 owner 条件访问 PostgreSQL
```

任何一步失败都应 fail-closed。gateway 的 `permission denied` 不能掩盖 service/repository 缺少 owner 条件；后者会造成 IDOR。

### Casdoor 集成边界

- Casdoor 管理账号与基础角色，control-tower 管理业务 session；user 服务只保存业务 profile。
- Web 使用 httpOnly cookie，Tauri 使用 session header；前端不保存或解析 access/refresh token。
- 业务微服务不通过 Casdoor SDK 验证用户凭据。存量 auth 配置块与 SDK 引用属于迁移债，不是推荐模式。
- 第三方登录是否启用取决于 Casdoor 应用配置；未完成端到端验收前不宣称微信/支付宝登录可用。
