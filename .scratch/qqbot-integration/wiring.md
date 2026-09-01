# qqbot 服务在 ecommerce 架构里的接线方案

> 任务 t2（AgentTeams 团队 qqbot-integration）／作者 wiring-architect／2026-09-01
>
> 本文只回答「**怎么接进去**」，不重复 QQ 平台协议本身，也不涉及产品形态与优先级
> （那是同目录 `issues/01-*.md`…`08-*.md` 与 `spec.md` 的范围，本文不碰）。
>
> **本文只是方案文档。** 我没有修改 `.service-matrix.yaml`、没有改任何生产代码、
> 没有执行 commit / push / 部署。所有「怎么改」都写成待执行的步骤。

**修订记录**

| 日期 | 改动 |
|---|---|
| 2026-09-01 初版 | 10 个问题全答，12 条待验证 |
| 2026-09-01 修订 1 | 接入队友 **spec-author** 的 openid 调研（经队长转交）。①**修正 §9.2 `identity_binding` 主键**——openid 是 per-bot 维度的，`app_id` 必须进主键，原设计在换 AppID 后会静默错配（这是原稿的**设计缺陷**，不是补充）；②新增 §9.3，写清 openid 四条性质各自逼出什么设计；③**§3.2 方案 A 的前提已落实**——绑定需要一个过网关的浏览器端点，`gateway_prefix` 不再是应付门禁的空壳。待验证 12 → 13（新增 V13） |
| 2026-09-01 修订 9 | 在 §0 补一条**核对方法**（由 spec-author 的实证促成，属方法缺陷不是内容缺陷）：本文约五十处 `文件:行号` 均为 2026-09-01 快照，被引文件会演进、行号必然漂移；真正危险的是**行号碰撞给出的假确认**——本轮真实发生过：某措辞被引为 `spec.md`:97，改动后该行仍存在但内容已相反，只跳行号会得到「还在那儿」的错误印证（同一封信报的行数 931，我几分钟后实测 937，行数自身也在漂）。故明确：**核对拿引文 grep，行号只用于加速定位、不作判据**，与 `live-facts.md`「耐久的是不变量与查法，数字只是注解」同构 |
| 2026-09-01 修订 8 | 经 spec-author 指出**补正一处漏项**：原「落点正确不等于写法正确」只写了 PostgreSQL 侧的原子自增，**漏了 Dragonfly 侧同理**——短窗口与被动回复窗口的计数在多副本下同样会丢更新，必须 `INCR` 而非 `GET`+`SET`。同时把**两个不同的失败模式**显式拆开（重复写入→唯一约束可解；并发递增丢更新→唯一约束**拦不住**，因为两次写的是同一行不同版本），避免有人用前者的解法去防后者。另补两条本仓出处的纪律：①`go-redis.md`:117-125——`INCR` 原子但不幂等，重试会多计，但方向安全（多计→少发），**不要为消除多计改回读-改-写**；②`go-redis.md`:233——计数键必须带 TTL，且只在 `INCR` 返回 1 时设，否则 `INCR`/`EXPIRE` 之间崩溃会留下永不过期的键、该窗口从此不重置（永久少发） |
| 2026-09-01 修订 7 | 经 spec-author 逐行比对 §9.4 原文后**补正两处自身缺陷**（均在 §9.4，非措辞问题）：①**规则与表格自相矛盾**——正文写「任一条不满足就落 PostgreSQL」，而表格第二行（被动回复窗口）测试②为 ⚠️ 却落 Dragonfly。原文只给了成本论证，**没标明它是规则的例外**，会让人照它去推别的配额（「②不满足也能放缓存」）。已在规则句与表后各加显式标注，并写清该例外成立的三个前提；②**缺反方向警告**——原文只说「`redis.Nil` ⇒ 按窗口全新处理」，未警告把 `redis.Nil` 当故障 fail-closed 的错误修法：它与「窗口刚开始」不可区分，当故障等于把每个新窗口当故障，**每个窗口的第一条消息都发不出去**，而这种错法看起来很像在修淘汰问题。已补入两分支严格按来源分派的要求 |
| 2026-09-01 修订 6 | **§9.4 状态收口**（队长批准，只改标题与状态行、分析正文一字不动）：队长已裁决「日配额以 §9.4 为准」，`spec.md` 侧亦由 t7 收敛完毕，故原标题「未消解分歧」与结尾「以哪份为准需要队长明示」已作废——**裁决闭合了分歧，但闭合动作发生在本文件之外，于是本文件成了唯一还记着「未决」的地方**。改法沿用本轮已三次使用的模式：**结论变了改状态行，论证过程原样保留**（下一个读者最想知道的往往不是「结论是什么」，而是「为什么不是另一个」）。另记入日配额的并发义务：`ON CONFLICT ... DO UPDATE SET n = n + 1 RETURNING n` |
| 2026-09-01 修订 5 | 采纳 spec-author 的「别把交叉引用当交叉验证」提醒：V13 的三条平台事实**只有一个未经核实的来源**，而 `spec.md` 与本文互相引用会制造「两份文档独立佐证」的假象。已在 §9.3 与 V13 两处加显式警告，并写明「实测确认前不要让实现依赖『群/单聊 openid 不通用』」——§9.3 推理具体不等于假设已被验证 |
| 2026-09-01 修订 4 | 据 spec-author 反馈**收窄一处过宽的结论**：§11 阻塞 3 原写「第一版砍掉主动推送」无限定词，而该阻塞的论据（order 无 outbox producer）只约束**事件驱动的**推送。`spec.md` 在 P0 保留的运维通知不经事件链，不受此约束，且是 P0 唯一能验证主动消息通道与频控的手段。已加限定并补一条多副本约束：日配额 PG 表必须用原子 UPSERT，不能读-改-写。V8 同步收窄 |
| 2026-09-01 修订 3 | ①修两处失效引用：`issue.md` 已被 spec-author 按 `docs/agents/issue-tracker.md` 重构为 `issues/01-*.md`…`08-*.md`，第 6 行与边界声明已改指 `issues/`；②**新增 §9.4 给频控存储收口**——接受队长三个落点，但替换其两条论证（详见 output），补上两边都没引的 `go-redis.md`:86「限流计数不是普通缓存、不能 fail-open」，并补出队长三分法漏掉的第四类（被动回复 60 分钟窗口）。V12 收口、拆出 V12′ |
| 2026-09-01 修订 2 | 通读队友已更新的 `spec.md` 后**自我更正两处**（我修订 1 写错了，不是补充）：①绑定流程**不是 OAuth 跳转而是绑定码**，spec.md 因「OAuth 回调域名需先备案并报备进 URL 白名单」明确否决了 OAuth——§3.2/§9.3 已改（结论不变：仍需过网关的浏览器端点）；②**§7 原先写的「以 `user_id` 调下游」正是 spec.md 禁止的做法**——其「身份边界」要求「不得自行拼装可信身份头」。§7 已重写并补上本仓 2026-08-19 的同类漏洞前科；V4 方向随之反转（从「未解」变为「已定：不是自证」） |

---

## 0. 证据分级约定

本文每条结论都标了来源。三档，请按不同置信度使用：

| 标记 | 含义 |
|---|---|
| 〔代码〕 | 我读了那个文件的那一段得出的，附 `文件:行号`。可直接依赖，但**核对时别用行号，用引文**（见下） |
| 〔真相源〕 | 来自 `.service-matrix.yaml` / `AGENTS.md` / `context/` 等被项目声明为真相源的文档 |
| 〔待验证 Vn〕 | **我的推断或外部事实，没有在本仓验证过。落地前必须自己确认** |

编号 V1–V13。其中 **V12 已收口**（§9.4 的四类分法），但它拆出的时延问题 **V12′** 仍开放，
因此**当前未决仍是 13 条**。第 12 节汇总成表。

⚠️ **怎么核对本文的引用：grep 引文，不要跳行号**
（2026-09-01 补入，由 spec-author 的一次实证促成）。

本文约五十处 `文件:行号` 都是 **2026-09-01 的快照**。被引文件（`structcheck_test.go`、
`go-redis.md`、`.service-matrix.yaml` 等）会继续演进，**行号必然漂移**。
真正危险的不是漂移本身，而是**行号碰撞给出的假确认**——
本轮真实发生过一次：某处措辞被引为「`spec.md`:97」，改动后该文件第 97 行**仍然存在**，
内容却已换成相反的结论；只跳行号去看，会得到「还在那儿」的错误印证。
（同一封信里 spec-author 报的行数 931，我几分钟后实测是 937——**连行数本身都在漂**。）

**所以核对方式是：拿本文引用的那句话去 `grep`，命中即成立，不命中就是已变，回头读上下文。**
行号只用来加速定位，不作为判据。这与本仓 [`live-facts.md`](../../context/team/live-facts.md)
的原则同构：**耐久的是不变量与查法，数字只是注解。**

**实测数字纪律**：按 [`context/team/live-facts.md`](../../context/team/live-facts.md)，
本文引用的集群运行时观测值一律注明出处与日期，不新造数字。我**没有连集群**，
所有集群数字都是从既有文档转引的二手值。

---

## 1. 结论摘要（先看这个）

### 1.1 接入模式：推荐 Webhook，但它只解决一半问题

**推荐 Webhook（HTTPS 回调），不推荐 WebSocket。** 一句话理由：
**k8s 集群没有可用的固定公网出口 IP，而 WebSocket 模式下入站和出站都依赖它；
Webhook 至少能把「入站」这一半接到本仓已经走通过很多次的 Pangolin 通路上。**

但必须先纠正一个容易乐观的判断——**选 Webhook 不等于绕过了 IP 白名单**：

| 方向 | 干什么 | 受不受 IP 白名单约束 |
|---|---|---|
| 入站 | 接收 QQ 事件 | Webhook：**不受**（是腾讯来连我们）<br>WebSocket：**受**（是我们去连腾讯） |
| 出站 | 取 AccessToken、发消息、调 OpenAPI | **两种模式都受** |

按队长核实的平台事实，正式环境的 IP 白名单同时管「连 WebSocket」和「调 OpenAPI」。
而**发消息必然要调 OpenAPI**——所以无论选哪个模式，只要上正式环境，
就必须有一个固定公网出口 IP。Webhook 把需要解决的问题从两个减到一个，**没有减到零**。

选 Webhook 的真实收益是三条，不是「不用管 IP 了」：

1. **入站复用零新增基础设施的成熟通路**：`qqbot.apikv.com` → node1 Pangolin → k8s 站点
   → cilium-gateway → HTTPRoute。这条路本仓有逐字的两步操作手册和三条验收判据
   〔真相源 [`context/team/pangolin-tunnel.md`](../../context/team/pangolin-tunnel.md):160-171, 200-217〕。
2. **无状态，可多副本**，直接满足集群的硬调度约束（见 §5）。
3. **不引入新的单活协调问题**。WebSocket 的 shard + session_id + seq 恢复是有状态的，
   而本仓「进程内定时任务多副本重复执行」这个坑目前是**被单副本掩盖着的**
   〔真相源 [`context/team/cron-jobs.md`](../../context/team/cron-jobs.md):27-33〕，
   叠加长连接选主会让第一版复杂度失控。

### 1.2 落位与门禁：加一个服务比看起来贵

`backend/services/qqbot/` 符合目录约定，但**把 qqbot 写进 `.service-matrix.yaml` 的
`services:` 段会一次性激活 12 道 structcheck 断言**，其中三道要求你去动
「已知不是集群真相源」的 `helm/`。完整清单见 §2，这是本方案最大的隐性成本。

### 1.3 三个最大阻塞点

1. **集群没有固定公网出口 IP**（§4）——决定成败，且本仓任何真相源都没记载它是什么。
2. **control-tower 的 Go 模块版本发不出来**（§3）——`routes/` 改了要升级依赖，
   但可用的 `v` 前缀 tag 只到 `v0.1.1`，而发布 tag 已经到 `0.2.8`，两套 tag 命名空间是分开的。
3. **事件推送链路整条不存在**（§8）——order 没有 outbox producer，NATS `used_by` 为空。
   「订单状态变更推 QQ」不是接线，是新建。

---

## 2. Q1 + Q2：服务落位与 `.service-matrix.yaml` 怎么改

### 2.1 骨架照抄谁：**payment**

`backend/services/qqbot/` 符合目录约定〔真相源 `.service-matrix.yaml`:23
`backend_service: "backend/services/{service}"`〕。

我读了 payment 的 `main.go`、`server/server.go`、`conf/v1/conf.proto` 和 `deploy/`，
**选它作骨架来源**，四条理由都能从代码验证：

1. **它是唯一「承接第三方服务端回调」的现役服务。** `HandlePaymentNotify` /
   `HandlePaymentCallback` 在匿名清单里，路由模板的注释写明「由支付宝服务端发起，
   不可能带我们的 JWT；可信性靠报文签名验证，不走网关认证」
   〔代码 `control-tower/routes/dev.yaml`:56-59〕。
   **这和 QQ Webhook 用 ed25519 签名自证、带不了我们 JWT 是同一个形状。**
2. **外部依赖形状最接近。** payment 是 `external: [postgres, alipay, config_center]`，
   不带 redis〔真相源 `.service-matrix.yaml`:224〕；qqbot 需要的是
   postgres + 第三方 + config_center，同形。
3. **它已经有「调下游但还没接线」的先例。** `depends_on_planned: [order]`
   〔真相源 `.service-matrix.yaml`:223〕，且 `internal/data/payment.go` 里成建制保留着
   被注释的跨服务 client 调用〔代码 `payment/internal/data/payment.go`:72,201,337,481,490〕。
   qqbot 的下游依赖是同一个待接线状态。
4. **它有独立的私有配置块。** `message Pay`〔代码 `payment/internal/conf/v1/conf.proto`:32-49〕
   就是 qqbot 该照抄的 `message QQBot` 的形状。

⚠️ 但 payment 有两处**不能照抄**：

- payment **没有 `deploy/*/vpa.yml`**（只有 behavior / cart / order 有，实查 2026-09-01：
  `services/{behavior,cart,order}/deploy/*/vpa.yml` 共 5 个文件）。VPA 对 qqbot 是可选的，
  但**一旦你给 qqbot 加 vpa.yml，就必须同步改 structcheck 的硬编码 map**（见 §2.2 第 12 条）。
- payment 的 `server.http.write_timeout` 是 5s。Webhook 接收器用这个值没问题，
  但**如果将来改用 WebSocket 或加长流接口，要记住 control-tower 那边踩过
  「`WriteTimeout` 掐断长流」的事故**〔真相源 `control-tower/AGENTS.md` 硬约束 2〕。

**建议端口 30012。** 现役端口实查 2026-09-01：user 30001 / search 30002 / product 30003 /
order 30004 / inventory 30005 / cart 30006 / merchant 30007 / payment 30008 /
address 30009 / behavior 30011，30010 被 Config Center 占用
〔真相源 `.service-matrix.yaml`:24 `config-center.config-center.svc:30010`〕。30012 是最小空位。

### 2.2 矩阵怎么填 + structcheck 到底校验什么（**我读了实现，没有猜**）

建议的矩阵条目：

```yaml
  qqbot:
    discovery: qqbot-service
    gateway_prefix: /qqbot*
    extra_config: [qqbot]
    depends_on: []
    depends_on_planned: [order, product, user]   # 见 §7，现在一条都没接线
    external: [postgres, redis, config_center]
    note: "QQ 开放平台事件入口。Webhook 由腾讯直接回调，不经 control-tower 网关；
      gateway_prefix 承载的是管理类 RPC，见 .scratch/qqbot-integration/wiring.md §3"
```

**structcheck 的完整断言清单**（`cd backend && go test -count=1 ./structcheck/...`，
我实跑过基线，当前 **ok，2.173s**，实测 2026-09-01）：

| # | 断言 | 位置 | 加 qqbot 后要做什么 |
|---|---|---|---|
| 1 | `discovery` 非空且全局唯一 | 〔代码 `structcheck_test.go`:213-219〕 | 填 `qqbot-service` |
| 2 | **`gateway_prefix` 非空且全局唯一** | 〔代码 `structcheck_test.go`:220-226〕 | **不能留空**，见 §3 |
| 3 | `depends_on` + `depends_on_planned` 只能指向 matrix 里已有的服务 | 〔代码 `structcheck_test.go`:227-231〕 | order/product/user 都在，OK |
| 4 | matrix ↔ `backend/services/` 目录**双向**对齐 | 〔代码 `structcheck_test.go`:186-205〕 | 建目录 + 写条目，缺一即红 |
| 5 | **每个 matrix 服务的前缀都必须在 control-tower 路由模板里有条目，且 target 的 discovery 名一致**；对 `dev` 和 `pre` **两个 env 各查一遍** | 〔代码 `structcheck_test.go`:241-275〕＋〔代码 `control-tower/routes/routes.go`:33 `Envs()` 返回 `["dev","pre"]`〕 | **这是 §3 的硬约束来源** |
| 6 | `anonymous_paths` 与路由模板的 `anonymous` 必须是**同一个集合** | 〔代码 `structcheck_test.go`:278-316〕 | Webhook 端点若走网关须两边同步；本方案不走，见 §3 |
| 7 | `externals.*.used_by` 点名的服务，代码里必须真的引用了它 | 〔代码 `structcheck_test.go`:151-183〕 | 别在 `used_by` 里写 qqbot 直到代码真的 import |
| 7b | **新增 external 必须在 `externalRefPatterns` 补一行**，否则直接报错 | 〔代码 `structcheck_test.go`:71-86, 169-174〕 | 若给 QQ 平台建 external 条目，**必须同步改 structcheck 源码** |
| 8 | 10 服务 `internal/pkg` 同名文件必须字节一致（原文或归一化服务名后） | 〔代码 `structcheck_test.go`:329-399〕 | 从 payment 复制 `internal/pkg` 时**只能改服务名**，不能顺手改逻辑 |
| 9 | `internal/pkg/config` 的生产 `.go` 文件集必须与 **cart** 完全一致 | 〔代码 `structcheck_test.go`:404-428〕 | 按 cart 而非 payment 对齐这个目录 |
| 10 | 四处部署清单（`Makefile` 的 `SERVICES` / `compose.yaml` / **`helm/values.yaml`** / `deploy/{dev,prod}`）都要覆盖 | 〔代码 `deploycheck_test.go`:267-335〕 | 四处都补；缺就得写进 `deployment_coverage.exceptions` 并说明原因 |
| 11 | 每个服务的 dev+prod `deployment.yaml` 必须满足：`serviceAccountName=ecommerce-qqbot`、`automountServiceAccountToken:false`、`enableServiceLinks:false`、suite-wide topologySpread、`CONFIG_SOURCE_FILE`、securityContext 全 1000、config-source 挂载 | 〔代码 `deploycheck_test.go`:340-432, 685-831〕 | 见 §10 |
| 11b | `helm/files/zero-trust.yaml` 必须有 `ServiceAccount ecommerce-qqbot` | 〔代码 `deploycheck_test.go`:470-475〕 | 补一个 SA（当前 13 个，实查 2026-09-01） |
| 11c | **`helm/charts/qqbot/charts/library-0.1.0.tgz` 必须存在且与源模板字节一致** | 〔代码 `deploycheck_test.go`:609-647〕 | **要造一个 chart 并 vendored 依赖**，见下方警告 |
| 12 | `deploy/*/vpa.yml` 的 target 必须在**硬编码 map** `ecommerceVPATargets` 里；`application-vpa.yml` 的文档数必须**等于**该 map 大小 | 〔代码 `vpa_test.go`:46-62, 64-99, 101-133〕 | **不加 vpa.yml 就不受影响**；加了就必须同时改测试源码 + `application-vpa.yml` |
| 13 | `configs/bootstrap.schema.json` 必须 `additionalProperties:false`，且顶层 `search` 只许 search 服务有 | 〔代码 `config_schema_test.go`:24-52〕 | 生成 schema 时注意 |
| 14 | `configs/` 下的 `config.yaml.example` / `dev.yml` / `pre.yml` 必须过 schema 校验 | 〔代码 `config_schema_test.go`:54-78〕 | 提交 example 即可（dev.yml 被 gitignore） |

> ⚠️ **最反直觉的一条**：第 11c 条强制 `helm/charts/qqbot/` 存在，
> 而 `AGENTS.md` 与矩阵都明确写着 **`helm/values.yaml` 不是集群真相源、GitOps 当前是断的**
> 〔真相源 `.service-matrix.yaml`:241-242, 269-272〕。
> 也就是说：**你必须在一条已知失效的部署路径上补齐产物，才能让门禁变绿。**
> 这不是 bug，是 `deployment_coverage` 刻意要求的全覆盖〔代码 `deploycheck_test.go`:302-319〕；
> 合法的减负出口是在 `deployment_coverage.exceptions.helm` 里写明原因，
> 但过期例外同样会被拦〔代码 `deploycheck_test.go`:322-332〕。**这个取舍要人来定，我不替你决定。**

---

## 3. Q3：网关接线 —— qqbot 到底需不需要 `gateway_prefix`

### 3.1 结论：业务上不需要，门禁上**必须有**

**业务判断**：QQ 的 Webhook 回调不该经 control-tower 网关。三条理由：

1. 它不是 Connect-RPC 调用，而是 QQ 平台定义的 HTTP POST；
   网关的路由是按**一级 proto 包名**匹配的〔代码 `control-tower/routes/dev.yaml`:6-7,
   代码 `structcheck_test.go`:259〕，一个非 proto 的回调路径根本套不进这个模型。
2. 它带不了我们的 JWT，走网关只能进匿名清单，而匿名清单每加一条都要
   matrix 与路由模板双向同步〔代码 `structcheck_test.go`:278-316〕——
   为一个不需要网关能力的端点付这份成本没有收益。
3. 它的可信性来自 ed25519 签名，必须在 qqbot 进程内校验；
   网关帮不上忙，反而多一跳。这与支付宝回调的处理完全同构
   〔代码 `control-tower/routes/dev.yaml`:56-57〕。

**门禁事实**：但 `gateway_prefix` **不能留空也不能省**——
`TestMatrixInternalConsistency` 对空值直接 `t.Errorf`〔代码 `structcheck_test.go`:220-222〕，
`TestGatewayWiringMatchesMatrix` 还要求它在 `dev` 和 `pre` 两份路由模板里都有对应条目
〔代码 `structcheck_test.go`:241-275〕。**`deployment_coverage.exceptions` 只管四处部署清单，
管不到 gateway**〔代码 `deploycheck_test.go`:303〕。

### 3.2 三个可选方案

| 方案 | 做法 | 代价 | 评价 |
|---|---|---|---|
| **A（推荐）** | 进 `services:` 段，给 `/qqbot*` 并在 control-tower 加 `package: qqbot → discovery:///qqbot-service` | 要发 control-tower 新版本（见 §3.3） | 前缀不白给：管理类 RPC（查 openid 绑定、手动重推、灰度开关）正好经网关给 admin 前端用 |
| **B** | 放 `backend/tools/qqbot/`，**不进** `services:` 段 | 拿不到 `internal/pkg` 那套现成基础设施（config/otel/registry/log），要自己搓；`TestWorkloadIdentityBaseline` 的 `extraDeployments` 也是硬编码 map〔代码 `deploycheck_test.go`:485-490〕，仍要改 structcheck | 参照 `outbox-relay`/`search-indexer`〔真相源 `.service-matrix.yaml`:72〕。**如果 qqbot 确实没有任何对外 RPC，这个方案更诚实** |
| **C** | 进 `services:` 段但给 structcheck 加 gateway 例外 | 动 harness ⇒ 按硬规则 5 必须在 `context/harness-framework/evolution-log.md` 补一条并写清触发事故 | 不推荐——现在没有「事故」可写 |

**我推荐 A，且这个前提现在已经落实了**（2026-09-01 据队友 spec-author 的平台调研更新）：

原先我把「qqbot 是否真的需要对外 RPC」列为待验证。现在它有确定答案——
**需要，而且是刚需**：openid ↔ 平台用户的绑定必须由一次**显式的、用户在 Web 端完成的动作**
建立（见 §9.3 性质 4），这就要求一个**浏览器发起、要过网关鉴权**的端点。

⚠️ **具体形态以 `spec.md` 为准，不是 OAuth 跳转**：spec.md「绑定流程」定的是**绑定码**方案——
用户在单聊发 `/绑定` → qqbot 回一次性绑定码 → 用户在 Web 端登录 Casdoor 后**提交绑定码**。
它明确**否决了 OAuth 跳转**，理由是「OAuth 跳转需要回调域名先备案并报备进 URL 白名单」，
而绑定码只需要用户已在使用的 Web 端〔来源 `spec.md`「为什么用绑定码而不是 OAuth 跳转」〕。
（备案完成后两者可并存。）

**这个差异不改变本节结论**：不管是 OAuth 回调还是「提交绑定码」，
都是浏览器发起、需要 JWT 的入站请求，都得过网关。所以 qqbot 有两条**性质完全不同**的入站路径，
`gateway_prefix` 不是为应付门禁而填的空壳：

| 入站路径 | 发起方 | 走不走网关 | 鉴权方式 |
|---|---|---|---|
| Webhook 事件回调 | 腾讯服务端 | **不走**，Pangolin 直达（§4.1） | ed25519 签名自证 |
| 提交绑定码 + 管理类 RPC | 浏览器 | **走**，`/qqbot*` | 网关 JWT + RBAC |

⚠️ **两者必须是不同端点，不要合并**：一个匿名+签名自证，一个要 JWT，
混在一起会逼你把 Webhook 路径塞进匿名清单，白白引入 §2.2 第 6 条的双向同步成本。

若将来证明连绑定流都不需要（纯只读播报型机器人），再退回方案 B。

### 3.3 「改路由模板必须同 PR 升级依赖版本」的可执行手顺 —— **这里有个真阻塞**

`AGENTS.md` 那句话的机制是：structcheck 直接 `import "github.com/lens077/control-tower/routes"`
〔代码 `structcheck_test.go`:23〕，读的是 **go.mod 锁定的模块版本**，不是隔壁工作树。

实查 2026-09-01：

- `ecommerce/backend/go.mod`:19 锁 `github.com/lens077/control-tower v0.1.0`；
- **无 `replace` 指令**（实跑 `grep replace go.mod` 空）；
- `go list -m` 解析到 `/Users/sumery/golang/pkg/mod/github.com/lens077/control-tower@v0.1.0`，
  **即模块缓存，不是 `/Users/sumery/lens077/control-tower` 工作树**。

⚠️ **阻塞点：两套 tag 命名空间是分开的，而 Go 能用的那套已经落后 7 个版本。**

实查 control-tower 的 tag：

- 裸 semver（CI/镜像发布用，`AGENTS.md` 写明「CI 仅由发布 tag 触发」）：`0.1.0` … **`0.2.8`**
- **`v` 前缀（Go 模块唯一认的格式）：只有 `v0.1.0`、`v0.1.1`**

也就是说，**今天你无法把依赖升到 `v0.2.x`，因为它不存在**。
好消息是 `routes/` 自 `v0.1.0` 起没有变过（实跑 `git diff v0.1.0 v0.1.1 -- routes/`
与 `git diff v0.1.1 HEAD -- routes/` 均为空），所以当前没有潜伏漂移，
我读的工作树 `dev.yaml` 与 structcheck 实际编译的 `v0.1.0` 内容一致。

**可执行步骤（按顺序，不能乱）**：

1. 在 control-tower 改 `routes/dev.yaml` **和** `routes/pre.yaml`，两份都加：
   ```yaml
     - package: qqbot
       target: discovery:///qqbot-service
       timeout: 4s
   ```
   两份都要改——structcheck 对 `Envs()` 的每个 env 都查〔代码 `structcheck_test.go`:248〕。
2. 在 control-tower 跑 `make verify`〔真相源 `control-tower/AGENTS.md` 验证锚点〕。
3. **打一个新的 `v` 前缀 tag**（如 `v0.1.2` 或 `v0.2.0`）并推到能被 `go get` 解析的远端。
   ⚠️ 这一步与「裸 semver 触发 CI 发布镜像」是**两件事**，别混：
   镜像发布要裸 tag，Go 依赖要 `v` tag。要两个都生效就得打两个 tag。〔待验证 **V6**：
   `v` tag 推到哪个远端才能被本仓 `go get` 解析——origin 是 GitLab、github 是另一个远端，
   我没有验证模块代理的解析路径〕
4. 回 ecommerce：`cd backend && go get github.com/lens077/control-tower@v0.1.2 && go mod tidy`
5. `cd backend && go test -count=1 ./structcheck/...` 必须绿。
6. 同 PR 提交 `.service-matrix.yaml` + `go.mod`/`go.sum`，**否则门禁红**。

> 顺带一个**已存在的小隐患**（不是 qqbot 引入的）：本仓锁 `v0.1.0`，
> 而 `v0.1.1` 已经存在。当前因 `routes/` 未变而无害，
> 但下次 control-tower 改了 routes 又只发裸 tag，本仓会毫无察觉地校验一份过期路由表。

---

## 4. Q4：接入模式选型（重点）—— 出口 IP 是决定性变量

### 4.1 两条路各自要什么

**Webhook 落地路径**（本仓已有逐字手册，成熟度高）：

```
腾讯 QQ 平台
   └─HTTPS 443─> node1  node1（腾讯云 Lighthouse，固定公网 IP）
                    Traefik 终止 TLS（*.apikv.com，ZeroSSL）
                    └─WireGuard 隧道─> k8s 站点 siteId 4
                          └─> cilium-gateway ClusterIP <现查>:443   # 曾为 10.99.145.85，已失效
                                └─HTTPRoute hostname 匹配─> qqbot Service
```

> ⚠️ **2026-09-01 订正**：上图与下条里的 ClusterIP **`10.99.145.85` 已失效**，
> 现值 `10.110.51.106`。**ClusterIP 会随 Service 重建而漂，不要抄任何历史值**，
> 建资源时现查（命令与完整说明见 `context/team/pangolin-tunnel.md`
> 的「cilium-gateway 的两个 IP」一节）。
> 同节还记录了另一个易错点：**LB IP `192.168.3.121` 是钉死的**
> （由 Service 注解 `io.cilium/lb-ipam-ips` 显式指定，不是碰巧没变），
> 与会漂的 ClusterIP 是两回事，混用是 Pangolin 资源 503 的常见原因。

- 端口满足 QQ 的 80/443/8443 限制：Pangolin 对外就是 **443**
  〔真相源 `pangolin-tunnel.md`:26-34, 164-165〕。
- 操作是两步：HTTPRoute 追加 hostname + 面板建资源，target **必须走 https 的 443**
  （ClusterIP 现查，见上方订正）〔真相源 `pangolin-tunnel.md`:160-171〕。
- ⚠️ 三条已付学费的坑，直接抄：
  1. **target 走 80 必然 404**——本仓 HTTPRoute 的 `parentRef` 都带 `sectionName: https`，
     80 上没有任何路由〔真相源 `pangolin-tunnel.md`:167-170〕。
  2. **面板建资源不要勾 Health Check**——28 个 target 里唯一开启的那个就因配置不全被判
     unhealthy 而 503，后端其实一直健康〔真相源 `pangolin-tunnel.md`:195-198〕。
  3. **建资源必须走面板/API，不能用 DB 后门**——`internalPort` 和 `authToken` 是运行时生成的
     〔真相源 `pangolin-tunnel.md`:176-182〕。
- ⚠️ 验收**必须跑三条**，只看 302/200 会误报「已上线」〔真相源 `pangolin-tunnel.md`:200-217〕。
- ⚠️ `qqbot.apikv.com` 这个域名**不能指向 node2**：`apikv.com` 未在阿里云备案，
  任何经该域名访问 `node2` 的请求都被网络层拦截（HTTP 403、HTTPS 在 SNI 后 reset）
  〔真相源 `pangolin-tunnel.md`:74-75〕。**Webhook 入口只能落 node1。**

**WebSocket 落地路径**：纯出站长连接，不需要任何入口——
但需要一个**在白名单上的固定公网出口 IP**。

### 4.2 出口 IP 的真实情况（**这是全文最关键的一段**）

我按队长要求专门论证 k8s 内网节点（192.168.3.101-103）的出口 IP：

**结论：本仓没有任何真相源记载 k8s 集群的公网出口 IP，且拓扑强烈提示它不固定。**

证据链：

- 三个节点是 `192.168.3.101/102/103`，全 arm64 / Ubuntu 26.04
  〔真相源 [`local-env.md`](../../context/team/local-env.md):38-40〕。
- `192.168.3.0/24` 是一个**带 DHCP 的家用/办公局域网**：
  `DHCP 192.168.3.2-20` 由**路由器**动态分配，Cilium LB 池占 `.100-199`，
  静态只有 `.101 .102 .103 .220`〔真相源 `local-env.md`:121-125〕。
- 这个网段出公网必然经该路由器 NAT。**本仓所有文档都没写这个路由器的 WAN IP**
  （我 grep 过 `出口 IP`/`egress`/`NAT`/`公网 IP` 全库，只命中 node3 的出口 IP，见下）。
- 反证：集群自己出网是**不稳定**的——节点 containerd 依赖
  `192.168.3.220:7890`（那台 Mac 上的代理）拉镜像，「Mac 关机 = 全集群拉不了新镜像」
  被明确记为「真实单点」〔真相源 `local-env.md`:164-170〕。
  一个把出网代理挂在开发者笔记本上的网络，不适合承诺「固定出口 IP」。

**对比：项目里已知固定的公网 IP 有三个**，且已经有一次踩过 IP 白名单的先例：

| 主机 | 公网 IP | 性质 | 与 k8s 的关系 |
|---|---|---|---|
| node1 | `node1` | 腾讯云 Lighthouse，固定 | 无关；是 Pangolin 入口 |
| node2 | `node2` | 阿里云，固定 | **与 k8s 集群无关**〔真相源 `.service-matrix.yaml`:76〕 |
| node3 出口 | `<node3-egress-ip>` | NAT 后云主机的出口（**实测 2026-08-29**） | 无关；`10.10.21.172`，与 `192.168.3.0/24` **不互通**〔真相源 `local-env.md`:42-43〕 |

> **先例值得抄**：企业微信告警接入那条待办明确写着
> 「**必须配「企业可信IP」= node3 出口 IP `<node3-egress-ip>`（2026-08-29 实测）**，
> 不配则 API 报 `not allow to access from your ip`，且**该错误只在日志里，界面无感知**」
> 〔真相源 [`docs/todo/统一可观测性体系.md`](../../docs/todo/统一可观测性体系.md):203-205〕。
> **这是本仓已经踩过的同类坑**：第三方平台的 IP 白名单 + 静默失败。
> qqbot 会以完全一样的方式失败，请提前把「白名单没配」列进排查清单第一条。

### 4.3 那到底要不要把 qqbot 落到 node2？

**推荐：不落 node2，但也不要让 qqbot 直接从集群出网。**

- 落 node2 的代价被低估了：node2 是 **x86_64**，而集群全 **arm64**
  〔真相源 `local-env.md`:38；`.service-matrix.yaml`:76 与 `pangolin-tunnel.md`:63〕。
  落 node2 意味着这个服务脱离 k8s、脱离 `deploy/` 手工路径、脱离 topologySpread 约束、
  还要单出一份 x86 镜像——它会变成第 11 个「不在任何部署清单里」的工作负载。〔待验证 **V9**〕
- 更小的改动是**只把「出站」固定住**，让 qqbot 仍然是集群里的普通服务：
  让 qqbot 调 `api.sgroup.qq.com` 时经 node1 或 node2 上的正向代理出去，
  白名单填那台机的固定 IP。这样入站（Pangolin→集群）与出站（集群→代理→QQ）
  都落在已有的 node1 隧道拓扑上，qqbot 本身仍受 `deploy/` 与 structcheck 管辖。
  〔待验证 **V1**、**V2**——这条方案成立的前提是「白名单确实按出口 IP 判定」
  且「代理链路可用」，我都没有实测〕

**如果 V1 结论是「家宽 IP 实际长期不变」**，那 WebSocket 也能跑，但我仍不推荐——
理由是 §5 的有状态性，以及「家宽 IP 不变」是运气不是保证，
它会在某次运营商续租后静默失效，失败形态与上面那条企业微信坑一模一样。

---

## 5. Q5：副本数与有状态性

### 5.1 Webhook 模式：无状态，可多副本，**而且必须能多副本**

集群有一条**硬调度约束**：所有带 `app.kubernetes.io/part-of: ecommerce` 的 Pod
共同参与 hostname 维度的打散，`maxSkew=1` 且 `whenUnsatisfiable: DoNotSchedule`
〔真相源 `.service-matrix.yaml`:39-46；由 〔代码 `deploycheck_test.go`:705-740〕 强制〕。
矩阵里那句注释说得很直白：「10 个单副本 API 必须**跨服务共同计数**」〔真相源 `.service-matrix.yaml`:38〕。

Webhook 接收器天然无状态（每个回调独立、幂等由 §9 的 Postgres 兜底），
副本数可以自由取 1 或 2，不引入新问题。

### 5.2 WebSocket 模式：能多副本，但要自己造一套单活/分片协调

- 官方分片公式 `shard_id = (guild_id >> 22) % num_shards` **只对频道（guild）定义**。
- **群 / 单聊（C2C）事件如何在多 shard 间分布，我无法从本仓或队长给的事实中确定。**
  〔待验证 **V3**〕
  我的推断：`GROUP_AND_C2C_EVENT` 这类事件没有 `guild_id`，
  大概率**全量投递到每个 shard**或**只投递到 shard 0**——
  两种可能对应的去重成本完全不同（前者必须靠 §9 的 `msg_id` 幂等表挡住 N 倍重复）。
  **这条必须在沙箱环境实测两个 shard 各收到什么，不能靠推断上线。**
- 即使分片解决了，还剩 `op=6 Resume` 需要持久化 `session_id + seq`。
  按 §9 的存储纪律，这两个值**不能放 Redis**（不是可丢缓存，丢了会漏事件），
  要落 Postgres——于是长连接进程变成有状态的。
- 本仓对「多副本重复执行」的既有判断：三种解法按成本排序是
  **K8s CronJob > 固定单副本 worker > 分布式锁**，且「**锁是优化，幂等是底线**」
  〔真相源 `cron-jobs.md`:36-46〕。若真要上 WebSocket，
  对应的是第 2 种「独立 worker 副本数固定为 1」，代价是它自己的可用性要单独考虑
  〔真相源 `cron-jobs.md`:39-40〕——而**单副本又与上面 `maxSkew=1` 的 suite-wide 打散共存**，
  这一点没有冲突（单副本也参与计数），但可用性就只有一个 Pod。

**结论**：Webhook 让副本数这个问题**消失**；WebSocket 让它变成三个新问题
（分片语义未知、Resume 状态要持久化、单活协调）。这是我推荐 Webhook 的第三条理由。

---

## 6. Q6：配置与凭据

### 6.1 现行机制（读代码得出）

- 每个服务从**挂载的 selector 文件**自举，再去 Config Center 拉完整 Bootstrap：
  `configs/source.dev.yaml`（**被 gitignore**，实查 `git check-ignore` 命中
  `configs/.gitignore:10`）内容形状为
  `type: config_center` + `config_center.{address, namespace, environment, key, service_token}`
  〔代码 `payment/configs/source.yaml.example`〕。
- 键的约定：`config_center_key: "{service}/{env}/bootstrap.yaml"`
  〔真相源 `.service-matrix.yaml`:32〕，即 **namespace=服务名、environment=env、key=bootstrap.yaml**。
  Config Center 侧的唯一约束是 `UNIQUE (namespace, environment, key)`
  〔代码 `control-tower/services/config/internal/data/migrations/00001_baseline.sql`:8-21〕。
- K8s 里 selector 由 Secret 投射：Secret `ecommerce-config-source-{env}`，
  只投射自己那一项 `{service}.yaml`，挂到 `/etc/ecommerce/config-source`，
  env `CONFIG_SOURCE_FILE` 指向它
  〔真相源 `.service-matrix.yaml`:33-35；由〔代码 `deploycheck_test.go`:775-831〕强制〕。
- ⚠️ **当前只有 `dev` 一个环境，集群跑的也是 `dev`**
  〔真相源 `local-env.md`:55-58，实测 2026-08-29：`config.entry` 共 15 个 key，
  `environment` 唯一取值 `dev`〕。别按 `pre` 规划。

### 6.2 qqbot 的键名清单（**只有键名，无真值**——硬规则 4）

**一个 Bootstrap 键**（与其他 10 个服务同构）：

```
namespace=qqbot  environment=dev  key=bootstrap.yaml     is_secret=true
```

凭据作为 `bootstrap.yaml` **内部的字段**，不另开 key（与 payment 的 `pay.alipay.*` 同构
〔代码 `payment/internal/conf/v1/conf.proto`:37-49〕）。对应的 proto 块：

```proto
// backend/services/qqbot/internal/conf/v1/conf.proto
message Bootstrap {
  Server        server        = 1 [(buf.validate.field).required = true];
  Data          data          = 2 [(buf.validate.field).required = true];
  Observability observability = 4 [(buf.validate.field).required = false];
  Discovery     discovery     = 5 [(buf.validate.field).required = false];
  Log           log           = 7 [(buf.validate.field).required = true];
  QQBot         qqbot         = 8 [(buf.validate.field).required = true];
}

message QQBot {
  string app_id      = 1;  // 明文，非密
  string app_secret  = 2;  // 密
  string token       = 3;  // 密；用于 Webhook ed25519 校验
  string api_base    = 4;  // https://api.sgroup.qq.com 或 sandbox
  string webhook_path = 5; // 回调路径
  uint32 intents     = 6;  // 位掩码
  bool   sandbox     = 7;
}
```

**配置键的路径清单**（写进 Config Center 的 `bootstrap.yaml` 内部）：

| 配置路径 | 密否 | 说明 |
|---|---|---|
| `qqbot.app_id` | 否 | |
| `qqbot.app_secret` | **是** | 换 AccessToken 用 |
| `qqbot.token` | **是** | Webhook 签名校验 |
| `qqbot.api_base` | 否 | 正式/沙箱切换 |
| `qqbot.webhook_path` | 否 | |
| `qqbot.intents` | 否 | |
| `qqbot.sandbox` | 否 | |

⚠️ **三条必须遵守的纪律**：

1. **必需性的唯一真相源是 conf.proto 的 `(buf.validate.field).required`，
   不要在矩阵里重复声明**〔真相源 `.service-matrix.yaml`:9-10, 48-52〕。
2. **`ErrorUnused` 是开着的**：Config Center 里出现 conf.proto 未定义的键
   会让服务**直接起不来**；热更新校验失败则保留旧配置只记 ERROR
   〔真相源 `.service-matrix.yaml`:54-58〕。behavior 就踩过这个
   〔真相源 `.service-matrix.yaml`:59-64〕。
3. **非机密条目必须 `is_secret=false`**〔真相源 `.service-matrix.yaml`:127〕；
   `is_secret` 是 `config.entry` 的真实列〔代码 `00001_baseline.sql`:16〕，
   读接口按它脱敏〔代码 `control-tower/services/config/internal/service/config.go`:145〕。

**仓库里要提交的**：只有 `configs/source.yaml.example`（`service_token: ""`）
和 `configs/config.yaml.example`；`source.dev.yaml` 与 `dev.yml` 走 gitignore。

---

## 7. Q7：依赖的下游 —— 走 Connect-RPC，但**现在没有任何先例可抄**

**现状（读代码得出，与矩阵一致）**：

- 我 grep 了 `backend/services/`、`backend/tools/`、`backend/pkg/` 下所有
  `connect.NewClient` 与各服务的 `New*ServiceClient`，**零命中**。
- 矩阵自己也写明：「服务间调用几乎全未接线：10 个服务的 `depends_on` 当前均为空；
  order/payment 只有 `depends_on_planned`」〔真相源 `.service-matrix.yaml`:263〕。

**所以「照做」是照不了的——没有活的样例。** 唯一的形状参考是 payment 里
成建制注释掉的跨服务调用〔代码 `payment/internal/data/payment.go`:72,201,337,481,490〕。

**方案：走 Connect-RPC 直连，不经网关。** 理由：

1. 网关的职责是**南北向**：JWT 验签、RBAC、剥离并重注入身份头、BFF session、CORS
   〔真相源 `.service-matrix.yaml`:118-141〕。服务间东西向调用经它是多一跳且语义错位。
2. 服务发现是现成的：Consul 只承担注册发现〔真相源 `.service-matrix.yaml`:70〕，
   网关自己也是用 `discovery:///<注册名>` 解析后端〔代码 `control-tower/routes/dev.yaml`:14-49〕。
   qqbot 用同一套 `discovery:///order-service` 即可。
3. 后端服务本来就是 Connect 处理器 + h2c〔代码 `payment/internal/server/server.go`:9-21,44-50〕，
   直连不需要新增传输层。

**矩阵怎么写**：接线前一律进 `depends_on_planned`，**不要**写进 `depends_on`——
矩阵第 2 条纪律明确「`depends_on` = 代码里真的接线了」〔真相源 `.service-matrix.yaml`:8〕。

⚠️ **身份传递：这里有一条 `spec.md` 定下的硬边界，会直接改变上面的传输选型。**

两步要分清：

1. **解析身份**：qqbot 先把 openid 换成本地 `user_id`（查 §9.2 的 `identity_binding`）。
   换不到就是未绑定态，走引导绑定流、不调下游。
   **不要把 openid 直接往下游传**——它是 per-bot 的，下游无从解释（§9.3）。
2. **调用下游**：**不得由 qqbot 自行拼装可信身份头。**
   `spec.md`「身份边界」明确：「`qqbot` 自身不是用户身份的来源……
   调用下游时必须走与 Web 端相同的授权判定路径，不得自行拼装可信身份头」。

**为什么这条约束是对的**（本仓有前科）：后端把网关注入的 `x-md-global-user-id`
当**可信身份**用〔代码 `services/behavior/internal/service/behavior.go`:87〕，
而网关之所以可信，是因为它**无条件剥离入站的 `x-md-global-*` 再按验签重注入**
——此前只 Set 不 Del，导致免鉴权路径上客户端可自称任何人
〔真相源 `docs/progress-archive/2026-08-21-todo-evidence.md`，2026-08-19 鉴权链路改造记录〕。
**若 qqbot 绕过网关直连下游并自行注入该头，等于把那个已修复的漏洞按服务重开一次。**
而且后端信任边界目前**没有 NetworkPolicy 全面强制**〔真相源 `.service-matrix.yaml`:268〕，
没有任何机制会拦住它。

**因此本节开头的「Connect 直连不经网关」需要附加条件**：
直连只适用于**不代表某个具体用户**的调用（如查商品公开信息）。
凡是代表用户的调用（查我的订单），必须走与 Web 端相同的授权路径——
具体形态（qqbot 作为 BFF 持用户令牌？还是经网关转发并由网关注入身份？）
本仓没有既有实现可抄，仍归〔待验证 **V4**〕，但**方向已经确定：不是自证**。

---

## 8. Q8：事件流 —— **现状是「整条不存在」，不是「接一下就好」**

### 8.1 现状（必须和「需新建」分清）

| 事实 | 依据 |
|---|---|
| Kafka `used_by: []`，本仓**无客户端、producer、consumer 或业务接线** | 〔真相源 `.service-matrix.yaml`:71〕 |
| NATS `used_by: []`；**search 服务本身不导入 nats**，导入方是 `backend/tools/{search-indexer,outbox-relay}` | 〔真相源 `.service-matrix.yaml`:72〕 |
| 已部署链路只有：Postgres outbox → NATS JetStream → search indexer → Meilisearch | 〔真相源 [`events/INDEX.md`](../../context/project/ecommerce/events/INDEX.md):11〕 |
| **Product/Order 未导入 outbox producer；无 consumer Inbox 表；无 DLQ** | 〔真相源 `.service-matrix.yaml`:264-266〕 |
| `search` 的 note 直说「Product Service 事务内 outbox 生产者**尚未接线**」 | 〔真相源 `.service-matrix.yaml`:163〕 |
| order 服务 `external: [postgres, redis, config_center]`——**没有 nats/kafka** | 〔真相源 `.service-matrix.yaml`:203〕 |

**结论：「订单状态变更触达 qqbot」当前一条边都没有。** 需要新建的是：

1. order 侧的 outbox 表 + **业务写与 outbox insert 同事务**（这是不可破坏的不变量第 1 条
   〔真相源 `events/INDEX.md`:23〕）；
2. 一个 order 专用的 relay（或给现有 `outbox-relay` 加 `-table orders.outbox` 实例——
   它本来就是按表名参数化的〔代码 `tools/outbox-relay/main.go`:34〕）；
3. qqbot 侧的 **durable consumer + 持久 Inbox 表**（不变量第 3 条：
   「consumer 必须按稳定 `event_id` 幂等；缓存和 JetStream duplicate window
   **不能**替代持久 Inbox」〔真相源 `events/INDEX.md`:25〕）。

### 8.2 可抄的参照

`backend/tools/outbox-relay/main.go` 是最好的模板，形状清晰：
`pgxpool` + `nats.Connect` + `jetstream.New` + `outbox.EnsureStream` + `Relay.Run`
〔代码 `tools/outbox-relay/main.go`:48-84〕；单活靠**按表名抢 PG 咨询锁**
〔代码 `tools/outbox-relay/main.go`:1-4 的包注释〕。

⚠️ 两条会咬人的事实：

- **relay 收到 PubAck 后、数据库 commit 前崩溃会重投**；`Nats-Msg-Id` 只在 broker
  duplicate window 内去重〔真相源 `events/INDEX.md`:16〕。**qqbot 必须自己幂等**——
  这直接推出 §9 的设计。
- 目标态是 Kafka，NATS 只是「退役完成前的存量迁移组件」
  〔真相源 `events/INDEX.md`:7〕。新接的消费者要藏在接口后，别把 JetStream 类型漏进业务层。
  〔待验证 **V7**：现有 `ECOMMERCE_EVENTS` 是 R1，交易域要求 R3
  〔真相源 `.service-matrix.yaml`:72；`cron-jobs.md` 相关段〕，
  订单推送算不算交易域、要不要升副本，我没有定论〕
- 〔待验证 **V8**〕order 是否会真的新增 outbox——这不在 qqbot 的控制范围内，
  是个跨任务依赖。**在它落地前，qqbot 的主动推送只能靠轮询 order 的读接口兜底。**

### 8.3 频控是设计约束，不是运维细节

队长给的平台事实里，主动消息限额很紧（单聊 10/qps、群 60/qpm、单关系 20/qpm、
每日 1000 条/用户或群）。这意味着**消费者不能是「收到事件就发」**——
必须有按 openid/group_openid 维度的令牌桶 + 超限降级。
**降级顺序不由本文定**——`spec.md`「频率预算与降级」已给出三档（延迟发送 → 合并发送 →
丢弃并记录，且**交易通知不得丢弃**），按它执行；本文只管这些配额状态存哪（§9.4）。
配额状态该放 Dragonfly 还是 Postgres**已按四类分法收口，见 §9.4**
（原 V12 的存储选型部分已关闭）。

〔仍待验证 **V12′**：被动回复的 `msg_id` 只有 5 分钟有效，
异步链路（事件→consumer→发消息）的端到端时延必须压在这个窗口内，否则只能走主动消息通道。
这一半是时延问题，不是存储问题，需要压测〕

---

## 9. Q9：幂等与状态存储

### 9.1 硬边界：Redis 不能碰这两类数据

矩阵对 Redis/Dragonfly 的定性是明确的：
「业务服务**只放可丢缓存，不得承载锁、幂等键或领域真相**；
control-tower gateway 的 BFF session 是**已接受的例外**，依赖不可用时 fail-closed」
〔真相源 `.service-matrix.yaml`:69〕。

所以：

| 数据 | 放哪 | 为什么 |
|---|---|---|
| QQ `msg_id` / `msg_seq` 去重键 | **Postgres** | 幂等键，明确禁止放 Redis |
| `openid` ↔ 本系统用户 ID 绑定 | **Postgres** | 领域真相；且 openid 无法反查 QQ 号，这张表是唯一映射来源，丢了不可重建（见 §9.3） |
| WebSocket 的 `session_id` + `seq`（若选 WS） | **Postgres** | 丢了会漏事件，不是可丢缓存 |
| AccessToken 缓存 | **Redis 可以** | 真正的可丢缓存——丢了重新取一次即可，无副作用 |
| 频控计数器（秒～分钟窗口、被动回复窗口） | **Dragonfly 可以** | 有平台拒绝兜底，我们的计数只是优化；详见 §9.4 |
| 日配额（每日 1000 条）与**互动召回「已发过」记录** | **Postgres** | 前者 24 小时不自愈；后者平台**不替你拦**，是领域真相／幂等键。详见 §9.4 |

### 9.2 库与 schema

- 库是 `db=ecommerce`，**每服务独立 schema**〔真相源 `.service-matrix.yaml`:68〕。
- 现役写法（我读了迁移文件）：每个服务第一条迁移 `CREATE SCHEMA IF NOT EXISTS <名>`，
  **且不写 `SET search_path`，对象全部显式限定**
  〔代码 `payment/internal/data/migrations/00001_payments.sql`:6-7；
  product/order/behavior/address/inventory 同形，实查 6 处〕。
  原因是 `SET search_path` 会让**版本表解析失败**
  〔代码 `tools/dbmigrate/main.go`:184-185〕——这是双保险之一，别加回来。
- 建议 schema 名 `qqbot`，迁移文件 `backend/services/qqbot/internal/data/migrations/00001_qqbot.sql`。

建议的三张表（形状建议，非强制）：

```sql
CREATE SCHEMA IF NOT EXISTS qqbot;

-- 入站去重：QQ 事件与消息
CREATE TABLE qqbot.inbound_dedup (
    msg_id       TEXT        NOT NULL,       -- QQ 的 msg_id / event_id
    event_type   TEXT        NOT NULL,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (msg_id, event_type)
);

-- 领域事件消费 Inbox（events/INDEX.md 不变量 3 要求持久 Inbox）
CREATE TABLE qqbot.inbox (
    event_id     TEXT        PRIMARY KEY,    -- 稳定 event_id，不是 NATS 序号
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- openid ↔ 平台用户绑定（领域真相；必须经一次显式 OAuth 绑定动作才能建立）
--
-- ⚠️ app_id 必须进主键：openid 是 per-bot 维度的标识（见 §9.3）。
--    换 AppID（沙箱↔正式、或将来第二个机器人）就是另一套命名空间，
--    不带 app_id 会让旧绑定在换 bot 后静默错配到别人身上。
CREATE TABLE qqbot.identity_binding (
    app_id       TEXT        NOT NULL,       -- openid 的命名空间限定符
    scope        TEXT        NOT NULL,       -- c2c / group / guild，三者命名空间互不相通
    openid       TEXT        NOT NULL,       -- 该 (app_id, scope) 下的用户标识
    user_id      UUID        NOT NULL,       -- 平台用户，与 order/payment 的 user_id 同型
    bound_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (app_id, scope, openid)
);
```

`user_id` 用 `UUID` 是照现役写法：order `user_id UUID`、payment `consumer_id UUID`、
cart `user_id UUID`〔代码，实查三处迁移文件〕；网关注入的可信身份头是
`x-md-global-user-id`〔代码 `backend/constants/meta.go`:13，behavior 侧用法见
`services/behavior/internal/service/behavior.go`:87「网关注入的是可信来源，
优先级高于请求体里的 anon_id」〕。

⚠️ Inbox 的写入**必须与业务副作用原子提交**〔真相源 `events/INDEX.md`:34〕。
但「发 QQ 消息」是**外部副作用，无法进事务**——按 P0 验收的措辞，
这类必须「具备幂等键或补偿」〔真相源 `events/INDEX.md`:34〕。
落地形状：先在事务里占位 Inbox 行（标 `pending`）→ 发消息 → 更新为 `done`；
崩在中间靠 `msg_seq` 让 QQ 侧去重。

### 9.3 openid 的四条性质，以及它们各自逼出什么设计

> 来源：队友 **spec-author** 的平台侧调研，经队长转交（2026-09-01）。
> 我没有独立验证平台行为，按〔待验证 **V13**〕对待；
> 但「所以数据该怎么存」这部分的约束来自本仓真相源，是确定的。
>
> ⚠️ **别把交叉引用当成交叉验证**（spec-author 自己提出的提醒，我认为很重要）：
> 这三条平台事实**只有一个来源，且该来源未经核实**。现在 `spec.md` 与本文互相引用，
> 读起来像两份文档独立佐证了同一件事——**实际上是同一条未验证信息被复述了两遍**。
> 本节下面的推理写得很具体（表结构、绑定流、`scope` 维度），
> 那是**在假设成立前提下**的推理严谨，不代表假设本身被验证过。
> **不要让实现依赖「群/单聊 openid 不通用」这个前提，直到 V13 被实测确认。**

**性质 1：openid 不是 QQ 号，而且无法反查 QQ 号。**
→ 你**拿不到**任何跨系统可复用的用户标识。这直接否掉一个很容易顺手写出来的错误设计：
「用 QQ 号当外部主键去 join 平台用户」。唯一可行的是本地维护映射表，即上面的 `identity_binding`。

**性质 2：openid 是 per-bot（按 AppID）维度的。**
→ `app_id` 必须进主键（已在上面修正）。两个具体后果：
- **沙箱与正式是两套绑定数据**。§4.3 建议「先在沙箱跑通功能」，
  那批沙箱绑定**不能**迁到正式，上线时是空表起步。规划灰度时要算进去。
- 将来若要多机器人（例如 ToDo / mcm 各自一个 bot），映射表天然按 `app_id` 分区，
  不需要重构——但前提是现在就把这一列建出来。

**性质 3：群内成员标识（`group_openid` 维度）与单聊 openid 不是同一个命名空间。**
→ **同一个自然人在单聊和在群里是两个不同的 openid，绑定不互通。**
这不只是存储问题，它有一个必须让产品侧知道的后果：
**用户在私聊里绑定过账号，机器人在群里 @ 到他时仍然认不出他**，需要再绑一次
（或走「群内提示 → 私聊完成绑定 → 回群继续」的引导流）。
`scope` 列就是为此存在的；查询时**必须带 `scope` 一起查**，
只按 `openid` 查会在跨场景时返回错误的人。

**性质 4（由前三条推出）：绑定必须由一次显式的用户动作建立，不能靠推断。**
→ 系统里必然存在「已识别但未绑定」的中间态。设计上要求：
- 所有面向用户的能力都要能在**未绑定态**下给出合理响应（引导绑定，而不是报错或静默失败）；
- 绑定入口需要一个浏览器可达、过网关鉴权的端点。**这正是 §3.2 方案 A 里
  `gateway_prefix` 的第一个真实用途**——它与 Webhook（腾讯直连、不过网关）
  是两条完全不同的入站路径，**别混在一个端点上**。
- 具体是「提交绑定码」而非 OAuth 回调，见 §3.2 的说明与 `spec.md`「绑定流程」。

> **对 §7 的回填（已按 `spec.md` 修正，见下方⚠️）**：
> qqbot 必须先把 openid 换成本地 `user_id`（查 `identity_binding`）才能代表用户做事；
> 换不到就是未绑定态，直接走引导流、不调下游。
>
> ⚠️ **但「换到了之后怎么调下游」不能由 qqbot 自行拼装身份头。**
> `spec.md`「身份边界」写得很明确：「`qqbot` 自身**不是**用户身份的来源。
> 它持有的是『哪个 openid 对应哪个平台用户』，调用下游时必须走与 Web 端相同的授权判定路径，
> **不得自行拼装可信身份头**」。
> 这条把 V4 从「未解问题」变成了「已定的约束」，而且方向与我初稿相反——
> 我原先写「以该 `user_id` 调下游」，那正是被禁止的做法。**§7 已同步更正。**

### 9.4 频控与配额状态放哪（V12 收口）

> 收口过程：我提出顾虑 → spec-author 提「保守降级 ⇒ 可放 Dragonfly」→ 队长裁决「按窗口长度拆三类」
> → 本节。**三个落点结论我全部接受**，但队长的两条论证需要替换，且三分法漏了一类。
> 理由如下，都有本仓真相源支撑。

#### 先补一条两边都没引的规则：本仓对「限流计数」已有明文规定

[`context/team/go-redis.md`](../../context/team/go-redis.md):86 直接点名了这个类别：

> 「缓存是否允许 fail-open 取决于数据语义。商品详情等派生缓存可以回源；
> **Session、限流计数和锁不是普通缓存**，Redis 故障时不能假装未命中后绕过安全或一致性约束。」

**这条把 spec-author 的「保守降级」从一个提议升格成本仓既有规则**——
Redis 不可用时限流计数**必须 fail-closed**，不是可选设计。他的方向是对的，只是没引到出处。

#### 反驳一：「丢失只会少发」方向错了，会多发

这是 spec-author 的原始论证，队长在裁决里继承了它（「配合保守降级只会少发」）。
**它把两个必须分开的事件混成了一个**：

| 事件 | 代码里长什么样 | 能否 fail-closed | 实际后果 |
|---|---|---|---|
| Redis **不可用** | 连接/超时 `error` | **能**——按 go-redis.md:86 必须 | 少发 ✓ |
| 键**被淘汰或过期** | `redis.Nil` | **不能** | **多发** ✗ |

关键在于 `redis.Nil` **是正常结果不是故障**〔真相源 `go-redis.md`:49-57, 78〕——
它和「这个窗口刚开始、一条都还没发」**在代码里完全无法区分**。
计数器被淘汰后读出的就是 0，于是我们认为配额全新、放开发送。
**你没法对一个自己检测不到的事件做保守降级。**

而且淘汰不是假设：`go-redis.md`:13 要求「Session 实例 `noeviction`、
业务 Cache 实例 `allkeys-lru`、**限流实例独立**」，但同一句紧接着写
「**当前仍有单实例存量，迁移完成前不得把它描述为已隔离**」。
也就是说**今天把计数器放上去，它就落在 `allkeys-lru` 的共享实例上，内存压力下会被静默淘汰**。
同一份文档还写过「业务 Cache 实例采用可驱逐策略，**锁键可能消失**」〔真相源 `go-redis.md`:189〕。

**所以短窗口计数放 Dragonfly 仍然可以，但真正兜底的不是我们的计数器，是平台自己的拒绝。**
我们的计数只是「避免把配额浪费在必然被拒的请求上」的优化。这个定性必须写清楚，
否则下一个人会以为计数器是权威，进而在它之上建别的不变量。

#### 反驳二：「按窗口长度」是代理指标，真判据是两条正交测试

窗口长度能解释队长的三个结论，但解释不了**为什么**，也覆盖不了新情况。真正起作用的是两条：

1. **有没有外部权威兜底？**——平台会不会替你拦住错误？
   有 ⇒ 我们的状态只是优化，可以放缓存；无 ⇒ 我们的记录**就是唯一权威**，属领域真相，必须 PG。
2. **丢失后多久自愈？**——决定「被平台拒绝」这件事的损害有多大。
   秒/分钟 ⇒ 损害有界；小时/天 ⇒ 一次丢失毁掉整个窗口。

**任一条不满足就落 PostgreSQL。** 这样三个结论都能推出来，而且**多推出一类队长漏掉的**——
但请先看清楚：**下表第二行是这条规则唯一的、有代价的例外，不是规则的直接应用**（理由见表后）。

| 配额维度 | 窗口 | ①外部权威 | ②自愈 | 落点 |
|---|---|---|---|---|
| 单聊 10/qps、群 60/qpm、单关系 20/qpm | 秒～分钟 | ✅ 平台拒并返错误码 | ✅ 秒级滚过 | **Dragonfly** |
| **被动回复：单聊 60 分钟/4 次、群 5 分钟/5 次** | **5～60 分钟** | ✅ 超限返 `40034128` | ⚠️ **最长 60 分钟** | **Dragonfly**，但见下方⚠️ |
| 每日 1000 条/用户或群 | 24 小时 | ✅ 平台拒 | ❌ 不自愈 | **PostgreSQL** |
| 互动召回 4 个窗口各 1 条 | 最长 30 天 | ❌ **平台不拦** | ❌ 不自愈 | **PostgreSQL** |

⚠️ **第二行就是队长三分法漏掉的一类**：被动回复窗口既不是「秒/分钟级、丢了几秒自愈」，
也不是「每日」。按裁决的字面分类它会被归进第一档，然后套用「丢了几秒自愈」这句
——**而它实际最长要错 60 分钟**。结论仍是 Dragonfly（有平台兜底、写入频繁、
落 PG 会给每条被动回复加一次写），但**必须显式接受「最长 60 分钟的错窗」并对
`40034128` 单独计数告警**，不能靠那句不成立的理由蒙混过去。

⚠️⚠️ **但必须说清楚：这一行是规则的例外，不是规则推出来的结果**
（2026-09-01 经 spec-author 指出补正——原文只给了成本论证，没标明它违反规则）。
按上面「任一条不满足就落 PostgreSQL」的字面，测试②是 ⚠️ 就该落 PG；
它之所以仍放 Dragonfly，是一个**有代价的工程取舍**：被动回复写入频繁，
落 PG 等于给每一条被动回复加一次数据库写，代价大于它换来的正确性。

**所以不要照着这一行去推别的配额。**「你看被动回复②不满足也放了缓存，我这个也可以」
是错误的类比——它成立的前提是「①满足（平台会拒）＋ 写入频繁到 PG 不划算 ＋ 显式接受错窗并告警」
三条同时成立。少任何一条就回到规则本身：**任一条不满足，落 PostgreSQL。**

#### 关于互动召回：队长和 spec-author 其实没有分歧

裁决把这条写成对 spec-author 的纠正，但**他已经在 `issues/08-p2-互动召回.md` 里写了同样的结论**
（该单「硬性约束」第 1 条：「窗口记录按幂等键对待，放 PostgreSQL……矩阵禁止业务服务用
Dragonfly 承载幂等键」，并明确「这是频率相关数据里唯一不能放缓存的一项」）。两边一致，无需协调。

我只补强一点定性：它**不是「接近幂等键」，它就是矩阵禁止的那一类**。
判据正是上面的测试①——`issues/08` 自己写得最准：「**平台不会替你拦**」。
一旦没有外部权威，我们的记录就是领域真相，而矩阵对领域真相的规定是硬的
〔真相源 `.service-matrix.yaml`:69〕。窗口长 30 天只是让后果更难看，不是它必须落 PG 的原因。

#### 落地约束（三条，都可验收）

1. **Redis 不可用 ⇒ fail-closed**（少发），这是 `go-redis.md`:86 的既有要求，不是本方案的发明。
2. **Redis 可用但读到 `redis.Nil` ⇒ 按「窗口全新」处理并接受可能多发**，
   同时**必须对平台返回的频控错误码单独计数并告警**——这是唯一能发现淘汰正在发生的信号。

   ⚠️ **反方向的「修复」会把功能瘫掉，而且它看起来很像在修淘汰问题**
   （2026-09-01 经 spec-author 指出补入）。有人读到「淘汰会导致多发」之后，
   很自然会想「那就把 `redis.Nil` 也当故障、一并 fail-closed」。**这是错的**：
   `redis.Nil` 与「窗口刚开始、一条都还没发」**本来就不可区分**——
   把它当故障，等于**把每一个新窗口都当成故障**，结果是
   **每个窗口的第一条消息都发不出去**。
   把「不可区分」这件事往任何一个方向硬判都有代价，
   区别在于：判成「窗口全新」的代价是**偶尔多发、且有平台兜底**；
   判成「故障」的代价是**功能常态性失效、且没有任何东西会兜底**。
   所以两个分支必须严格按来源分派：**error → fail-closed；`redis.Nil` → 当窗口全新**，
   不要把其中一条的处理方式套到另一条上。

   ⚠️ **与 `spec.md` 的口径对齐（避免被读成互相矛盾）**：`spec.md`「频率预算与降级」
   要求「**发送前判定，不要依赖错误码事后补救**」。本节说「平台拒绝才是真兜底」
   **不是**在否定那条，两者是主路径与安全网的关系：
   - **主路径**：按 `spec.md` 的顺序发送前逐项预检（单关系 20/分 → 日配额 → QPS/QPM → 召回窗口），
     任一不过就不发。这是常态，且是唯一被允许的**设计意图**。
   - **安全网**：预检依赖的短窗口计数存在缓存里、可能被静默淘汰。
     淘汰发生时预检会误判为「可发」，此时挡住我们的只剩平台的拒绝。
   把错误码计数当**淘汰探测器与告警信号**，不是当限流手段——
   一旦该错误码的速率不为零，说明预检正在失效，要去查缓存实例而不是调大重试。
3. **PG 侧两张表**：日配额按 `(scope, openid, quota_date)` 做 UPSERT 计数；
   召回窗口按 `(app_id, scope, openid, window)` 唯一约束落「已发过」事实——
   用唯一约束而不是先查后插，理由同 §9.1（幂等靠约束，不靠读改写）。

#### 与 `spec.md` 的存储划分分歧：每日 1000 条该放哪（**已由队长裁决收口**）

> **2026-09-01 状态**：本节记录的分歧**已经闭合**，`spec.md` 侧已由 t7 收敛完毕。
> 下面的论证过程原样保留，用于说明**为什么是 PostgreSQL 而不是缓存**——
> 结论容易记住，理由不写下来半年后会被人凭直觉改回去。
> 当时的扫描结果如下：

我按队长要求做了两文档冲突扫描，发现**一处实质分歧仍然存在**（不是措辞问题）：

| | 每日 1000 条/用户或群 的计数 |
|---|---|
| `spec.md`「频率账本」+ 存储划分表 | **Dragonfly**。它把「频率配额计数」整类划给缓存，并写「**这是本服务唯一允许放 Dragonfly 的数据**」，**只为互动召回开了例外** |
| 队长裁决 + 本文 §9.4 | **PostgreSQL**。24 小时窗口不自愈 |

**分歧根源是那句共同的论证**：`spec.md` 写「计数丢失不会产生错误结果，
只会退化成『按平台错误码被动降级』」。按前面〔反驳一〕，**这句在淘汰场景下不成立**——
键被淘汰后读出 0，行为是**多发**而非少发，而 `redis.Nil` 无法与「窗口刚开始」区分。

**`spec.md` 自己提供了一条让后果更严重的事实**（我原先没有）：
「`40034100` 频控错误**本身也消耗接口配额**（接口自身 100 QPS）」〔`spec.md`「频率账本」〕。
于是「靠平台拒绝兜底」不是免费的——**淘汰引发的超发会把接口配额烧在必然失败的请求上**。
窗口越长，一次淘汰造成的错误突发越大：
- 分钟级窗口被淘汰 → 最多多发一个窗口的量，几十秒后自愈；
- **日配额被淘汰 → 该用户当天剩余额度全部按「全新 1000 条」重算**，
  可能连续触发大量 `40034100`，同时挤占 100 QPS 的接口预算影响**其他用户**的正常发送。

**所以我支持队长的落点（日配额进 PG），并且认为理由比裁决里写的更强**：
不只是「不自愈」，而是「不自愈 + 失败会外溢到其他用户的配额」。

**2026-09-01 队长裁决：以本节为准。** `spec.md` 侧已由 t7 收敛完毕——
当时冲突的三处措辞（「唯一允许放 Dragonfly」「只有最后一项允许放缓存」
「频率配额计数 → 可用 Dragonfly」）现已全部不存在，且 spec-author
不只挪了存储落点，**还把判据本身换成了本节的两条正交测试**，
并采纳了下面〔反驳一〕补出的第四类（被动回复 60 分钟窗口）。
两份文档现在是同一套判据、同一组结论。

⚠️ **落点正确不等于写法正确，而且这条对两种存储都成立**
（2026-09-01 补正：原文只写了 PG 侧，是漏的——spec-author 指出缓存侧同理）。

**先分清两个不同的失败模式，它们的解法不通用：**

| 失败模式 | 症状 | 解法 | 唯一约束管用吗 |
|---|---|---|---|
| **重复写入**（幂等问题） | 同一事实被写两次 | 唯一约束 / `ON CONFLICT DO NOTHING` | ✅ 管用 |
| **并发递增丢更新**（计数问题） | 两副本各读到同一个 `n`、各写回 `n+1`；**实发 2 条、账上只加 1** | **原子自增** | ❌ **拦不住**——两次写的是同一行的不同版本，不违反任何约束 |

Webhook 模式下 qqbot 是多副本（§5），所以两种模式都会真实发生。**别用第一种的解法去防第二种。**

- **PostgreSQL 侧**（日配额）：
  `INSERT ... ON CONFLICT (scope, openid, quota_date) DO UPDATE SET n = tbl.n + 1 RETURNING n`，
  用 `RETURNING` 拿**自增后的真值**判超限，不要先查后判再写。
- **Dragonfly 侧**（短窗口、被动回复窗口）：**同样不能 `GET` 后 `SET`**，必须 `INCR` / `INCRBY`。
  放缓存不代表可以放松写法——丢更新在这里一样会让计数偏小、进而超发。

两条附带纪律，都有本仓出处：

1. **`INCR` 原子但不幂等**：`go-redis.md`:117-125 写明自动重试会让
   「`INCR`、`LPUSH` 等命令在网络抖动时**可能被执行多次**」。
   对频控计数而言，重试导致的是**多计** → 少发，**方向是安全的**
   （而丢更新是少计 → 多发，方向是危险的）。**接受多计，不要为它加补偿**——
   为消除多计而改回读-改-写，等于用一个危险方向的错误换一个安全方向的错误。
2. **计数键必须带 TTL**（`go-redis.md`:233：缓存与临时状态必须有 TTL），
   且注意 `INCR` 与 `EXPIRE` 是两条命令：**只在 `INCR` 返回 1（键刚创建）时设 TTL**；
   若进程恰好在两者之间挂掉，会留下**一个永不过期的计数键**——
   那个用户的该窗口从此不再重置，表现为**永久少发**。
   把「存在无 TTL 的计数键」当作可修复异常纳入巡检，别等用户报障。

> **一句话**：队长的三个落点我全接受；换掉的是论证——
> 决定因素不是窗口多长，而是**平台会不会替你兜底**（决定能否放缓存）
> 加**丢了多久能自愈、失败会不会外溢**（决定放了之后疼不疼）。

---

## 10. Q10：部署

### 10.1 真相源是哪条路径

**`backend/services/{service}/deploy/{dev,prod}` 是当前实际在用的部署路径**
〔真相源 `.service-matrix.yaml`:243〕；`helm/values.yaml` **不是**集群真相源，
ArgoCD 零 Application（2026-08-24 实测，2026-08-30 复验仍为零）
〔真相源 `.service-matrix.yaml`:241-242, 269-272 与 `AGENTS.md` 反直觉约定〕。

但如 §2.2 第 10/11c 条所述，**structcheck 仍然强制 helm 侧补齐**。两条路都要走。

### 10.2 `deploy/dev/deployment.yaml` 要点（逐条对应 structcheck 断言）

以 `payment/deploy/dev/deployment.yaml` 为模板〔代码，全 118 行我读过〕，qqbot 版需要：

```yaml
metadata:
  name: ecommerce-qqbot-deploy
  namespace: ecommerce
  labels: { app: ecommerce-qqbot, app.kubernetes.io/part-of: ecommerce }
spec:
  replicas: 1                      # Webhook 无状态，可调；WS 模式必须锁 1（§5）
  selector:
    matchLabels: { app: ecommerce-qqbot }   # ⚠️ 不能把 part-of 加进 selector（不可变）
  template:
    metadata:
      labels: { app: ecommerce-qqbot, app.kubernetes.io/part-of: ecommerce }
    spec:
      topologySpreadConstraints:   # 必须恰好 1 条 suite-wide 约束
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: DoNotSchedule
          nodeAffinityPolicy: Honor
          nodeTaintsPolicy: Honor
          labelSelector:
            matchLabels: { app.kubernetes.io/part-of: ecommerce }
      serviceAccountName: ecommerce-qqbot
      automountServiceAccountToken: false
      enableServiceLinks: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000
        fsGroupChangePolicy: OnRootMismatch
      containers:
        - name: ecommerce-qqbot
          env:
            - { name: SERVICE_NAME, value: "qqbot-service" }   # 必须与 discovery 一致
            - { name: CONFIG_SOURCE_FILE, value: "/etc/ecommerce/config-source/qqbot.yaml" }
            # 不得声明已退役的 CONFIG_SOURCE / CONSUL_PATH
          ports: [{ containerPort: 30012, protocol: TCP }]
          volumeMounts:
            - { name: config-source, mountPath: /etc/ecommerce/config-source, readOnly: true }
      volumes:
        - name: config-source
          secret:
            secretName: ecommerce-config-source-dev
            defaultMode: 0400
            items: [{ key: qqbot.yaml, path: qqbot.yaml }]
```

对应断言：`assertWorkloadIdentity`〔代码 `deploycheck_test.go`:685-703〕、
`assertEcommerceNodeSpread`（**恰好 1 条**，且 `part-of` **不得**进 selector）
〔代码 `deploycheck_test.go`:705-740〕、`assertSelectorEnv`（`CONFIG_SOURCE_FILE`
精确等于 `/etc/ecommerce/config-source/qqbot.yaml`，且**不得**出现
`CONFIG_SOURCE`/`CONSUL_PATH`）〔代码 `deploycheck_test.go`:775-790〕、
`assertSelectorSecurityContext`〔代码 `deploycheck_test.go`:767-773〕、
`assertSelectorMount`（`defaultMode: 0400`，**只投射 `qqbot.yaml` 一项**）
〔代码 `deploycheck_test.go`:792-831〕。

⚠️ **绝对不要**把任何 Secret/ConfigMap 卷挂到 `/etc/ssl/certs` 根目录——
会遮蔽发行版 CA bundle，让容器内**所有公网 HTTPS 调用**报
`x509: certificate signed by unknown authority`，且报错指向证书而非挂载
〔代码 `deploycheck_test.go`:833-899〕。
**这条对 qqbot 尤其致命**：它是本仓少数需要主动出公网 HTTPS（调 `api.sgroup.qq.com`）的服务，
是这个坑的天然受害者。

探针照抄 payment：readiness 用 `/healthz`（DB 不通返 503 好摘流量），
liveness **只探端口**——用 `/healthz` 做存活会让一次数据库抖动把所有 Pod 连环重启
〔代码 `payment/deploy/dev/deployment.yaml`:84-98 的注释〕。

### 10.3 出口 IP 相关的调度约束：**nodeSelector 解决不了这个问题**

**结论：不要用 nodeSelector 去「固定出口 IP」。** 两个理由：

1. 三个 k8s 节点在**同一个** `192.168.3.0/24` 网段、走**同一个**路由器出网
   〔真相源 `local-env.md`:38, 121-125〕。
   把 Pod 钉到 node102 而不是 node101，**出口 IP 完全一样**——nodeSelector 零收益。
2. 加 nodeSelector 会**直接与 `whenUnsatisfiable: DoNotSchedule` 的 suite-wide
   打散冲突**：约束显式设了 `nodeAffinityPolicy: Honor` / `nodeTaintsPolicy: Honor`
   〔真相源 `.service-matrix.yaml`:45-46〕，意味着亲和性会参与倾斜计算，
   钉死单节点可能让整个 ecommerce 套件的调度变得不可满足。

**真正能固定出口的三条路**（都在集群网络层面，不在 Pod 调度层面）：

| 做法 | 说明 | 状态 |
|---|---|---|
| A. 应用层正向代理 | qqbot 调 QQ OpenAPI 时经 node1/node2 的 HTTP(S) 代理出去 | 最小改动，推荐先验证〔待验证 **V1**〕 |
| B. Cilium Egress Gateway | 用 CNI 能力把指定 Pod 的出站 SNAT 到固定节点 IP | 集群是 Cilium〔真相源 `local-env.md`:195〕，但**仍受限于「所有节点共用同一个家宽出口」**——只有配合 A 或 C 才有意义 |
| C. 整体落 node2 | 脱离 k8s | 见 §4.3，代价大（x86_64 vs arm64）〔待验证 **V9**〕 |

### 10.4 还要补的四处

1. `backend/Makefile` 的 `SERVICES ?=` 加 `qqbot`
   〔代码 `backend/Makefile`:16；注释里明确说这是 matrix 的手抄副本，漂移由 structcheck 拦〕。
2. `backend/compose.yaml` 加 `ecommerce-qqbot`（键名带 `ecommerce-` 前缀
   〔代码 `deploycheck_test.go`:35, 209〕）。
3. `helm/values.yaml` 顶层加 `qqbot` 键 + `helm/charts/qqbot/`（含 `charts/library-0.1.0.tgz`）。
4. `helm/files/zero-trust.yaml` 加 `ServiceAccount ecommerce-qqbot`。

**镜像**：Dockerfile 直接复制 payment 的〔代码 `payment/Dockerfile`〕——
它是参数化的（`ARG SERVICE`），且注释明确要求「十份 Dockerfile 保持逐字一致，
不按用没用到分叉」。注意集群全 arm64，`TARGETARCH` 由 buildx 传入。

---

## 11. 三个最大的技术阻塞点（按严重度）

### 阻塞 1：集群没有可用的固定公网出口 IP —— **决定项目可行性**

正式环境的 QQ IP 白名单同时管 WebSocket 连接和 OpenAPI 调用，
而 k8s 集群在一个带 DHCP 的家用网段后面、出网还依赖开发机上的代理
〔真相源 `local-env.md`:121-125, 164-170〕。本仓**没有任何真相源记载这个出口 IP**。
本仓已经在企业微信告警上踩过同一个坑，失败形态是**静默的**
〔真相源 `docs/todo/统一可观测性体系.md`:203-205〕。

**下一步**：先在沙箱环境（`sandbox.api.sgroup.qq.com`，白名单只作用于正式环境）
跑通功能，同时**并行**确认 V1/V2，再决定出口方案。不要先写业务代码。

### 阻塞 2：control-tower 的 Go 模块版本发不出来

改 `routes/` 必须同 PR 升级本仓依赖，但可 `go get` 的 `v` 前缀 tag 只到 `v0.1.1`，
而发布 tag 已到 `0.2.8`——**两套命名空间分开，Go 那套落后 7 个版本**（实查 2026-09-01）。
本仓当前锁 `v0.1.0` 且**无 `replace` 指令**。
在打出新 `v` tag 并确认可解析（V6）之前，§3.2 的方案 A **无法完成**。

**下一步**：要么先解决发版口径（打 `v0.1.2`），要么先按方案 B 落 `backend/tools/`
避开 gateway 门禁，等发版顺了再迁。

### 阻塞 3：事件推送链路整条不存在

order 无 outbox producer、NATS `used_by` 为空、无 Inbox、无 DLQ
〔真相源 `.service-matrix.yaml`:263-266；`events/INDEX.md`:11-19〕。
「订单状态变更主动推 QQ」**不是接线，是新建三段链路**，
且它依赖 order 服务侧的改动（V8），不在 qqbot 任务范围内。

**下一步**：第一版砍掉**事件驱动的**主动推送（订单状态变更这类），只做被动回复
（用户 @ 机器人 → 查询 → 回复）。被动回复不需要事件链，只需要 §7 的 Connect-RPC 直连，
依赖面小一个数量级。

⚠️ **这条限定词很重要，我初稿漏了**（2026-09-01 经 spec-author 指出后更正）：
原文写的是无限定的「砍掉主动推送」，**过宽**。本阻塞点的论据是「order 没有 outbox producer」，
它只约束**需要经事件链的**推送。**不经事件链的主动推送不受此约束**——
`spec.md` 在 P0 保留的运维通知（部署/告警系统直接触发 qqbot）就属于这一类，
它不读 order、不依赖 outbox，我的论据对它不成立。

而且保留它是有正面价值的：**它是 P0 阶段唯一能真正跑通「主动消息通道 + 频控预算」的手段**，
否则这两条链路要等到 P2 才第一次被验证。它还给 `/qqbot*` 增加了**第三个真实用途**
（外部系统触发推送的入站端点），进一步坐实 §3.2 的方案 A。

⚠️ 但它对 §5 有一个**副本数上的附带要求**：运维通知会写 §9.4 的配额计数，
而 qqbot 在 Webhook 模式下是多副本的。**日配额那张 PG 表必须用原子 UPSERT
（`INSERT ... ON CONFLICT DO UPDATE SET n = tbl.n + 1`），不能读-改-写**，
否则两个副本并发推送会各读到同一个旧值、双双写回，把配额算少、进而超发。
这与 §9.2 的原则一致：**幂等与计数靠数据库约束和原子写，不靠应用层先查后改。**

---

## 12. 待验证清单（共 13 条）

落地前必须逐条确认。**没有一条是我在本仓验证过的。**

| 编号 | 待验证内容 | 谁能验 | 影响 |
|---|---|---|---|
| **V1** | k8s 集群（`192.168.3.0/24`）的公网出口 IP 是什么、是否固定 | 从集群内 Pod `curl ifconfig.me`，隔天复测 | **决定 §4 全部结论** |
| **V2** | QQ 正式环境 IP 白名单是否对 OpenAPI 出站调用同样强制（我按「是」处理）；沙箱是否豁免 | 查平台文档／沙箱实测 | 决定 Webhook 是否也需固定出口 |
| **V3** | 群/单聊（C2C）事件在多 shard 下如何分布——全量投递还是只投 shard 0 | 沙箱开 2 个 shard 实测 | 决定 WS 模式的去重成本；选 Webhook 则不影响 |
| **V4** | qqbot 代表用户调下游时**用什么机制**走「与 Web 端相同的授权判定路径」（持用户令牌做 BFF？经网关转发由网关注入身份？）——本仓无既有实现可抄 | 安全决策 + 一次设计 | §7。**方向已定、不再开放**：`spec.md`「身份边界」禁止自行拼装身份头；另「是否需要对外 RPC」这半已由 §3.2/§9.3 回答（提交绑定码端点必须过网关 ⇒ 方案 A 成立） |
| **V5** | Pangolin 单条资源能否承载 QQ 回调的 QPS；是否需要配 health check（配则须同时给 `hcPort`/`hcPath`） | 压测 + 面板 | 影响 Webhook 稳定性 |
| **V6** | `v` 前缀 tag 推到哪个远端才能被本仓 `go get` 解析（origin=GitLab，github 是另一个远端） | 打一个测试 tag 试 | **阻塞 2 的解法** |
| **V7** | 订单推送算不算「交易域」——`ECOMMERCE_EVENTS` 当前 R1，交易域要求 R3 | 架构决策 | 影响 NATS 流配置 |
| **V8** | order 服务是否会新增 outbox producer、何时 | 跨任务依赖 | **阻塞 3**；决定第一版能否做**事件驱动的**主动推送。**不含**运维通知——它不经事件链，不受本项阻塞（见 §11 阻塞 3 的限定说明） |
| **V9** | 若落 node2：x86_64 镜像、脱离 `deploy/` 手工路径与 structcheck 管辖的代价是否可接受 | 架构决策 | §4.3 / §10.3 方案 C |
| **V10** | 是否直接依赖 `github.com/tencent-connect/botgo`，还是只借鉴其协议实现 | 读该库源码 + 评估维护度 | 影响实现成本；注意集群 arm64 |
| **V11** | qqbot 是否真需要注册进 Consul——若不经网关则**没有消费方**（control-tower 的 config 服务就因此显式 `CONSUL_ENABLED=false`，见其 `AGENTS.md`） | 由 V4 推出 | 可省一处配置 |
| ~~**V12**~~ **已收口** | ~~频控配额状态的存储选型~~ → **已由 §9.4 的四类分法关闭**（队长裁决 + 我的两处论证替换）。无需再验 | — | — |
| **V12′** | （V12 拆出的另一半，仍开放）被动回复 `msg_id` 的 **5 分钟**有效窗口，能否覆盖「事件→consumer→发消息」的端到端时延；覆盖不了就只能走主动消息通道，配额模型完全不同 | 压测 | §8.3；影响 P1 能否用被动回复实现 |
| **V13** | openid 的**三条平台事实**（per-bot、不可反查 QQ 号、群/单聊命名空间独立；§9.3 的第四条是由它们推出的，不单独验）——来自队友 spec-author 转交的调研，**我未独立验证平台行为**。⚠️ **单一来源**：`spec.md` 与本文互相引用会让它看起来像两个独立来源，实际只有一个未验证来源——别把交叉引用当交叉验证 | 沙箱实测：同一账号在私聊与群里各触发一次，比对 openid 是否相同 | **§9.2 表结构与 §9.3 全部结论**；若「群/单聊 openid 其实相同」则可去掉 `scope` 维度并简化绑定流。**在实测前不要让实现依赖「两者不通用」** |

---

## 13. 我没有做的事（边界声明）

- **没有修改** `.service-matrix.yaml`、`backend/` 下任何代码、`control-tower/` 下任何文件。
- **没有执行** `git commit` / `push` / 打 tag / `kubectl apply` / `helm` 任何写操作。
- **没有连集群**，所有集群数字均为从既有文档转引的二手值，已标注原始日期。
- **没有碰** 同目录的 `spec.md` 与 `issues/` 下的 8 个单（均为队友 spec-author 的交付物）。
  按 `docs/agents/issue-tracker.md` 的一单一文件约定，原先的单个 `issue.md` 已由 spec-author
  重构为 `issues/01-*.md`…`08-*.md`；我只读过它们用于交叉核对，未做任何修改。
- 只读命令我跑过：`go test -count=1 ./structcheck/...`（绿，2.173s）、
  `go list -m`、`git tag --list`、`git diff --stat`、`git check-ignore`、grep 若干。
