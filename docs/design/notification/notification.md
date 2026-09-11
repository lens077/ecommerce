# 通知服务（notification）设计：系统发信

> 2026-09-09 设计草案。承接 [../../TECH.md](../../TECH.md) §5.9「Notification Service（通知域）」，
> 把它从一段职责描述落成可写 proto 与迁移的设计。对偶文档是
> [../support/support.md](../support/support.md)（客服收件）；两者的分工见 §一。
>
> **现状事实（2026-09-09）**：`backend/services/` 下没有 notification 服务；本仓没有 Kafka 客户端
> （`.service-matrix.yaml` 的 `kafka.used_by` 为空）；OpenFGA 集群已就绪但业务未接线；admin 前端
> 只有路由骨架；网关路由在同级仓 control-tower，按一级 proto 包名匹配，当前零 streaming RPC。
> 本文凡写「现在」指第一期实现，凡写「目标」指依赖尚未落地的部分，不得把目标写成能力。
>
> 术语见 [../../GLOSSARY.md](../../GLOSSARY.md)。字段约束表是写 proto 的输入
> （[context/team/proto-design.md](../../../context/team/proto-design.md) 铁律二）。

## 一、定位与边界

notification 只做一件事：**把一条已经决定要发的消息，按渠道渲染并投递出去，并记录结果**。

| 职责 | 属于 notification | 不属于 notification |
|---|---|---|
| 模板管理（key、渠道、语言、版本） | ✅ | — |
| 站内信存储与推送到前端 | ✅ | — |
| 邮件经 Resend 发出、接收投递状态回调 | ✅ | — |
| 退订、退信、投诉的压制名单 | ✅ | — |
| 幂等（同一业务事件对同一用户只发一次） | ✅ | — |
| 决定「什么时候该给谁发什么」 | — | 各域服务 / admin / support |
| 客户来信、工单、客服分配 | — | [support](../support/support.md) |
| 用户资料（邮箱、语言偏好） | — | user 服务（notification 只读取） |

**三类发信来源走同一入口 `SendMessage`**：

1. **系统通知**：订单、支付、退款、激活码。现在由域服务同步调用 `SendMessage`（东西向）；目标态改为消费 Kafka 领域事件（TECH.md §5.9），届时 `SendMessage` 保留给不产生领域事件的场景。
2. **管理员发信**：admin 前端发起，单发或群发，可同时勾选站内信与邮件（即「混合」）。
3. **客服回复**：support 服务调用，渠道由 support 决定。

**与 admin-service 的关系**：[platform/admin-roadmap.md](../platform/admin-roadmap.md) §二规定 admin app 只调 `admin.v1`，
但 admin-service 尚未立项。**第一期 admin app 直接调 `notification.v1` 的管理面 RPC**，由网关按角色约束入口；
admin-service 落地后再决定是否聚合。此偏离已回写到 admin-roadmap。

## 二、领域模型

### 2.1 概念

- **Template（模板）**：按 `key + channel + locale` 定位的一份渲染源，带版本。系统通知与客服回复引用模板；管理员自由发信可以不用模板（直接给 subject/body）。
- **Message（消息）**：一次发送意图。记录发起方、受众、内容来源（模板或直写）、渠道集合。一条 Message 对应 1 个受众 × N 个渠道的 Delivery。
- **Delivery（投递）**：一个受众在一个渠道上的一次投递，是状态机主体和重试单元。
- **Inbox（站内信收件箱）**：`channel = IN_APP` 的 Delivery 在用户侧的视图，附加已读状态。不单独建表，读 `deliveries`。
- **Suppression（压制）**：某邮箱不再接收某类邮件的记录，来源是退信、投诉或用户退订。
- **DedupKey（幂等键）**：`messages.dedup_key`，由调用方给出，唯一约束保证「同一业务事件对同一用户只发一次」。

### 2.2 表与字段约束

schema：`notification`（沿用「db=ecommerce，每服务独立 schema」约定）。表结构不在此手写 DDL，落地后用 `<!-- embed -->` 从迁移文件投影。

**templates**

| 字段 | 类型 | 约束（同时是 proto 校验） | 说明 |
|---|---|---|---|
| id | uuid | PK | |
| key | varchar(64) | `min_len 1, max_len 64`，`^[a-z0-9_.]+$` | 如 `order.paid`、`auth.activation_code` |
| channel | enum | `defined_only, not_in [0]` | `IN_APP` / `EMAIL` |
| locale | varchar(16) | `min_len 2, max_len 16` | BCP 47，如 `zh-CN`、`en` |
| version | int | `gte 1` | 同 key+channel+locale 递增；只新增不覆盖 |
| subject | varchar(256) | `max_len 256` | EMAIL 必填；IN_APP 作标题 |
| body | text | `min_len 1, max_len 65536` | 模板正文；语法见 §2.3 |
| variables | jsonb | 数组 `max_items 64`，每项 `max_len 64` | 声明模板引用的变量名，渲染前校验 params 齐全 |
| is_active | bool | | 同 key+channel+locale 只允许一个 active 版本（部分唯一索引） |
| created_by | uuid | `uuid` | 管理员 user_id |
| created_at | timestamptz | | |

唯一约束：`(key, channel, locale, version)`；部分唯一索引：`(key, channel, locale) WHERE is_active`。

**messages**

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | PK | |
| kind | enum | `defined_only, not_in [0]` | `SYSTEM` / `ADMIN` / `SUPPORT_REPLY` / `MARKETING` |
| dedup_key | varchar(128) | `max_len 128`；非空时唯一 | 调用方构造，见 §五 |
| template_key | varchar(64) | 同 templates.key；与 direct 二选一 | |
| template_params | jsonb | 键 `max_len 64`，值 `max_len 4096`，对数 `max_pairs 64` | 渲染变量 |
| direct_subject | varchar(256) | `max_len 256` | 不用模板时直写 |
| direct_body | text | `max_len 65536` | 不用模板时直写 |
| recipient_user_id | uuid | `uuid`；与 recipient_email 至少一个 | 站内信必须有 user_id |
| recipient_email | varchar(254) | `email, max_len 254` | 没有 user_id 的收件人（如未注册来信者）只能走 EMAIL |
| channels | enum[] | `min_items 1, max_items 2, items defined_only not_in [0]`，去重 | |
| initiated_by | uuid | `uuid` | 发起人（管理员/客服）或服务工作负载标识；系统调用为空 |
| source_ref | varchar(128) | `max_len 128` | 业务引用，如 `order:<id>`、`ticket:<id>`，仅用于追溯 |
| created_at | timestamptz | | |

`template_key` 与 `direct_*` 二选一，两者都空或都非空均拒绝（`InvalidArgument`）。

**deliveries**

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | PK | |
| message_id | uuid | FK messages | |
| user_id | uuid | 可空 | 站内信列表按此过滤 |
| channel | enum | `defined_only, not_in [0]` | |
| status | enum | `defined_only` | 状态机见 §六 |
| rendered_subject | varchar(256) | | 渲染结果快照，模板改版不影响历史 |
| rendered_body | text | | |
| provider_message_id | varchar(128) | `max_len 128` | Resend 返回的 email id；IN_APP 为空 |
| rfc_message_id | varchar(998) | `max_len 998`；非空时唯一 | 邮件 `Message-ID` 头，由 `email.sent` webhook 回填；support 按它反查 `source_ref` 串线 |
| custom_headers | jsonb | 键 `max_len 64`，值 `max_len 998`，`max_pairs 8` | 透传给 Resend `headers`，如 `In-Reply-To` / `References` / `List-Unsubscribe` |
| attempts | int | `gte 0` | |
| last_error | varchar(1024) | `max_len 1024` | |
| next_attempt_at | timestamptz | | 重试调度 |
| read_at | timestamptz | 可空 | 仅 IN_APP 使用 |
| created_at / updated_at | timestamptz | | |

索引：`(user_id, channel, created_at DESC)` 供收件箱分页；`(status, next_attempt_at)` 供重试扫描；`provider_message_id` 唯一（非空）供 webhook 回写；`rfc_message_id` 唯一（非空）供 support 反查。

**suppressions**

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| email | varchar(254) | PK 之一，`email` | |
| scope | enum | `defined_only` | `ALL` / `MARKETING`：退信与投诉压制全部；退订只压制营销 |
| reason | enum | `defined_only, not_in [0]` | `BOUNCE` / `COMPLAINT` / `UNSUBSCRIBE` / `MANUAL` |
| source_event_id | varchar(128) | `max_len 128` | Resend 事件 id，幂等 |
| created_at | timestamptz | | |

主键 `(email, scope)`。发送 EMAIL 前查：`scope = ALL` 命中一律拒发；`kind = MARKETING` 时 `scope = MARKETING` 也拒发。拒发的 Delivery 直接置 `SUPPRESSED`，不算失败。

**inbox_dedup**：目标态 Kafka 消费者的幂等表 `(event_id varchar(128) PK, consumed_at)`。第一期建表不写入；`messages.dedup_key` 已覆盖同步调用的幂等。

### 2.3 模板语法

Go `text/template`（站内信）与 `html/template`（邮件 HTML），变量只允许 `{{.name}}` 形式引用 `variables` 里声明的名字；渲染前校验 `template_params` 包含全部声明变量，缺失返回 `InvalidArgument`，不渲染成空串。

不引入第三方模板引擎；模板版本只增不改，历史投递保留渲染快照。

## 三、渠道

### 3.1 IN_APP（站内信）

- 真相在 PG `deliveries`；发送即写库，`status = DELIVERED`（没有外部投递环节）。
- 前端拿数据的两种方式，接口形状一致，只是推送方式不同：
  - **现在**：`ListInbox(cursor)` 拉取 + `UnreadCount` 轮询〔间隔待前端定〕。
  - **目标**：`SubscribeInbox` Connect server-streaming，连接建立时先按 `since_cursor` 回补，再推增量。
- 多副本扇出用 Dragonfly pub/sub（`notification:inbox:<user_id>`），**只做唤醒信号**，不承载消息体；订阅端收到信号后按 cursor 从 PG 读。信号丢失只影响实时性，不丢消息——符合 `.service-matrix.yaml` 「Redis 只放可丢缓存」的约束。
- 流式路由依赖 control-tower 两件事：a) 路由级总超时对 streaming 路由豁免（其 decisions.md 已预留，当前零 streaming RPC，**需要真实验证**）；b) `http.Server` 不设 `WriteTimeout`（已约定）。验证前不承诺 `SubscribeInbox` 可用。

### 3.2 EMAIL（Resend）

事实来源（核实日期 2026-09-09）：[Send Email](https://resend.com/docs/api-reference/emails/send-email)、[Send Batch Emails](https://resend.com/docs/api-reference/emails/send-batch-emails)、[Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys)、[Custom Headers](https://resend.com/docs/dashboard/emails/custom-headers)、[Event Types](https://resend.com/docs/webhooks/event-types)、[Retries and Replays](https://resend.com/docs/webhooks/retries-and-replays)、[Verify Webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests)、[账户配额](https://resend.com/docs/knowledge-base/account-quotas-and-limits)。

**发送**

- `POST /emails`：`from`、`to`（最多 50 个地址）、`subject`、`html` / `text`、`headers`（自定义头）、`attachments`（单封 Base64 后合计 ≤ 40 MB）、`tags`、`reply_to`。**响应只有 `id`**（Resend 的 email id），RFC `Message-ID` 要等 `email.sent` webhook 才拿得到（见下）。
- `POST /emails/batch`：**单次最多 100 封**，按 100 切片；批量接口**不支持 `attachments`**。
- `Idempotency-Key` 请求头：≤ 256 字符，24 小时内同 key 返回同一结果不重发，`/emails` 与 `/emails/batch` 都支持。**每次投递用 `delivery_id` 作 key**，§六的重试因此对 Resend 侧也是幂等的。
- 团队级默认限速 **10 req/s**，客户端本地令牌桶按此设上限，429 按 §六重试。
- Go SDK 用 `github.com/resend/resend-go/v3`（含 `Emails.Receiving`，support 也用它）。
- Resend 自带模板功能（`template.id` + `variables`）本设计**不用**：模板真相在本服务 `templates` 表，发送时传渲染好的 `html` / `text`，避免两处模板漂移。
- 发件域名与 DKIM/SPF/DMARC 在 Resend 后台配置；仓库只记录域名，不记录密钥。

**投递状态 webhook**

- 订阅：`email.sent`、`email.delivered`、`email.delivery_delayed`、`email.bounced`、`email.complained`、`email.failed`、`email.suppressed`，以及 `suppression.added` / `suppression.removed`。所有 email 事件的 `data` 都带 `email_id` 与 `message_id`（RFC Message-ID）。
- 回写：`email.sent` → `SENT` 并**回填 `deliveries.rfc_message_id`**（support 串线依赖）；`delivered` → `DELIVERED`；`bounced` / `complained` → `BOUNCED` 并写 `suppressions`；`failed` / `suppressed` → `FAILED`（`last_error` 记原因）；`delivery_delayed` 只记日志不变状态。
- Resend 自己也维护压制名单（退信/投诉自动加入，发给名单内地址会得到 `email.suppressed`）。本服务的 `suppressions` 表**镜像**它（经 `suppression.added/removed` 同步），并额外承载 Resend 没有的 `MARKETING` 范围退订。两边冲突以 Resend 为准——它管的是发信信誉。
- Webhook 签名：Svix 三头 `svix-id` / `svix-timestamp` / `svix-signature`，用 webhook secret 校验；校验失败返回 400 不入库。时间戳容忍窗口〔待定，Svix 默认 5 分钟〕。
- Webhook 幂等：`svix-id` 唯一，落 `webhook_events(svix_id PK, received_at)` 去重。
- Resend 对失败的 webhook 按指数退避重试 8 次（即时、5s、5min、30min、2h、5h、10h、10h），持续失败会**自动禁用端点**并邮件通知。因此端点必须「验签 → 去重 → 落库 → 立即 2xx」，任何慢操作移到后台。
- 退订链接：`MARKETING` 邮件必须带 `List-Unsubscribe` 自定义头与正文退订链接，指向 `Unsubscribe` RPC（匿名，带签名 token）。第一期没有营销群发，先把头与表建好。

### 3.3 Webhook 入口的路径形态

网关按一级 proto 包名路由、对 HTTP method 透明、匿名清单按程序路径逐字匹配。Resend 发的是 JSON POST 并带 Svix 头，校验需要**原始 body 字节**，Connect 生成的 handler 拿不到。

方案：服务侧在 `/notification.v1.ResendWebhook/Handle` 路径挂**原生 `http.Handler`**（不是 Connect RPC），路径沿用 Connect 命名以复用网关路由与匿名清单，函数体自己读 body、验签、解析。与 payment 用 `HandlePaymentNotify(UrlValues)` 的做法不同，原因是 Svix 验签需要 body 原文。

〔待验证〕control-tower 匿名清单是否接受非 Connect 生成的路径；若不接受，退到 Connect RPC + `bytes raw_body`，由网关适配层注入原始 body。

## 四、接口

包 `notification.v1`，契约 `backend/api/notification/v1/`。三个 Service 按调用方分开，便于网关按 Service 前缀写 Casbin 策略。

### 4.1 `NotificationService`（用户面，需登录，`customer` 及以上）

| RPC | 请求字段与约束 | 响应 | 备注 |
|---|---|---|---|
| `ListInbox` | `cursor string max_len 128`；`page_size uint32 lte 50`，默认 20；`unread_only bool` | items[] + next_cursor | 只返回 `user_id = 身份头` 且 `channel = IN_APP` |
| `UnreadCount` | 无 | `count uint32` | |
| `MarkRead` | `delivery_ids repeated uuid min_items 1 max_items 100` | 无 | 只更新属于本人的行，其它 id 静默忽略并计数返回 |
| `MarkAllRead` | 无 | `updated uint32` | |
| `SubscribeInbox`（目标） | `since_cursor string max_len 128` | stream item | 依赖 §3.1 验证 |
| `Unsubscribe`（匿名） | `token string min_len 32 max_len 512` | 无 | token 为 HMAC 签名的 `email+scope+exp` |

身份用 `backend/pkg/identity.RequireUser`，访客一律 `Unauthenticated`。

### 4.2 `NotificationAdminService`（管理面，`admin`；`support` 只放行 `SendMessage` 与只读查询）

| RPC | 请求字段与约束 | 备注 |
|---|---|---|
| `CreateTemplate` | 见 templates 表 | 新版本；`is_active` 由 `ActivateTemplate` 切换 |
| `ActivateTemplate` | `template_id uuid` | 同 key+channel+locale 其它版本自动失活 |
| `ListTemplates` | `key max_len 64` 可选；`channel defined_only`；`page_size lte 100` | |
| `PreviewTemplate` | `template_id uuid`；`params`（同 template_params 约束） | 返回渲染结果，不落库 |
| `SendMessage` | 见 4.3 | admin 单发 |
| `SendBroadcast`（目标，营销） | `audience`：`user_ids repeated uuid max_items 1000` 或 `segment` 枚举；其余同 SendMessage | 拆成每受众一条 Message，异步执行，返回 `broadcast_id` |
| `ListDeliveries` | `user_id uuid` 可选；`status defined_only`；`channel`；`since/until int64 gte 0`；`page_size lte 100` | 投递审计 |
| `AddSuppression` / `RemoveSuppression` | `email`，`scope defined_only` | 人工维护，`reason = MANUAL` |

### 4.3 `NotificationInternalService`（东西向，域服务与 support 调用）

**`SendMessage`**：请求 = messages 表字段（去掉 id/created_at），外加：

- `dedup_key`：系统通知**必填**（`min_len 1`），格式 `<event>:<entity_id>:<user_id>`，如 `order.paid:8f3…:2c1…`；管理员单发可空。
- 冲突（`dedup_key` 已存在）返回 **成功** 并带原 `message_id`，不报错——重复投递才是错，重复调用是预期。
- `email_headers`：可选，约束同 deliveries.custom_headers；只允许白名单头 `In-Reply-To` / `References` / `List-Unsubscribe` / `X-Entity-Ref-ID`，其它键 `InvalidArgument`。
- `email_reply_to`：可选，`email, max_len 254`；support 回复时填收件地址，让客户直接回信进工单。

响应：`message_id`、每渠道的 `delivery_id` 与初始 status。**不含 RFC Message-ID**——Resend 发送响应只有 `id`，Message-ID 由 `email.sent` webhook 异步回填。

**`LookupDeliveryByRfcMessageId`**：请求 `rfc_message_id string min_len 1 max_len 998`；响应 `delivery_id`、`message_id`、`source_ref`、`recipient_email`。找不到返回 `NotFound`。support 收到回信时用 `In-Reply-To` / `References` 反查自己发过的邮件属于哪张工单（support.md §三）。

**`GetDelivery`**：`delivery_id uuid` → deliveries 行。support 记录 `notification_delivery_id` 后可查投递状态。

东西向调用不经网关，无身份头；第一期靠 NetworkPolicy 限制来源，服务身份是已知缺口（admin-roadmap §二「代价 ③」）。

### 4.4 错误码映射（[platform/error-handling.md](../platform/error-handling.md)）

| biz 哨兵 | Connect code |
|---|---|
| `ErrTemplateNotFound` / `ErrDeliveryNotFound` | `NotFound` |
| `ErrTemplateParamsMissing` / `ErrContentSourceConflict` | `InvalidArgument` |
| `ErrRecipientSuppressed` | 不是错误：Delivery 置 `SUPPRESSED`，RPC 返回成功 |
| `ErrProviderRateLimited` / `ErrProviderUnavailable` | 不对调用方暴露：Delivery 置 `PENDING` 排重试，RPC 返回成功 |
| `ErrWebhookSignature` | HTTP 400（原生 handler） |

调用方关心的是「意图是否已记录」，不是「邮件此刻有没有发出去」；投递结果看 `ListDeliveries` 或后续事件。

## 五、幂等

三层，各管一段：

1. **调用幂等**：`messages.dedup_key` 唯一约束，冲突返回已有记录。
2. **事件幂等（目标）**：Kafka 消费者先写 `inbox_dedup(event_id)`，冲突即跳过，再构造 `dedup_key` 调 SendMessage。
3. **回调幂等**：`webhook_events(svix_id)` 唯一。

`dedup_key` 由调用方生成的原因：只有调用方知道「哪两次调用是同一件事」，notification 不该猜。

## 六、投递状态机与重试

```text
PENDING ──发送成功──► SENT ──webhook delivered──► DELIVERED
   │                    │
   │                    └──webhook bounced/complained──► BOUNCED（并写 suppressions）
   ├──压制名单命中──► SUPPRESSED
   └──重试耗尽──► FAILED

IN_APP：PENDING → DELIVERED 在同一事务内完成，无中间态。
```

- 重试：指数退避 `30s, 2m, 10m, 1h, 6h`，共 5 次，之后 `FAILED`；只对 5xx / 429 / 网络错误重试，4xx（除 429）直接 `FAILED` 并记 `last_error`。每次重试带同一个 `Idempotency-Key = delivery_id`，请求发出但响应丢失的情况不会重复发信（Resend 侧 24 小时窗口，远大于 5 次重试的总跨度约 7 小时）。
- 扫描器：单实例 leader 由 PG advisory lock 保证〔或 `SELECT … FOR UPDATE SKIP LOCKED` 分片〕，不借 Redis 锁（矩阵约束：Redis 不得承载锁）。
- `FAILED` 无自动恢复，管理面 `ListDeliveries(status=FAILED)` 可见，人工重发 = 新 Message。
- 目标态 Kafka 消费失败进 DLQ（TECH.md §5.9），与此处 Delivery 重试是两层：DLQ 管「事件没消费成」，Delivery 管「消费成了但发不出去」。

## 七、权限

### 7.1 角色（现在：Casdoor 角色 + Casbin 程序级策略）

新增 Casdoor 角色 **`support`**（客服）。继承链改为：

```text
admin ⊃ support
admin ⊃ merchant ⊃ customer ⊃ public
```

`support` 不继承 `merchant`；客服不是商家。

Casbin `policies.csv`（Config Center `gateway/policies/policies.csv`，control-tower 侧改）新增：

| 路径前缀 | 放行角色 |
|---|---|
| `/notification.v1.NotificationService/*` | `customer`（`Unsubscribe` 进匿名清单） |
| `/notification.v1.NotificationAdminService/SendMessage`、`ListDeliveries`、`ListTemplates`、`PreviewTemplate` | `support` |
| `/notification.v1.NotificationAdminService/*` 其余 | `admin` |
| `/notification.v1.ResendWebhook/Handle` | 匿名清单（靠 Svix 签名） |

`/notification.v1.NotificationInternalService/*` **不进网关路由**，只东西向可达。

### 7.2 服务内校验

- 用户面：`RequireUser` + repository 带 `user_id = $1`（rbac.md：网关放行 ≠ 归属正确）。
- 管理面：读取 `x-md-global-role`（网关注入，逗号分隔），`support` 只能 `SendMessage(kind = SUPPORT_REPLY)`；`kind = MARKETING` 与模板写操作要求 `admin`。角色头判定封装进 `backend/pkg/identity`（新增 `HasRole`），不在各 service 手写字符串比较。

### 7.3 OpenFGA（目标）

notification 没有需要对象级授权的资源（模板是平台全局的，投递记录按 user_id 过滤即可）。OpenFGA 的首个接线场景放在 support 的工单（见 support.md §六），这里不接。

## 八、前端

- **admin app**（`frontend/apps/admin`）新增路由 `/messages`：发信（收件人、渠道多选、模板或直写、预览）、模板列表与版本、投递记录。路由守卫按角色头隐藏，只是 UX；真正拦截在网关。
- **consumer app**：铃铛未读数 + `/inbox` 收件箱页；第一期轮询，`SubscribeInbox` 验证通过后切流。
- **merchant app**：本期不接（商家侧通知中心是 merchant roadmap P1 的事，届时同一套接口按 `user_id` 复用）。
- 生成代码进 `frontend/packages/api`，调用走 `context/project/ecommerce/frontend-api/sop/connect-query.md`。

## 九、配置

Config Center `notification/<env>/bootstrap.yaml`，键随通用块（postgres/redis/observability）之外新增 `notify` 块：

| 键 | 机密 | 说明 |
|---|---|---|
| `notify.resend.api_key` | 是 | 仓库留空，真值只在 Config Center / K8s Secret |
| `notify.resend.webhook_secret` | 是 | Svix 签名密钥 |
| `notify.resend.from` | 否 | 发件人，如 `noreply@<域名>` |
| `notify.resend.rate_limit_rps` | 否 | 默认 10 |
| `notify.unsubscribe.hmac_key` | 是 | 退订 token 签名 |
| `notify.inbox.push` | 否 | `poll` / `stream`，切流开关 |

`api_key` 为空时 EMAIL 渠道禁用（`SendMessage` 带 EMAIL 返回 `FailedPrecondition`），与 payment「`pay.alipay.*` 为空即禁用」同一惯例。

## 十、落地登记（立项即做）

1. `.service-matrix.yaml`：`services.notification`（`discovery: notification-service`，`gateway_prefix: /notification*`，`external: [postgres, redis, resend, config_center]`，`depends_on_planned: [user]`）；`external_deps` 增 `resend`；`kafka.used_by` 保持为空直到消费者真接线；服务数口径 10→11。
2. control-tower `routes/{dev,pre}.yaml` 增 `package: notification`，匿名清单加 `Unsubscribe` 与 webhook 路径；`policies.csv` 增 §7.1 行；**同 PR 升本仓 `github.com/lens077/control-tower` 依赖版本**，`go test ./structcheck/...` 过。
3. `backend/api/notification/v1/notification.proto`：按 §二、§四表逐字段加 `buf.validate`。
4. 部署：`backend/services/notification/deploy/{base,overlays}` 与 `helm/` 同步，`scripts/verify-deploy-parity.sh` 过；Makefile `SERVICES`、`compose.yaml` 增行。
5. Casdoor 新增 `support` 角色（后台操作，不入仓）。
6. `TODO.md` 阶段 2 增条目并回写分类索引。

## 十一、分期与验收

| 期 | 内容 | 验收锚点 |
|---|---|---|
| P0 | 表、模板 CRUD、`SendMessage`（IN_APP + EMAIL）、用户面收件箱（轮询）、admin `/messages` 页、Resend 状态 webhook、压制名单 | admin 发一条「混合」消息：consumer 收件箱出现且邮箱收到；Resend 后台 bounce 测试地址触发 `BOUNCED` + `suppressions` 写入；同 `dedup_key` 调两次只有一条 Message |
| P1 | `SubscribeInbox` 流式（先验证网关）、support 接入 `SUPPORT_REPLY` | 网关经路由推送一条站内信到已打开的 consumer 页面，无需刷新 |
| P2 | Kafka 消费者 + `inbox_dedup`（依赖本仓落 franz-go 客户端）、`SendBroadcast` 营销、退订链路 | `OrderPaid` 事件重放两次只发一封邮件；退订后营销邮件置 `SUPPRESSED` |

## 十二、待确认

- control-tower 匿名清单对非 Connect 生成路径的匹配（§3.3）。
- control-tower streaming 路由超时豁免的实际状态（§3.1）。
- Resend 收件（Receiving）与自定义收件域名在当前套餐是否开通（文档已核实能力存在，套餐范围未核）。
- 前端轮询间隔与 `page_size` 默认值由前端定。
- 用户语言偏好（`locale`）从哪读：user 服务 profile 尚无此字段，缺省 `zh-CN`。
