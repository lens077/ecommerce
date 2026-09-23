---
todo-spec: 1
---
# 项目待办与进度

> 技术目标与选型以 [TECH.md](docs/TECH.md) 为准；本文件只记剩余工作，不复制架构、不保存完成流水账。
> 已完成项直接删除；部分完成只留缺口；已取消的方向用删除线说明原因。重复任务只登记一次。
> 状态：**未完成**＝已核实缺口；**部分完成**＝已有实现、仍缺接线或验收；**待复验**＝旧记录不足以判断现状；**待触发**＝前置条件满足后再做。
> 本轮按工作树代码、清单、TECH.md 与交接记录复核，未连接集群、配置中心或凭据后台。源码已实现不等于线上已验收。

## 一、优先级

- **P0：正确性与安全阻断**。先修库存、订单、地址、商家、购物车及凭据泄露路径；每个修复带能复现原问题的回归测试。
- **P1：生产闭环**。完成交易与前端接线、Session/OpenFGA、默认拒绝网络策略、恢复能力、GitOps 和可观测性验收。
- **P2：增强与条件项**。不因组件已安装就抢先建设；以 TECH.md 的触发条件为准。

不再手工维护任务总数与第二份 P0 清单；具体状态只在下方任务中维护。

## 二、领域状态表

| 领域 | 状态与剩余缺口 | 明细 |
|---|---|---|
| 交易 | 有服务骨架，但库存预占、订单持久化、地址归属与商家审批仍有已核实缺陷 | [微服务](#微服务与交易闭环) |
| 事件与搜索 | 搜索 CDC 已切流；领域事件仍待首个真实业务生产者触发，不预建空链路 | [事件](#数据一致性与事件驱动) |
| 基础设施 | PG 已迁集群内 CNPG `pg-main`（node3 Pigsty 退役）；观测存储位置待复验；近期交接确认 Kafka/ES/Connect/Silo 已迁入 K8s，目标拓扑尚需对齐 | [基础设施](#基础设施与部署模型) |
| GitOps | 集群 2026-09-22 重建为 k1/k2/k3 后 ArgoCD 重装：`AppProject ecommerce` + repository Secret 已重新 apply，新增 `Application/ecommerce-kyverno`（`infrastructure/kyverno/`，自动同步）作为首个真正走 GitOps 的对象。**业务工作负载 `ApplicationSet ecommerce` 尚未在新集群重新 apply**（`ecommerce` 命名空间当前没有工作负载，旧集群「54 个对象只差 tracking-id」的 diff 结论已失效，需重做）。`okteto up` 前仍需确认此行 | [基础设施](#基础设施与部署模型) |
| 鉴权 | BFF 已有实现；legacy bearer 仍在源码，OpenFGA、访客购物与服务端资源授权尚未闭环 | [鉴权](#零信任鉴权与session) |
| 前端 | 公开首页与商品详情 SSR 已有实现；交易页接线不完整，merchant/admin 未形成业务闭环 | [前端](#前端技术栈与工程化) |
| 可观测性 | 采集与通知链已有基础；指标覆盖、告警有效性、脱敏及故障定位仍需验收 | [可观测性](#统一可观测性体系) |
| 发布链 | 多架构构建、扫描、签名与 digest 晋级已有实现；准入、回滚和权限收敛待完成 | [供应链](#供应链与交付流水线) |
| 配置与发现 | Config Center 单源、生产 direct Service 路由已有接线；环境收尾和旧发现依赖待清理 | [配置](#服务发现与配置中心) |

## 三、推进顺序

交易缺陷止血 → 按 [checkout v2](docs/design/order/checkout.md) 打通下单、预占、支付、取消/退款 → 商家、管理与履约。
领域事件随首个跨服务副作用同批交付；安全、备份恢复、告警与发布治理可并行，不等待新增业务功能。
容量结论必须来自固定数据集 k6 与恢复演练，不能沿用旧集群的低流量结果。

## 四、分类明细

### 微服务与交易闭环

依据：TECH.md §4.3、§5；交易细节见 [checkout v2](docs/design/order/checkout.md)。

#### P0

- [ ] **未完成 · 库存预占正确性**：`inventory/internal/data/inventory.go` 仍传未来版本号、忽略更新行数、传错扣减量与错误变量，且未组成完整事务。修复原子条件更新、流水及幂等，并验证并发不足库存不会成功。
- [ ] **未完成 · 库存释放**：同文件 `ReleaseReserve` 仍为 panic；实现幂等释放，未实现前显式拒绝，不得崩溃或假成功。
- [ ] **未完成 · 订单假成功与不落库**：`order/internal/service/order.go` 忽略建单输入，`internal/data/order.go` 的 `SaveOrderGroup`/`SaveOrder` 只记日志返回 nil。先显式阻断假成功，再实现持久化；提交成功前不得发布完成事件。
- [ ] **未完成 · 地址归属校验**：`address/internal/service/address.go` 创建地址仍信任请求体 `UserId`，读改删和设默认未传会话主体。主体取可信身份，数据访问绑定归属；覆盖用户 A/B、游客和管理员的无副作用拒绝测试。
- [ ] **未完成 · 商家审批与桩方法**：`merchant/internal/data/queries/merchant.sql` 的审批 UPDATE 仍无 WHERE；`merchant_service.go` 仍有 panic。限定申请 ID 与操作者权限，实现拒绝/激活等方法或显式返回未实现。
- [ ] **未完成 · 登录 token 落日志**：`user/internal/data/user.go` 仍执行 `u.l.Debug(token.AccessToken)`。删除敏感日志，并随 BFF 收敛清理遗留登录职责。
- [ ] **未完成 · 加购 INSERT 缺列**：`cart/internal/data/queries/cart.sql` 未写 `shop_name`，迁移定义为 NOT NULL 且无默认值。先确定店铺快照契约再贯通 API/业务/SQL，验证新增与重复加购。

上述修复各自带真实 SQL/权限/状态机回归测试，不再另列泛化的「补齐所有单测」任务。

#### P1

- [ ] **未完成 · 建单与库存、支付联动**：按 checkout v2 实现报价/快照、组原子预占、按商家拆单、事务落库、支付意图、成功后清理购物车与失败补偿；不照旧 CartItemIds 草稿直接接线。
- [ ] **未完成 · 订单查询与状态机**：补用户/商家订单查询、取消、状态守卫、订单日志、支付确认和超时恢复；现有 repo 仍有多处 panic。完成状态要求满足履约前置条件。
- [ ] **未完成 · 支付闭环**：恢复 repo 主体与显式 Unimplemented 的 RPC；补回调验签、幂等、主动查询、退款与对账，按 checkout v2 的按组支付和 capture/refund 模型实现。
- [ ] **未完成 · 商品列表与管理能力**：`product.proto` 当前仅有 `GetProductDetail`；按 [listing.md](docs/design/product/listing.md) 实现游标分页，再补上下架、类目/品牌及商家操作权限。
- [ ] **未完成 · 下单幂等契约**：前后端必须使用真实 proto 字段与数据库唯一约束；清理靠类型断言发送、运行时被丢弃的 `requestId`，重复提交只能生成一组订单。
- [ ] **部分完成 · 购物车条目标识**：前端 store 已用 `cartItemId`，后端删除/改数量 SQL 仍按组合键及并行数组。统一迁到 `cart_item_id`，同时校验归属。
- [ ] **未完成 · 订单数据类型与快照**：金额移除 `float64` 中转、处理 `AddressPostalCode` 空指针、统一 `merchant_id`，跨 schema FK 改为 ID + 快照；迁移与兼容性按设计裁决。

#### P2

- [ ] **未完成 · 商家两段式入驻与组织隔离**：落地商家/店铺/子账号与 `merchant_id` 数据隔离；前端接线统一登记在前端节。
- [ ] **未完成 · 履约能力**：先并入 order 域，补发货、物流单、轨迹与第三方 adapter；没有独立伸缩或故障域证据不拆新服务。
- [ ] **未完成 · notification**：按 [设计草案](docs/design/notification/notification.md) 落模板/消息/投递、站内信与 Resend、状态 webhook、压制名单及 consumer/admin 页面；登记 matrix、路由、策略与角色。streaming 与事件消费留后续阶段。
- [ ] **待前置 · support**：notification 基础完成后，按 [设计草案](docs/design/support/support.md) 接收件 webhook、工单串线、回复与 admin 客服页；作为 OpenFGA 首个业务接线试点。
- [ ] **未完成 · 搜索体验**：补聚合筛选、热门词与固定查询集相关性基线；搜索只读 PG 派生投影，不恢复业务服务直写索引。

### 数据一致性与事件驱动

依据：TECH.md §3、§4。行投影与领域事件的判据见 [分线约定](context/project/ecommerce/events/experience/row-projection-vs-domain-event.md)。

#### P1 · 线 B：领域事件

**待触发**：首个需要跨服务副作用的业务写出现时开工。涉及支付/库存副作用时，下列正确性要求是上线阻断，不是可后补的增强。

- [ ] **待触发 · 事务生产者与事件契约**：业务变更和 Outbox 同一 PG 事务；定义 `OrderCreated`/`OrderPaid`/`OrderCancelled`/`OrderReadyForFulfillment` 等实际所需事件、Protobuf envelope 与 `traceparent`。不为发事件提前制造 Product 写接口。
- [ ] **待触发 · Outbox 结构与搬运**：补 `aggregate_type`，清理旧发布簿记列；Debezium Outbox Router 使用独立 publication/slot，与搜索 CDC 分线。配置 `acks=all`、幂等 producer 及复制槽保留策略，不自写 relay。
- [ ] **待触发 · 消费者与恢复**：franz-go + Inbox 唯一键 `(consumer_group,event_id)`；副作用与 Inbox 同事务，成功后提交 offset。落 retry/backoff、显式预算、DLQ、重放权限与审计，补显式补偿、状态查询和超时兜底。
- [ ] **待触发 · Topic 与演练**：声明 owner、partition key、replication、retention、lag/恢复 SLO；验证事务回滚、重复、乱序、毒消息、断连、积压与重放。没有 Inbox 和补偿证据不得产生支付/库存副作用。

#### P1 · 线 A：搜索恢复

- [ ] **部分完成 · 搜索灾备验收**：2026-09-23 在新集群做了一次真实 alias 切换（7 个索引 `_v1`→`_v2`，重灌 sink，文档数逐表对齐 PG，ES 转 green）并补了复制槽保留告警（kubernetes 仓 `vmalert/rules/ecommerce-cdc.yml`）；发现并修掉「集群重建后 ES 索引由 sink 自动建、mapping 不是契约」和「source 丢了 `lsn.flush.mode`」两处回归。仍需：固定商品集的 checksum/query diff、alias 回退演练、retention 边界与恢复时长；破坏性注入须单独授权。搜索语义边界待产品决定：`ik_smart` 把「精华液」当整词，文档只有「精华」就搜不到。

#### P2 · DuckDB 试点 D0–D3

- [ ] **待触发 · D0 真实分析需求**：先确认真实报表/对账消费者或行为数据规模门槛成立；否则不排期。搜索 CDC 已用于业务，删除旧「只属演示」前提。
- [ ] **待前置 · D1 最小跑批**：D0 成立后落 PG 增量导出 → Parquet/Silo → DuckDB CLI，固定 SQL、批次校验与 manifest 发布；不嵌入业务服务、不引入常驻任意 SQL 服务。
- [ ] **待触发 · D2/D3 版本复核**：正式版发布后按 TECH.md B 表复核 CLI/daemon、ABI/CGO 与归档性能增量；不把预览版或稳定 ABI 自动等同于允许 cgo，结论回写 TECH.md。

### 基础设施与部署模型

依据：TECH.md §7、§12；部署与演练见 [容量设计](docs/design/platform/capacity-balancing.md)。

#### P1

- [ ] **部分完成 · GitOps 接管**：Helm/裸清单 parity、版本/digest 晋级已有实现；GitLab 来源的 `AppProject`/`ApplicationSet`/repository Secret 已 apply，`ecommerce-prod` 已生成并完成首次 live diff——54 个对象全部 `OutOfSync`，但差异**只有** ArgoCD 自身注入的 `argocd.argoproj.io/tracking-id` 注解，无字段级漂移、无需新建对象、`--orphaned` 为空，说明 GitLab `main` 的 chart 渲染与线上完全等价。剩余：执行首次 `argocd app sync`（写入 tracking-id，使状态转 `Synced`），再把 `syncPolicy.automated.enabled` 打开启用 prune/selfHeal；网关归 control-tower，不把它重复塞回本仓 chart。
- [ ] **未完成 · 生产 default-deny**：`helm/values-prod.yaml` 仍关闭 NetworkPolicy。先核对当前内网 PG/ES/对象存储、Casdoor/gorse、DNS 与探针通路，审计模式验证后再启用；Helm 与裸清单同步。
- [ ] **未完成 · OTLP Secret 接入 OpenBao/ESO**：prod 仍关闭 `otelAuthExternalSecret`。修正/参数化 SecretStore，确认实际键可同步后启用，不能沿用不存在的 store。
- [ ] **部分完成 · Dragonfly 凭据传播**：旧 WRONGPASS 曾手工修复；仍需同源派生消费方 Secret/Config Center 配置、轮换后验证全部消费者，补 `/readyz` 而非仅 `/healthz` 告警，并避免认证命令里的密码进入日志。
- [ ] **待复验 · 当前集群容量与稳定性**：旧 node3 风暴已做组件迁移，不能继续按迁移前内存表下结论。交接仍报 node5 抖动、metrics-server 不可用；先恢复可信观测，再评估 requests 与可调度节点容量，不以重平衡脚本替代容量治理。
- [ ] **部分完成 · VPA 与 requests 校准**：2026-09-23 拍板 recommender 开 / updater 关 / webhook 不作自动调节（kubernetes 仓 `components/vpa/values.yaml`），`observability/grafana` VPA `Off` 已出 Target≈11m/523Mi 作为样板；按 Off/RequestsOnly 收敛，包括复核 config-center 旧 InPlace 配置；至少 7 天指标覆盖发布与 k6 窗口，再人工回写 requests。
- [ ] **部分完成 · 多副本、PDB 与 N+1**：重核当前拓扑的副本/PDB；旧低流量、旧节点演练不代表现在达标。验证节点故障、扩缩容、批量滚更、资源耗尽与调度失败告警，满足后才启用自动灰度/重调度。
- [ ] **待复验 · HTTPRoute/TLS 收敛**：同 hostname 不等于冲突，按 Exact/PathPrefix 优先级验证 SSR、SPA 与 `/_next`；盘点当前仍存活的基础设施路由和 certificateRef，不按旧组件列表批量迁移。
- [ ] **部分完成 · 数据恢复与重装**：2026-09-23 已用真实 dump（`backs/node3/pigsty-node3-2026-09-03/raw/_data/ecommerce.pgdump`）在 CNPG 隔离库比对：业务表与 live 一致（同一套 Go seed，订单/用户在备份里为 0 行），只有 Config Center 的 `config` schema 是 live 缺的，已 additive 合入 `pg-main/ecommerce`；CDC 用真实 SKU 可逆改价验证 PG→Debezium→Kafka→ES 全链路。剩：CNPG PITR/对象存储备份、RTO/RPO 演练；OpenBao 集群外备份/副本；重装手顺以 CNPG + OpenBao/ESO + Config Center 为准（Pigsty 已随 node3 退役）。OpenBao 当前明确选择 **C：保持 Shamir 手动解封**，不做 static seal migration，也不接 VPS Vault transit；Pod 重启后的恢复动作是 `bash kubernetes/components/openbao/examples/unseal.sh`，Gatus `openbao-unsealed` 负责告警。
- [ ] **待对齐 · 数据面故障域**：近期 Kafka/ES/Connect/Silo 迁入 K8s，与 TECH.md §7 的外置数据面目标有差距；登记迁移后容量与恢复证据，再按目标规划收敛，不能把部署完成当成目标已满足。
- [ ] **待复验 · Dragonfly 实例隔离**：按 TECH.md §7/§12 验收 Session 的 noeviction/持久化、Cache 淘汰策略与 Ratelimit 故障域；共用实例不能标为生产基线完成。

#### P2

- [ ] **待复验 · PG/Redis 证书续期传播**：旧记录到期日为 2026-11-25；先查实际下发证书，再人工同步副本并 reload/restart，复验 verify-full 客户端。旧 `cert-san-resign.md` 已不可定位，恢复手顺需覆盖 PG `serverAuth,clientAuth` 与 Patroni 重启要求。
- [ ] **部分完成 · Harbor 爆破防护**：旧 jail 能检测但隧道后端按真实 IP 封禁无效；核对现行入口，优先验证账号锁定，必要时在实际公网终止点限流/封禁。验收必须证明攻击流量被拦。
- [ ] **待复验 · 遗留运行配置**：核对 node3 Redis 网络就绪顺序、重复拉取凭据、node1 gorse 僵尸副本、cart 的 Silo endpoint 与 OTel TLS 配置；仅处理仍存在的对象，不照旧主机/端口表操作。
- [ ] **部分完成 · KEDA/Rollouts**：控制器已装并做了行为验收（KEDA cron ScaledObject 0→2 + 生成 HPA；Rollouts 金丝雀 setWeight 50→pause→100，stableRS 切换）。业务接线仍待触发：Kafka 消费者 lag 出现真实消费者后再建 ScaledObject；灰度要先有 ≥2 副本 + PDB 的无状态服务。

### 零信任鉴权与Session

依据：TECH.md §8、§13。网关/配置中心实现归同级仓 control-tower。

#### P0

- [ ] **未完成 · 移除 legacy bearer JWT**：control-tower `httpmw/auth.go` 仍保留第三轨及回退；完成客户端盘点后拆除旧鉴权、撤销名单和配置，不能以无限期兼容违背单一 Session 红线。
- [ ] **待复验 · 搜索凭据暴露处置**：旧会话日志暴露记录没有轮换完成证据；核对当前凭据是否仍受影响，必要时轮换并验证旧值失效，不在文档或工具输出回显凭据。

#### P1

- [ ] **部分完成 · 历史凭据泄露收尾**：旧记录已确认全部轮换、历史重写；仅剩 GitHub Support 清理悬空对象。不得把「轮换」重复列为未完成。
- [ ] **部分完成 · OpenFGA 与 RPC 授权**：部署不等于业务接线；落用户/商家/店铺/订单关系与资源级 Check，迁出 Casbin，对现行 policies 做逐 RPC 审计；地址漏洞归微服务 P0。
- [ ] **部分完成 · 匿名购物**：网关 `GuestCookie` 已装配、入站 `x-md-*` 已无条件剥离；剩路由/签名配置上线验收、C 级服务 `RequireUser`、`MergeGuestCart`、登录合并与前端接线。验证访客不能下单、支付或访问地址簿。
- [ ] **部分完成 · BFF 生产属性与会话存储**：2026-09-20 修掉线上跑 dev 清单的问题（`BFF_PUBLIC_BASE_URL` 曾是 `http://localhost:3000`，授权 URL 的 redirect_uri 指向本机，登录整条不可用），现为 `https://gateway.apikv.com`、cookie 实测带 `Secure`；剩 CSRF、登出撤权、真实 CA/Secret 与 Dragonfly Session 链路 fail-closed 验收。旧 `redis-tls-ca` 名称不再作为修复目标。
- [ ] **部分完成 · 服务端身份边界**：独立 SA 与关闭 automount 已有清单；剩 auth SDK/配置债、projected token 审计及绕网关访问验证。网络策略任务归基础设施节。
- [ ] **待复验 · Casdoor 账号治理**：核对密码策略、第三方登录、会话保持与账号禁用；按实际风险决定是否限制匿名 application 元信息接口，不能把已脱敏返回等同于凭据泄露。

#### P2

- [ ] **待前置 · 传输层身份**：先验证 Cilium WireGuard 节点间加密；确有 workload mTLS/授权需求再评估 Istio Ambient，不提前引入 SPIRE 或把 Cilium Mutual Authentication 当完整 mTLS。
- [ ] **部分完成 · Tetragon 治理**：2026-09-22 新集群 k1/k2/k3 重装（1.7.1），`ecommerce-service-account-token-access` audit-only 策略已应用，kubernetes 仓 `components/tetragon/verify.sh` + `examples/cnp-smoke.sh`（CNP 正反向 + Hubble `Policy denied` 证据）可复跑。剩：权限最小化、长期基线、事件完整性与 enforcement 单独验收。
- [ ] **部分完成 · 登录回归保护**：2026-09-20 线上冒烟实跑 10 过 2 挂，断言已按 BFF 现状改正（redirect_uri 断网关 `/auth/callback`，删掉迁移前的 PKCE 断言——它俩都对不上真相，于是线上 redirect_uri 配错时没有任何一层拦得住）。剩复核 callback 与会话恢复竞态修复是否有测试、冒烟处理隐私弹窗、验证真实会话恢复/退出，不以脚本存在代替跑通。

### 统一可观测性体系

依据：TECH.md §9；方法见 [OBSERVABILITY.md](docs/observability/OBSERVABILITY.md)。

#### P0

- [ ] **待复验 · 敏感日志端到端脱敏**：旧 Lua 缺陷所属采集器已退役，不再修旧管道。对当前 stdout/Vector 与 SDK OTLP 两条链路注入合成手机号、邮件、token、支付表单样本，确认原文字段不旁路入库；按 TECH.md 收敛到外置 Collector。

#### P1

- [ ] **待复验 · 告警信号卫生**：复核慢性 PG lag、swap、网络拒绝等旧告警是否仍在；先修根因，再做 critical/warning 分流与窗口失败率判定，避免重启风暴被连续成功探针掩盖。既有交接见 [告警清理](.scratch/chronic-alerts-cleanup/HANDOFF.md)。
- [ ] **待复验 · 指标写入口认证**：确认 VM import 与 OTLP metrics 入口拒绝未授权写入，推送方认证同步配置；旧公网可写断言未重测。
- [ ] **部分完成 · 指标采集层对齐**：当前有 OTel agent，TECH.md 仍要求 VMAgent。按目标收敛职责、避免重复采集；补 Pod/容器用量与 CFS throttling，校验 kubelet/cAdvisor 实际可用指标，不能假定 kubeletstats 覆盖全部限流指标。
- [ ] **部分完成 · Go runtime/进程指标验收**：十服务 adapter 均已设 `RuntimeMetrics: true`，删除「全部未实现」判断；剩发布版本与 goroutine/heap/CPU/内存实际 series、导出失败可见性验收，缺项在 go-connect-kit 补齐。
- [ ] **未完成 · 日志限流**：共享日志模块统一实现采样与压制计数；stdout/OTLP 同时受控，FATAL/PANIC 不限，阈值经故障场景验证。不再复制修改十份初始化代码。
- [ ] **待复验 · 网关遥测**：源码已用 kit 的 ParentBased 采样，旧 AlwaysSample 修复项删除；验证真实 5xx 的 span/log 状态、网关上游时延与尾采样效果，不沿用已删除旧网关的行号结论。
- [ ] **未完成 · 前端 RUM 与后端关联**：consumer 已接 `initPerf`，补 `traceparent`/Server-Timing 关联与 merchant/admin 的适用接入；Umami 不替代性能追踪。
- [ ] **部分完成 · 看板和标签**：DB 错误率分母已修；剩节点覆盖阈值按当前采集对象校准、网关时延图、`service.namespace`/实例标签及 `rpc.code` 回归，按上下文组织四黄金信号。
- [ ] **未完成 · SLO 与定位验收**：落 gateway/user/order/cart SLO 和错误预算；授权演练中验证告警至 Grafana/trace 定位不超过 5 分钟。P50/P95/P99 基线并入容量压测，不把一次冷请求当结论。

#### P2

- [ ] **待复验 · 观测链自身健康**：CES 巡检、Gatus 和采集器补/核验 dead-man 新鲜度告警；2026-09-23 broker 滚动致 Debezium task FAILED（connector 仍 RUNNING）：Gatus `cdc-source-task` 约 1 分钟先红，vmalert `CDCSlotInactive`（`for: 10m`）在 +10 分钟 firing——现有规则已覆盖这类「task 死、槽失活」；同日晚已给 Connect CR 配 `metricsConfig`（kubernetes 仓 `components/kafka/cdc/connect-metrics-configmap.yaml`），新增 `CDCConnectTaskNotRunning`(2m)/`CDCDebeziumDisconnected`(3m)/`CDCDebeziumLagHigh` 直接看 task 状态与 Debezium 连接，比槽失活快 8 分钟；「restart_lsn − Connect offset」差值本身仍没有指标可算（Connect offset 不在 JMX 里），用 `Connected` + `MilliSecondsBehindSource` 替代（`context/project/ecommerce/events/experience/debezium-offset-behind-slot-after-broker-roll.md`）；CDC 槽位点/task/lag 已有恢复记录，不重复列「全部缺失」，但迁移后持续覆盖仍需核对。
- [ ] **待复验 · 日志出口与配置**：核对 SDK `/v1/logs` 的旧 401 是否仍存在；统一 endpoint/header/TLS 与 exporter 开关，删除无代码消费的环境变量，确认 stdout/Vector 与应用 OTLP 各自入库。
- [ ] **未完成 · 部署关联与观测恢复**：采集部署 marker/变更维度；按 TECH.md 外置观测目标验证存储备份/恢复及单点风险，不将 node3 进程外置等同于物理故障域隔离。

### 前端技术栈与工程化

依据：TECH.md §11。商家与管理员的前端任务仅在本节登记。

#### P1

- [ ] **部分完成 · 公开列表页**：SSR 首页与商品详情已实现，首页可写缓存卷已就位；剩 `ListProducts` 数据接入、分类页/列表页与 ISR 验收，不再写「首页不存在」。
- [ ] **未完成 · 购物车删除/数量持久化**：`useCart.ts` 两个操作仍只改本地 store；接 mutation 与查询失效，刷新后必须与服务端一致。
- [ ] **未完成 · 消费者交易页**：订单列表/详情、结算和支付结果接真实 API，随后端正式幂等/响应契约联调；补成功、失败、取消与重复提交用例，去掉对应 mock 和固定支付跳转。
- [ ] **未完成 · 商品列表/类目接线**：公开目录由 consumer-next 承载，SPA 只保留其职责所需入口，不重复建设两套首页。
- [ ] **未完成 · 推荐行为埋点**：consumer 尚无 `initTracker` 调用；接商品曝光/浏览、加购/收藏/购买事件，与 behavior/gorse 端到端验证，不以 Umami 代替。
- [ ] **未完成 · Bugsink SDK 与 Source Map**：服务端已有部署记录；接 SDK、debug ID 与真实错误还原验收。手顺见 [错误监控](docs/observability/error-monitoring.md)。
- [ ] **部分完成 · Umami 发布接线**：服务部署和两个 consumer 埋点代码已完成；`frontend-release.yml` 未传四个构建期变量。补 Docker 构建链路，发布后验证真实 PV/路由变化；更换面板默认管理员凭据并复验。见 [网站分析](docs/observability/web-analytics.md)。

#### P2

- [ ] **未完成 · merchant/admin 业务接线**：接商品、订单、入驻/审核、用户/类目管理等实际 API，配合服务端权限联调；骨架与 mock 页面不算完成。
- [ ] **部分完成 · a11y/语义验收**：已有 lint/axe/标题断言；剩关键旅程键盘/VoiceOver、登录态页审计、渐变对比度、merchant reports 走查与公网 Rich Results Test。
- [ ] **部分完成 · SPA 性能**：按 [web-performance.md](docs/frontend/web-performance.md) 收敛阻塞字体 CSS、启动瀑布、图标 tree-shaking，并消除无有效访客轨时 `useCart` 的无效请求；SSR 首页满分不代表交易页完成。
- [ ] **部分完成 · 页内助手**：已有 copilot 实现，剩发布验收、merchant mock 动作边界；写动作/确认仍按 [copilot 设计](docs/design/copilot/copilot.md) 单独实现和验证。
- [ ] **部分完成 · 体素沙盘 S1–S3**：S0 设计稿已有；剩布局遮挡、离线依赖与模块化、错误中断剧本、受 admin 授权的真实拓扑聚合。见 [设计](docs/design/platform/voxel-construction-site.md)。

### 供应链与交付流水线

依据：TECH.md A/B 表、§7.1；发布手顺见 [PRODUCTION-RELEASE.md](docs/PRODUCTION-RELEASE.md)。

#### P1

- [ ] **部分完成 · TCR 签名验收**：多服务流水线已有 Cosign/SBOM；补逐服务 digest 的签名/attestation 回读验证，不沿用「只有 user 接线」也不把构建成功当验签完成。
- [ ] **部分完成 · Harbor Helm 签名与 Kyverno 准入**：`verifyImages` 已落地为 ecommerce 命名空间级 Audit 策略（`infrastructure/kyverno/`，keyless + `type: SigstoreBundle`，只覆盖已完成 TCR 探测的 `user`），`smoke.sh` 验收「签名 digest pass / 未签名 fail / 两者放行」；ArgoCD `Application/ecommerce-kyverno` 已建，等 GitLab `main` 含该路径即 Synced。剩：CI 对全部服务在 TCR 签名后把 `imageReferences` 扩到 `sumery/*`；14 天零误报后转 Enforce 并以拒绝测试验收；chart 纳入签名链；`kyverno.io/v1 Policy` 迁 `NamespacedImageValidatingPolicy`（CEL）。
- [ ] **未完成 · 发布权限与约束**：收敛 `MANIFEST_PUSH_TOKEN` 绕过分支保护的权限；把发布 tag 四条纪律落实为可执行检查，避免只靠操作约定。
- [ ] **部分完成 · 制品启动与回滚**：pre/prod 同 digest 晋级已有脚本与 prod 清单；剩从 digest 拉起的冒烟、拉取预检、保留策略核验和真实回滚演练；GitOps 接管后验证发布/回滚无需手工 kubectl。
- [ ] **部分完成 · 契约与竞态门禁**：GitHub 发布模板已有 `buf breaking` 和 `go test -race`，GitLab 有 lint 棘轮。剩 MR 阶段兼容性保护与破坏性变更红测；事件 schema 随线 B 纳入，不再重复要求从零接入。

#### P2

- [ ] **未完成 · 全量 proto 生成**：五个服务仍有 `third_party/validate/validate.proto` 复制品；核对 import 后消除冲突，验收全量 `make generate`/`make conf`，不以按路径生成代替。

### 服务发现与配置中心

依据：TECH.md §10；Config Center、网关与控制台归 control-tower。

#### P1

- [ ] **部分完成 · 原生 DNS 收敛**：生产已关闭十服务 Consul 注册、网关 direct Service 路由已接；清理生产遗留 Consul 配置与就绪依赖，pre 按 Compose 目标补齐。保留开发按需注册不等于生产继续依赖 Consul；卸载需另行授权。
- [ ] **部分完成 · Config Center 环境与 token 收尾**：Config Center 已于 2026-09-23 部署到 k1/k2/k3（ns `config-center`，接 CNPG/Dragonfly/集群内 VM，`config` schema 数据完好，Pangolin `config(-api).apikv.com` 已建），operator token 已签、`harvest --env dev` 已写 10 服务 bootstrap（PG/Redis/ES 指向 Pangolin 入口），Mac 经 `config-api.apikv.com` 实测可拉，且 Mac 上 `psql`（verify-ca，TLSv1.3，错密码拒绝）与 `redis-cli`（CA+SNI，`PONG`，错密码 WRONGPASS，无 CA 握手失败）按 bootstrap 里的值直连通过——remote-dev 闭环；三条 L4 入口（`pg-dev:30001`/`redis-dev:30005`/`kafka-dev:30004`）与 `argocd.apikv.com` 已于 2026-09-23 建好并协议级实测，部署后跑 `config-center-harvest.sh --env dev --strategy remote-dev` 即闭环；单源 selector 和独立 Machine Token 已接；核对实际 pre/prod 环境，legacy token 命中连续 7 天为零后删除回退，结合 GitOps 验收，不能沿用旧「全读 dev」快照。
- [ ] **部分完成 · 推荐链路**：建表与 item 同步已有记录；核对 Config Center 中 product/behavior 的现行 endpoint/API key，真实跑通 Track/Recommend/SimilarItems。密钥通过管理入口写入，不绕过只读 Machine Token 直写数据库。
- [ ] **部分完成 · OpenFGA 部署依赖残留**：2026-09-22 已在新集群按 `DEPENDS_ON=postgres`（CNPG `pg-main` 独立库 `openfga`）重装，`examples/smoke.sh` store→model→tuple→check 通过；旧 `openfga.pgdump` 为空无需恢复。剩：`ADDON_OPENFGA` 在 `config.hosting.env` 已开，重装路径整体演练待做。

#### P2

- [ ] **待复验 · 配置平台后续能力**：control-tower 侧重新核对审批、灰度、密钥加密和审计缺口，以及控制台构建/CRUD/回滚；不把本仓旧「尚未开始」当其当前状态。
- [ ] **待前置 · CI 校验远端 Bootstrap**：本地已有解码/校验测试；CI 获得受限配置读取能力后，按 matrix 验证各环境配置，不向日志输出内容。
- [ ] **待触发 · 多人开发接管**：按 TECH.md B 表的多人冲突信号评估 personal intercept；此前仅补 mirrord mirror 的 cart + 下游 DNS 验收，不自建泳道。

### 文档与协作机制

仅保留影响使用与正确性的文档债，不以字数、页数或对称性制造任务。

- [ ] **部分完成 · 清除过期引用与平行状态表**：归档目录已删，但 TECH.md、context 索引、DEVOPS 等仍有裸路径/空链接和旧现状叙述；Repowise 已接入只读引用漂移棘轮，新增可解析漂移会阻断，存量基线仍待逐项清债；删失效引用，设计只留目标与验收标准，状态归本文件。
- [ ] **待核对 · SCAFFOLD 模板与容量清单**：区分新项目验收模板和本仓进度；修正内嵌旧 AGENTS 规则及不再适用的状态列，容量实施状态合并到对应任务，不复制第二套勾选表。
- [ ] **待复验 · 术语与结构性文档债**：按当前设计纠正 GLOSSARY、STACK、README、TECH-RADAR 中的事实冲突；不再按旧行数目标机械压缩，不把仍有现行决策的 TECH-RADAR 整体降为历史档案。
- [ ] **部分完成 · 共享 kit 演进**：基础设施抽取已完成；剩同构棘轮与存量服务 anchor/真实 `co upgrade --write` 试点，见 [shared-infra-kit spec](.scratch/shared-infra-kit/spec.md)。

## 五、不再按原目标推进

这些是取消或被替代的任务，不是「已实现」；不计入未完成工作。

- ~~生产 Consul 扩到三副本并新增 TLS/gossip 治理~~：TECH.md §10 选择 K8s Service/CoreDNS，生产改做依赖清理。
- ~~无业务消费者也先铺 Product/Order 领域事件全链路~~：TECH.md §4.5 明确按首个跨服务副作用触发，不预建。
- ~~在旧日志采集器上修 Lua 脱敏~~：旧管道已退役，改验当前 Vector/OTLP 全链路。
- ~~React Compiler 转正~~：TECH.md B 表已搁置，维持关闭不是实施任务。
- ~~企业微信作为必做告警通道~~：TECH.md §9.3 统一出口为 ntfy；只有真实第二通道需求再立项。
- ~~立即建设共享 ISR cacheHandler 或 Next.js 登录交易页~~：当前短 TTL 是已接受边界，交易页留 SPA；需求改变再评估。
- ~~CI 内搭建双模型 AI 审查、每次 push 构建镜像并承诺十分钟交付~~：本地异构审查与 tag 发布已定，不恢复已取消流水线。
- ~~为旧归档搬家、补演进编年史、强制所有 scratch 拆单、只因对称性补 README~~：与当前文档精简目标无关，不再制造归档和形式性任务。
