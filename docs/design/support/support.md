# 客服服务（support）设计：客户来信与工单

> 2026-09-09 设计草案。与 [../notification/notification.md](../notification/notification.md)（系统发信）
> 成对：support 管「收进来的」和「谁在处理」，发出去一律经 notification。
>
> **现状事实（2026-09-09）**：`backend/services/` 下没有 support 服务；Casdoor 没有客服角色；admin 前端
> 只有路由骨架；OpenFGA 集群就绪但业务未接线；user 服务没有「按邮箱查用户」的 RPC。
>
> 术语见 [../../GLOSSARY.md](../../GLOSSARY.md)。字段约束表是写 proto 的输入。

## 一、定位与边界

support 是有状态的工作流服务：**一封来信或一次站内求助变成一张工单，工单有归属、有状态、有往来记录**。

| 职责 | 属于 support | 不属于 support |
|---|---|---|
| Resend 收件 webhook → 解析 → 落工单 | ✅ | — |
| 用户在站内发起工单、查看回复 | ✅ | — |
| 客服分配、状态流转、内部备注 | ✅ | — |
| 客服回复（决定渠道，调 notification 发出） | ✅ 决定 | notification 投递 |
| 邮件渲染、投递、退信 | — | notification |
| 退款、改单等业务动作 | — | 各域服务（客服在 admin 里跳转到对应页面操作，support 只记录关联） |
| 商家侧售后（商家与买家之间） | — | 本期不做；商家客服是 merchant roadmap 的事 |

第一期只服务**平台客服 ↔ 消费者**这一条线。

**与 admin-service 的关系**：同 notification，第一期 admin app 直接调 `support.v1`，网关按角色约束。

## 二、领域模型

### 2.1 概念

- **Ticket（工单）**：一次客户诉求的容器。有 requester（谁提的）、assignee（谁在处理）、status、origin（从哪进来）。
- **TicketMessage（往来）**：工单里的一条消息，`direction = INBOUND`（客户→平台）或 `OUTBOUND`（平台→客户），或 `NOTE`（客服内部备注，客户不可见）。
- **TicketEvent（事件）**：状态变更、分配变更的审计流水，只追加。
- **Requester（提单人）**：注册用户（`user_id`）或裸邮箱（`email`）。来信者不一定是用户。

### 2.2 表与字段约束

schema：`support`。DDL 落地后用 `<!-- embed -->` 投影。

**tickets**

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | PK | |
| number | bigint | 序列，唯一 | 人类可读编号，用于邮件主题 `[#1234]` |
| subject | varchar(256) | `min_len 1, max_len 256` | |
| status | enum | `defined_only, not_in [0]` | 见 §五 |
| priority | enum | `defined_only` | `NORMAL` / `HIGH`；默认 NORMAL |
| origin | enum | `defined_only, not_in [0]` | `EMAIL` / `IN_APP` |
| requester_user_id | uuid | 可空；与 requester_email 至少一个 | |
| requester_email | varchar(254) | `email, max_len 254` | 来信邮箱；用户提单时从 profile 快照 |
| assignee_user_id | uuid | 可空 | 客服 user_id |
| related_ref | varchar(128) | `max_len 128` | 关联业务对象，如 `order:<id>`；只记录不校验存在性 |
| last_inbound_at | timestamptz | | 排序：最久未回复优先 |
| last_outbound_at | timestamptz | | |
| closed_at | timestamptz | 可空 | |
| created_at / updated_at | timestamptz | | |

索引：`(status, last_inbound_at)`、`(assignee_user_id, status)`、`(requester_user_id, created_at DESC)`、`(requester_email)`。

**ticket_messages**

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | PK | |
| ticket_id | uuid | FK | |
| direction | enum | `defined_only, not_in [0]` | `INBOUND` / `OUTBOUND` / `NOTE` |
| author_user_id | uuid | 可空 | OUTBOUND/NOTE 为客服；INBOUND 站内为用户；来信为空 |
| body_text | text | `min_len 1, max_len 65536` | 纯文本正文；HTML 来信取 text 部分，缺失则从 HTML 剥离〔剥离规则待定〕 |
| provider_email_id | varchar(128) | `max_len 128`；非空时唯一 | INBOUND：Resend 收件 `email_id`（重拉正文/附件的键）；OUTBOUND：空 |
| rfc_message_id | varchar(998) | `max_len 998`；非空时唯一 | 邮件 `Message-ID` 头，**只有 INBOUND 填**（来自 `email.received` 的 `message_id`）；OUTBOUND 的在 notification 侧，见 §4.3 |
| in_reply_to | varchar(998) | `max_len 998` | 邮件 `In-Reply-To` 头 |
| notification_message_id | uuid | 可空 | OUTBOUND 对应 notification 的 message_id |
| notification_delivery_id | uuid | 可空 | OUTBOUND 的 EMAIL 投递 id，查投递状态用 |
| created_at | timestamptz | | |

**ticket_attachments**

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | PK | |
| ticket_message_id | uuid | FK | |
| filename | varchar(256) | `max_len 256` | |
| content_type | varchar(128) | `max_len 128` | |
| size_bytes | bigint | `gte 0, lte 10485760` | 单文件上限 10 MiB〔待定〕 |
| provider_attachment_id | varchar(128) | `max_len 128` | Resend 附件 id，与消息的 `provider_email_id` 一起可重拉 |
| object_key | varchar(512) | `max_len 512`；可空 | MinIO 对象键；来信附件从 Resend 拉取后转存〔MinIO bucket 与保留期待定〕。为空表示尚未转存，按需从 Resend 拉 |

每条消息附件数 `max_items 10`〔待定〕。

**ticket_events**

| 字段 | 类型 | 约束 |
|---|---|---|
| id | uuid | PK |
| ticket_id | uuid | FK |
| kind | enum | `STATUS_CHANGED` / `ASSIGNED` / `UNASSIGNED` / `PRIORITY_CHANGED` / `REOPENED` |
| actor_user_id | uuid | 可空（系统动作为空） |
| from_value / to_value | varchar(64) | `max_len 64` |
| created_at | timestamptz | |

**webhook_events**：`(svix_id varchar(128) PK, received_at)`，去重。

## 三、收件链路（邮件）

事实来源（核实日期 2026-09-09）：[Receiving](https://resend.com/docs/dashboard/receiving/introduction)、[email.received](https://resend.com/docs/webhooks/emails/received)、[Retrieve Received Email](https://resend.com/docs/api-reference/emails/retrieve-received-email)、[Retrieve Received Attachment](https://resend.com/docs/api-reference/emails/retrieve-received-email-attachment)、[Reply to Receiving Emails](https://resend.com/docs/dashboard/receiving/reply-to-emails)。

Resend 侧事实：

- 收件域名 MX 指向 Resend 后，每封来信触发 `email.received` webhook。**事件体只带元数据**：`email_id`、`message_id`（RFC Message-ID）、`from`（裸地址，无显示名）、`to`、`subject`、`attachments[]`（只有 id/filename/content_type/size）。**没有正文、没有头**——Resend 明确说这是为了让 serverless 端点不被大附件撑爆。
- `GET /emails/receiving/{email_id}`（Go SDK `Emails.Receiving.Get`）返回 `html`、`text`、`headers`（含 `in-reply-to` / `references` 等原始头）、`message_id`、`reply_to`、`attachments[]`、`raw.download_url`（签名 URL，有 `expires_at`，可下载含附件的原始 `.eml`）。`html_format=cid` 可保留内联图 `cid:` 引用而不是 base64 data URI。
- `GET /emails/receiving/{email_id}/attachments/{id}`（SDK `Emails.Receiving.GetAttachment`）逐个拉附件。
- Resend 在端点不可用时仍保存邮件；webhook 失败按指数退避重试 8 次（约 27 小时），持续失败会自动禁用端点。

```text
用户邮箱 ──► support@<收件域名>（MX 指向 Resend）
        ──► Resend 解析 ──► POST /support.v1.ResendInboundWebhook/Handle（网关匿名清单）
        ──► 验 Svix 签名 ──► webhook_events 去重 ──► 落 inbound_raw ──► 200
        ──► 后台任务：GET /emails/receiving/{email_id} 拉正文与头
        ──► 串线：找工单 ──► 追加 INBOUND 消息 / 新建工单
        ──► 附件按需 GET …/attachments/{id} → 转存 MinIO
        ──► 若工单已 RESOLVED → 重开为 OPEN；CLOSED → 新建
```

**串线规则（按顺序命中即止）**。输入是来信的 `headers.in-reply-to` 与 `headers.references` 里的全部 Message-ID：

1. 任一 Message-ID 命中 `ticket_messages.rfc_message_id`（客户以前发进来的邮件——客户端回信时 `References` 通常带着自己原信的 id）。
2. 任一 Message-ID 经 `notification.v1.NotificationInternalService.LookupDeliveryByRfcMessageId` 命中 `source_ref = ticket:<id>`（我方回复的邮件，其 Message-ID 由 notification 从 `email.sent` webhook 回填）。
3. 主题含 `[#<number>]` 且该工单 `requester_email` 与来信 `from` 相同（防止别人回复他人工单号）。
4. 都不命中 → 新建工单，`origin = EMAIL`，`requester_email = from`；若 user 服务能按邮箱查到用户则同时填 `requester_user_id`〔依赖 user 新增 `GetUserByEmail`，第一期没有则留空〕。

规则 2 是跨服务查询，放在规则 1 之后：多数回信规则 1 就能命中，不必每封都打一次 RPC。

**webhook 处理原则**：入口只做「验签 → 去重 → 落 `inbound_raw`（email_id + 元数据 + `status = PENDING`）→ 返回 200」，正文拉取与串线在后台任务完成。原因：Resend 会按退避重试失败的 webhook、持续失败会禁用端点，端点慢等于把自己下线；把慢操作移出请求路径。`inbound_raw` 处理失败保留 `status = FAILED` + 错误，管理面可见，人工重跑；正文拉取本身幂等（同 `email_id` 重拉结果一致）。

**inbound_raw**：`(email_id varchar(128) PK, svix_id, from_email, subject, rfc_message_id, status enum PENDING/PROCESSED/FAILED, attempts, last_error, received_at, processed_at)`。

**正文取值**：优先 `text`；`text` 为空则从 `html` 剥离标签〔剥离规则待定〕。`html` 原文不入库，需要时按 `email_id` 重拉或用 `raw.download_url`（签名 URL 有效期短，不持久化）。

**拒收**：`from` 是自家发件地址（避免自动回复回环）、或命中 notification 的压制名单 `reason = COMPLAINT` 的地址，记录后不建单。自动回复识别（`headers` 里 `auto-submitted` ≠ `no`、`x-auto-response-suppress`）〔待定〕。

## 四、接口

包 `support.v1`，契约 `backend/api/support/v1/`。

### 4.1 `SupportService`（客服面，`support` / `admin`）

| RPC | 请求字段与约束 | 备注 |
|---|---|---|
| `ListTickets` | `status repeated defined_only max_items 8`；`assignee_user_id uuid` 可选；`mine bool`；`cursor max_len 128`；`page_size lte 100` | `support` 角色看全部未分配 + 自己的；`admin` 看全部 |
| `GetTicket` | `ticket_id uuid` | 含 messages 与 events；`support` 只能看未分配或自己的 |
| `AssignTicket` | `ticket_id uuid`；`assignee_user_id uuid`（空 = 取消分配） | `support` 只能把未分配的单分给自己；转给别人需 `admin` |
| `Reply` | `ticket_id uuid`；`body_text min_len 1 max_len 65536`；`channels repeated defined_only min_items 1 max_items 2`；`set_status defined_only` 可选 | 必须是 assignee 或 admin；见 §4.3 |
| `AddNote` | `ticket_id uuid`；`body_text min_len 1 max_len 65536` | `direction = NOTE`，客户不可见 |
| `ChangeStatus` | `ticket_id uuid`；`status defined_only not_in [0]` | 按 §五 状态机校验 |
| `SetPriority` | `ticket_id uuid`；`priority defined_only` | |

### 4.2 `SupportUserService`（用户面，`customer` 及以上，`RequireUser`）

| RPC | 请求字段与约束 | 备注 |
|---|---|---|
| `CreateTicket` | `subject min_len 1 max_len 256`；`body_text min_len 1 max_len 65536`；`related_ref max_len 128` 可选 | `origin = IN_APP`；requester 从身份头取，email 从 user profile 快照 |
| `ListMyTickets` | `cursor`；`page_size lte 50` | 只返回 `requester_user_id = 身份头` |
| `GetMyTicket` | `ticket_id uuid` | 不返回 NOTE |
| `ReplyMyTicket` | `ticket_id uuid`；`body_text` | 追加 INBOUND；`RESOLVED` 自动重开 |

用户上传附件走 MinIO 预签名 URL〔本期待定，第一期用户面不支持附件〕。

### 4.3 回复链路

`Reply` 的事务边界：

1. 写 `ticket_messages(direction = OUTBOUND)`，`in_reply_to` = 最近一条 INBOUND 的 `rfc_message_id`；**`rfc_message_id` 留空**——Message-ID 由 Resend 生成，发送响应只返回 Resend `id`，不在这一步可得。
2. 更新 `tickets.last_outbound_at`；按 `set_status` 流转（默认 `PENDING`，等客户回复）。
3. 提交后调 `notification.v1.NotificationInternalService.SendMessage`：
   - `kind = SUPPORT_REPLY`，`source_ref = ticket:<id>`，`dedup_key = ticket_reply:<ticket_message_id>`
   - `channels` 由客服选：requester 有 `user_id` 可选 IN_APP + EMAIL；只有 email 时只能 EMAIL（proto 校验做不了这条，biz 层拒绝并返回 `InvalidArgument`）
   - EMAIL 主题 `Re: <subject> [#<number>]`；`email_headers` 传 `In-Reply-To` = 最近一条 INBOUND 的 `rfc_message_id`、`References` = 该工单全部已知 Message-ID（Resend 文档给出的串线做法就是 `In-Reply-To` + `Re:` 主题）；`email_reply_to` = `support.inbound.address`，客户直接回信就回到收件域名
   - 回填 `notification_message_id` 与 `notification_delivery_id`
4. 我方回复的真实 Message-ID 停留在 notification 的 `deliveries.rfc_message_id`（由 `email.sent` webhook 回填）。support 不同步回自己的表：串线时经 `LookupDeliveryByRfcMessageId` 反查（§三 规则 2），少一条跨服务回写链路。

第 3 步失败（notification 不可用）：`ticket_messages` 已落库，标 `delivery_pending`，由后台任务重试调用 SendMessage；`dedup_key` 保证重试不重复发。**不**把 SendMessage 放进第 1 步的事务——跨服务调用不进本地事务。

### 4.4 错误码映射

| biz 哨兵 | Connect code |
|---|---|
| `ErrTicketNotFound` | `NotFound`（包括「存在但无权看」，不泄露存在性） |
| `ErrNotAssignee` | `PermissionDenied` |
| `ErrInvalidTransition` | `FailedPrecondition` |
| `ErrChannelNotAvailable`（无 user_id 却选 IN_APP） | `InvalidArgument` |
| `ErrWebhookSignature` | HTTP 400 |

## 五、状态机

```text
                 客服回复（默认）
   OPEN ─────────────────────────► PENDING
    ▲  ▲                              │
    │  │ 客户再来信/站内回复            │ 客服 set_status
    │  └──────────────────────────────┤
    │                                 ▼
    │  客户再来信（自动重开）        RESOLVED ──7 天无回复〔待定〕──► CLOSED
    └──────────────────────────────────┘                                │
                                                                        │ 客户再来信 → 新建工单（不重开）
```

| 状态 | 含义 | 谁能进入 |
|---|---|---|
| `OPEN` | 等平台处理 | 新建；PENDING/RESOLVED 收到客户消息时自动 |
| `PENDING` | 等客户回复 | 客服回复后默认 |
| `RESOLVED` | 客服认为已解决 | 客服 |
| `CLOSED` | 归档，不再接收 | 客服；或 RESOLVED 超期自动 |

`CLOSED` 是终态：再来信按串线规则命中也**新建**工单并在 `related_ref` 记录旧单。`CLOSED` 超期自动流转由 PG Cron 或服务内定时任务承担〔二选一待定，动定时任务前读 runbook §0.1〕。

## 六、权限

### 6.1 现在：Casdoor `support` 角色 + Casbin + repository 条件

角色定义与继承链在 notification.md §7.1（`admin ⊃ support`，不继承 merchant）。

Casbin 新增：

| 路径前缀 | 放行角色 |
|---|---|
| `/support.v1.SupportService/*` | `support` |
| `/support.v1.SupportUserService/*` | `customer` |
| `/support.v1.ResendInboundWebhook/Handle` | 匿名清单（Svix 签名） |

服务内：

- 客服面从 `x-md-global-role` 判定 `admin` / `support`（用 `backend/pkg/identity.HasRole`）。
- `support` 的可见范围与可操作范围在 **repository 查询条件**里体现（`assignee_user_id IS NULL OR assignee_user_id = $me`），不靠 service 层事后过滤。
- 用户面一律 `RequireUser` + `requester_user_id = $me`。

### 6.2 目标：OpenFGA 首个接线试点

工单是本仓最适合做 OpenFGA 首例的对象：关系少、生命周期清楚、不涉及交易链路。模型追加到 TECH.md §8.2：

```text
type platform
  relations
    define admin: [user]
    define support_agent: [user]

type ticket
  relations
    define platform: [platform]
    define requester: [user]
    define assignee: [user]
    define can_view: requester or assignee or admin from platform or support_agent from platform
    define can_reply: assignee or admin from platform
    define can_assign: admin from platform
    define can_self_assign: support_agent from platform
```

tuple 生命周期：建单写 `requester`；`AssignTicket` 写/删 `assignee`；`platform#admin` 与 `platform#support_agent` 由 Casdoor 角色同步〔同步机制待 control-tower 定〕。接线后 §6.1 的 repository 条件**保留**作为第二道防线（rbac.md：网关 RBAC 通过 ≠ 对象归属正确）。

## 七、前端

- **admin app** 新增路由 `/support`：工单列表（未分配 / 我的 / 全部）、工单详情（往来时间线、内部备注、回复框带渠道多选、状态与分配控件）。`support` 角色登录 admin 后只看到 `/support`；路由守卫读角色头，仅 UX。
- **consumer app**：帮助中心页 `/support`：发起工单、我的工单、查看回复；客服回复同时以站内信到达（经 notification）。

不新建前端 app。客服与管理员共用 admin，差别只在角色与可见路由。

## 八、配置

Config Center `support/<env>/bootstrap.yaml`，`support` 块：

| 键 | 机密 | 说明 |
|---|---|---|
| `support.resend.api_key` | 是 | 拉取来信正文与附件；与 notification 的 key 可为同一个 Resend 团队下的不同 key（最小权限：只读收件） |
| `support.resend.webhook_secret` | 是 | `email.received` 端点的 Svix 密钥（与 notification 状态 webhook 是两个端点，两个密钥） |
| `support.inbound.domain` | 否 | 收件域名 |
| `support.inbound.address` | 否 | 如 `support@<域名>` |
| `support.attachments.bucket` | 否 | MinIO bucket |
| `support.auto_close_after` | 否 | RESOLVED → CLOSED 时长，默认 `168h`〔待定〕 |

## 九、落地登记

1. `.service-matrix.yaml`：`services.support`（`discovery: support-service`，`gateway_prefix: /support*`，`depends_on: [notification]`，`depends_on_planned: [user]`，`external: [postgres, resend, minio, config_center]`）；服务数口径 11→12（与 notification 同 PR 则 10→12）。
2. control-tower `routes` 增 `package: support`，匿名清单加 webhook 路径；`policies.csv` 增 §6.1 行；同 PR 升本仓依赖，structcheck 过。
3. `backend/api/support/v1/support.proto` 按 §二、§四加 `buf.validate`。
4. 部署清单两边同步，`verify-deploy-parity.sh` 过。
5. Resend 后台：收件域名 MX、`email.received` webhook 指向网关公网地址（`gateway.apikv.com`）。
6. `TODO.md` 回写。

## 十、分期与验收

| 期 | 内容 | 验收锚点 |
|---|---|---|
| P1（在 notification P0 之后） | 表、收件 webhook + 后台拉正文、串线、`SupportService` 全部、`Reply` 经 notification 发 EMAIL、admin `/support` 页、`support` 角色 | 外部邮箱发信到 `support@` → admin 列表 30s 内出现工单；客服回复 → 外部邮箱收到带 `[#number]` 主题的邮件；外部邮箱直接回复 → 同一工单追加 INBOUND 并从 PENDING 回到 OPEN；`support` 账号看不到别人已分配的单（RPC 返回 NotFound） |
| P1.5 | `SupportUserService` + consumer `/support` 页 + 回复同时 IN_APP | 用户站内提单 → 客服回复 → 用户收件箱与邮箱各一条 |
| P2 | 附件转存 MinIO、自动关单、OpenFGA 试点 | OpenFGA Check 拒绝非 assignee 的 `Reply`，且 repository 条件仍独立生效（关掉 FGA 校验回归测试仍绿） |

## 十一、待确认

- Resend 收件邮件与附件在 Resend 侧的保留期（决定 `object_key` 为空的附件能不能一直按需拉，还是必须尽快转存）。
- user 服务是否新增 `GetUserByEmail`（§三 串线第 3 条）。
- 附件大小、数量、保留期；用户面是否支持附件（§2.2、§4.2）。
- 自动关单时长与执行方式（§五、§八）。
- `platform#admin` / `platform#support_agent` tuple 与 Casdoor 角色的同步归谁（§6.2）。
