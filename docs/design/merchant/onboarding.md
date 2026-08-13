# 商家入驻流程设计：两段式（成为商家 / 开设店铺）

> 2026-08-13 定稿。取代「入驻申请即资质审核」的旧设计（见现状一节）。
> 相关文档：[roadmap.md](roadmap.md)（P0 取舍）、[store-settings.md](store-settings.md) §1（开店绑定 IAM 账号）、
> [personal-store-compliance.md](personal-store-compliance.md)（个人店法律依据）、
> [《商家入驻协议》](../../MERCHANT_AGREEMENT.md)（v1.0）。
> **状态：设计已定稿；`merchant.proto` 重排与服务实现尚未动工。**

## 一、设计决策

入驻拆成两个阶段，审核压力后移到店铺：

| 阶段 | 门槛 | 审核 | 产出 |
|---|---|---|---|
| ① 成为商家 | 登录账号 + 联系方式 + 确认入驻协议 | 无需人工审核，创建即生效 | merchant（身份实体） |
| ② 开设店铺 | 提交店铺信息 + 经营资质 | 平台审核（通过/驳回） | store（经营单元） |

对齐平台型电商通行做法（淘宝、拼多多：账号先成为卖家，开店才交证照），区别于
Shopline/Shopify 独立站的「注册即开店」。约束：**一个平台账号仅可创建一个商家身份；
MVP 一个商家一个店铺**（表结构 1:1，为多店留余地）。

## 二、成为商家（CreateMerchant）

### 请求字段

| 字段 | 类型 | 校验 | 说明 |
|---|---|---|---|
| `contact_phone` | string | 必填 | 联系手机号 |
| `contact_email` | string | 必填 | 联系邮箱；备选方案：从 Casdoor 账号继承、仅新采集手机号（待实现时定） |
| `agreement_version` | string | 必填，须等于当前生效版本 | 已同意的《商家入驻协议》版本号 |

### 服务端语义（不进请求体的部分）

- `user_id`：从网关透传的认证上下文取，**不放请求体**——防止替他人创建商家。
- `agreement_accepted_at`：落库时取服务器时间，不从客户端收。
- `phone_verified` / `email_verified`：联系方式带「已验证」标志；验证流程（OTP/验证邮件）可后置，但表结构与 proto 预留。
- **已登录设备不设字段**：设备属于 session/风控层（对应 store-settings §16 操作日志的「操作设备 IP+OS」），实现时由服务端从 session 取，客户端填报的 device_id 可伪造。
- 幂等约束：`owner_user_id` 唯一，一账号一商家。

### 入驻协议相关设计

- 协议文本：[docs/MERCHANT_AGREEMENT.md](../../MERCHANT_AGREEMENT.md)，当前 v1.0（生效 2026-08-13）；两段式入驻已写入协议第一、二、三条，版本与重签机制在第八条。
- 当前生效版本常量：`services/merchant/constants/constant.go` 的 `MerchantAgreementVersion`，升版时与协议文首同步修改。
- DB 采用覆盖式两列（非台账）：`agreement_version varchar(16) NOT NULL` + `agreement_accepted_at timestamptz NOT NULL`。历史签署记录不保留，取舍由协议第八条第 3 款兜住（历史版本以仓库提交记录为准）；将来需要再建 append-only 的 `merchant_agreement_acceptance` 表，不影响现有两列。
- 推荐配套只读 RPC `GetMerchantAgreement`（返回 version / effective_date / content_url，无需登录），前端展示协议后原样回传 version，避免前后端各硬编码一份版本号。
- 明确不做：`bool agreed`（version 非空即同意，避免矛盾组合）、签署 IP/UA/设备（网关审计层）、升版重签接口（机制已留好：商家详情返回的 `agreement_version` 低于常量 → 前端弹重签；接口后置到真正升版时）。

## 三、开设店铺（原「入驻申请」改造）

现 `SubmitApplicationRequest` 的全部资质字段整体挪为**开店申请**，`ApplicationStatus`
状态机跟随——审核对象从商家变成店铺。

### 店铺类型与资质

`store_type` 二选一（法律依据见 [personal-store-compliance.md](personal-store-compliance.md)）：

| | ENTERPRISE 企业店 | PERSONAL 个人店 |
|---|---|---|
| 资质字段 | 公司名称、统一社会信用代码、法人姓名、法人身份证号、营业执照影像、法人身份证两面影像 | 真实姓名、身份证号、身份证人像面/国徽面影像 |
| 额外字段 | — | `exemption_type` 四选一（自产农副产品/家庭手工业/便民劳务/零星小额），用于生成 37 号令 §12 的自我声明公示文案 |
| 类目限制 | 经营范围内 | 需行政许可的类目禁选（类目表加 `requires_license` 标记） |
| 前台展示 | 公示营业执照信息 | 显著标记「未办理市场主体登记」+ 自我声明 |

MVP 先做企业店，个人店字段与枚举位同批进 proto、实现可分批。

### 状态机归属

- merchant：创建即生效，状态仅 `active` / `frozen` 等管理态，不再有审核态。
- 开店申请：`PENDING_REVIEW` / `APPROVED` / `REJECTED`。
- store：审核通过后创建；`ACTIVATED` 对应店铺完成开业设置（原 `ActivateMerchant` 的 shop_name / shop_logo_url 归位到这一步）。

## 四、数据模型

现 `merchants_merchant` 混合表（资质 + 店铺 + 身份三个关注点）拆为：

- **merchant**：身份 + 联系方式 + 协议两列（`owner_user_id` 唯一）。
- **store_application**：开店申请 + 资质快照 + 审核状态（补上现在缺失的归属字段，见下）。
- **store**：店铺资料（名称、Logo、营业状态等，对接 roadmap P0 第 2 条「店铺资料」）。

merchant : store = 1:1 约束（唯一索引），不做多店。

## 五、现状与已知缺陷（改造时一并修）

写作当日 `merchant.proto` / 服务实现的问题：

1. `CreateMerchantRequest` 为空壳，`RejectApplication` / `ActivateMerchant` 是 panic 桩，`ApproveApplication` 全表 UPDATE（roadmap P0 第 1 条）。
2. `merchant_application` 表**没有 owner_user_id**——申请与用户账号断开，审批通过后创建 merchant 时 `OwnerUserID` 无从而来。两段式下开店申请挂在 merchant 下，天然修复。
3. `SubmitApplicationResponse.status` 用字符串 in 列表、`GetApplicationResponse.status` 用枚举，口径不一，重排时统一为枚举。

本设计落地即覆盖并改写 roadmap P0 第 1 条「修入驻闭环三个已知缺陷」的范围；
实施进度以 `TODO.md` 为准。
