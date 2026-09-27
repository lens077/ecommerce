# 告警与通知运维手册

> 维护基准：2026-09-26。本手册记录本轮统一后的策略、发布源、对象白名单和已知边界；运行态仍须现场核对。
> 新账号状态：**创建、权限隔离和组件迁移已验证**；手机端尚未确认。账号名可以入仓，密码、token、真实 topic 不入仓。
> 完整规则与探针源码投影见 [告警规则目录](alerting-rules.md)，总入口见 [TECH §9.3](../TECH.md#93-告警与通知链路)。

## 1. 目标与边界

目标是让二进制、Docker 和 Kubernetes 的**通知行为一致**，不是把它们强制改成同一种部署方式。统一的是故障/恢复文案、关注与待办分流、观察窗口、持久去重、指数退避和测试隔离。宿主进程由 systemd watchdog 观察，Docker 用容器白名单，Kubernetes 用集群规则；Gatus 保留独立直推，不能为统一而引入唯一故障点。

用户不是实时值班：短时服务重启在 10 分钟内恢复健康，不发独立重启通知；已确认的持续故障才进入通知生命周期。这不等于所有告警都固定等 10 分钟：安全事件、备份新鲜度、证书有效期等有各自规则，完整参数以目录中的 expr/for 为准。原 `critical` 分类不盲目降低，手机优先级改为「关注」而非最高紧急。

### 当前发布链

```text
node0 / node1 / node2 / k1 / k2 / k3
  └─ host-watchdog.timer → watchdog.sh → notify.py（宿主持久状态）──┐
node1 证书任务 → certificate-notify.py → notify.py（独立状态）─────┤
K8s OTel → VictoriaMetrics → vmalert → Alertmanager                 │
                                    └─ alert-bridge（PVC 状态）────┤→ ntfy → 订阅客户端
K8s Gatus custom provider（独立直推，不经过 AM/bridge）─────────────┘
```

集群只有一套 vmalert/Alertmanager/bridge，不能在 k1/k2/k3 每台算一份。旧 node3 Pigsty 的宿主 `/infra/rules`、本机 bridge、旧 869 条规则都不是当前规则真相源。实际 Node 身份为 k1/k2/k3；宿主 SSH alias node0/node1/node2 与它们共 6 台，不沿用旧 inventory 的 node3/4/5 命名。

Healthchecks 虽有服务，但本轮应用数据核对仅见 1 个 `new` 初始 check 和 email channel，**没有 ntfy integration**；不计入已接通的通知链。Bugsink 当前无 workload，bridge 仅保留兼容 handler。`blog-reminder` 属于业务提醒，不在本次身份迁移和基础设施降噪范围。

## 2. 账号、权限和三个 topic

### 2.1 新身份目标

| 身份 | 稳定账号名 | 权限 | 用途 |
|---|---|---|---|
| 订阅者 | `infra-alerts-reader` | 对三个现有 topic 精确 `ro` | 手机/Web 读取告警；不得发布 |
| 发布者 | `infra-alerts-publisher` | 对三个现有 topic 精确 `wo` | watchdog、证书、bridge、Gatus 发布；不得读取历史 |

账号使用新生成的随机密码；发布组件使用该发布者身份的有效凭据。只授权三个**准确的 topic 名称**，不授予 `*`、前缀通配或 admin 权限。ntfy 保持默认拒绝。新密码/token 只能由受控凭据存储、部署注入与授权的用户交付流转，不放进仓库文档、源码、运维日志、命令历史、公开截图或测试 fixture。按用户明确请求单独交付客户端密码，不等于允许把凭据入仓。

本轮账号权限验证：reader 对三个 topic 读取均为 200、写入为 403；publisher 读取为 403、向无关 topic 写入为 403；匿名读取为 403；publisher 向隔离 test topic 发布为 200 且 `event=message`。这证明权限隔离与服务接受测试发布，不证明手机送达。凭据主记录保存在 node1 的 `/etc/ntfy-alerting/credentials.json`（目录 0700、文件 0600）；发布 token 还注入六台宿主 env、Kubernetes Secret，以及部署机和 k1 的 installer 凭据文件。客户端密码与组件发布 token 用途不同，不把 publisher 密码/token 交给手机。publisher token 当前未配置期限；后续轮换由运维安排，不虚构自动到期策略。旧订阅/发布身份尚未删除或吊销，作为迁移回退；不能写成旧身份已退役。

| 占位符 | 角色 | 约定 |
|---|---|---|
| `NTFY_TOPIC` | core/page | 保留现有核心 topic，不改订阅标识 |
| `NTFY_TICKET_TOPIC` | ticket | 在既有核心命名基础上使用 ticket 后缀，实际值由凭据配置提供 |
| `NTFY_TEST_TOPIC` | test | 使用 test 后缀，必须与 core/ticket 不同 |
| `NTFY_TOKEN` | publisher token | 不展示真实值，不用 reader 身份发布 |
| `NTFY_URL` | 发布服务根地址 | HTTPS；不得携带 URL userinfo |

三个 topic 必须非空、彼此不同。bridge 对缺项或别名配置 fail closed：readiness 返回 503，发送不回退 core。宿主 test 模式还要求测试状态与生产状态隔离。手机只订阅需要的 core/ticket；隔离测试不能发进生产 core。

### 2.2 身份迁移顺序

由有授权的运维执行，不由文档阅读自动触发：

1. 创建并核对 reader/publisher 精确 ACL，保留旧身份作为有限回退窗口。
2. 将新 publisher 凭据注入六台 watchdog、node1 证书共用 env、bridge 与 Gatus Secret。
3. 在隔离 test topic 验证发布与读取权限，验证 reader 不能发、publisher 不能读、未授权 topic 被拒绝；记录状态码和结果，不记录凭据。
4. 核对组件配置、发布响应与运行状态，确认新身份承载通知后再处理旧基础设施凭据。
5. 保留 `blog-reminder` 自己的业务身份和权限；不能因基础设施迁移撤掉业务通知权限。

本轮迁移已完成：六台宿主 env 权限 0600，bridge/Gatus Secret 与运行进程使用新 publisher；证书任务自然继承 node1 共用 env。bridge/Gatus Recreate 后 Ready，持久状态保留。部署机与 k1 的安装器凭据源同步更新，Bugsink 原路径 token 保留，三个现有 topic 不变。六台宿主隔离测试的故障首发/重复/恢复/重复结果均为 1/0/1/0，bridge 隔离 test 故障和恢复发布成功；没有改动业务 blog-reminder 身份。

配置/HTTP 接收成功、ntfy `event=message`、手机展示是三个不同验收层次。没有客户端观察证据，不写「手机已送达」；短窗口成功也不能写成「已稳定观察 24 小时」。

### 2.3 客户端订阅

客户端由用户完成设置，服务端开通 ACL 不会自动在手机创建订阅：

1. 在 ntfy 客户端添加自定义服务器 `https://ntfy.apikv.com`。
2. 使用 `infra-alerts-reader` 和本轮单独交付的随机密码登录，不使用 publisher token。
3. 从受控交付信息复制准确的 core/ticket/test topic；文档中的 `NTFY_*` 是占位符，不能作为真实订阅名。
4. core 保留关注提醒；ticket 按个人习惯设为低打扰或静音；test 仅验收时按需订阅。
5. 确认客户端收到授权的 test 消息后，再决定是否移除旧账号订阅。文档不代替客户端送达确认。

### 2.4 旧凭据回退位置

本次是 additive 迁移，旧身份未删除/吊销。回退只恢复指定组件的 env/Secret 并重载该发布者，不删事件状态或 PVC。不要在线整库覆盖 ntfy 授权库。

| 回退材料 | 位置 | 限制 |
|---|---|---|
| 六宿主旧 env | 各宿主 `/var/backups/ntfy-identities-20260926/watchdog.env` | root-only；只恢复需要回退的发布者 |
| 集群旧 Secret | node1 `/var/backups/ntfy-identities-20260926/observability-alert-bridge-ntfy.json`、`/var/backups/ntfy-identities-20260926/ops-gatus-ntfy.json` | 0600；base64 不是加密，不复制到仓库 |
| ntfy 授权库一致性备份 | node1 `/etc/ntfy-alerting/user.db.before-identities` | 仅供受控恢复取证；账号/ACL 变更用支持的定向命令，不在线整库替换 |

部署机与 k1 的 installer env 同时保留 `.before-alert-identities` 备份，回退组件后应同步对应部署源，防止下一次安装重新覆盖。迁移记录在同级 observability 仓 `audit/ntfy-2026-09-26/identity/MIGRATION.md`；其中没有密码/token 真值。

### 2.5 ntfy 服务端配置基线

依据 2026-09-26 node1 只读审计；这是部署配置和 CLI 默认值，不是手机/APNs 送达验收。

| 项目 | 配置 |
|---|---|
| 部署 | node1 Docker `ntfy-ntfy-1`，镜像 tag `binwiederhier/ntfy:v2.11.0`；tag 不是独立二进制 digest 验证 |
| 主配置 | 宿主 `/home/docker/ntfy/server.yml` 只读挂载 `/etc/ntfy/server.yml` |
| 认证 | `auth-default-access=deny-all`、`enable-login=true`；精确 ACL 见上文 |
| 消息缓存 | 12h，容器 `/var/cache/ntfy/cache.db`；不是长期告警历史库 |
| 附件 | 总量 1G、单文件 15M、过期 3h |
| 代理 | `behind-proxy=true`；需要维持可信代理/X-Forwarded-For 边界 |
| iOS 上游 | `https://ntfy.sh` 用于 iOS 唤醒；本轮未单独验证 APNs/上游行为 |
| 限流 | 未自定义；所读 CLI 默认 request burst=60、每 5s 补 1 个请求额度 |

限流只能限制请求压力，不能替代每个发布者的事件去重、观察窗口和退避。缓存计数、HTTP 接受次数不能直接当作用户收到的通知数。

## 3. 统一通知生命周期

| 类别 | 来源分类 | topic | ntfy priority | 重复间隔（距上次成功发送） |
|---|---|---|---:|---|
| page / 关注 | 原 critical/crit、宿主持续不可用、证书紧急风险 | `NTFY_TOPIC` | 4 | 1h → 2h → 4h → 8h → 24h，之后 24h |
| ticket / 待办 | warning、info、未知 severity、普通容量/证书任务失败 | `NTFY_TICKET_TOPIC` | 2 | 4h → 8h → 16h → 24h，之后 24h |
| resolved / 恢复 | 已实际通知过的 episode 恢复 | 原通知所属 topic | 2 | 一次；从未通知的短时问题不发孤立恢复 |
| test | 显式测试路由/隔离模式 | `NTFY_TEST_TOPIC` | 1 | 仅隔离验收使用，不复用生产状态 |

标题使用 `[故障][关注] 对象或规则 · 来源`、`[故障][待办] ...`、`[恢复][关注或待办] ...`。正文给出现象或恢复说明、对象/范围和必要定位信息；不能将故障 summary 原样作为恢复状态。

重复退避只在**发送成功后**推进。失败保留待发送状态，AM 或下一轮 watchdog 重试。无共享分布式事务：ntfy 接受后、本地状态提交前崩溃，仍可能重复一次，语义为 at-least-once，不承诺 exactly-once。

## 4. 六台宿主 watchdog

源码：[watchdog.sh](../../infrastructure/host-watchdog/watchdog.sh)、[notify.py](../../infrastructure/host-watchdog/notify.py)、[组件说明](../../infrastructure/host-watchdog/README.md)。部署后的入口为宿主 `/usr/local/bin/host-watchdog`，配置 `/etc/host-watchdog/watchdog.env`，helper 位于 `/usr/local/lib/host-watchdog/notify.py`。

- timer：每 5 分钟触发，随机延迟最多 30 秒；OnBootSec=3min，Persistent=true。采样不是实时，实际通知时间受调度和检查耗时影响。
- 首发：连续观察失败 `hold=600s`。单次 restart 增量只记诊断；容器已恢复 running 且非 unhealthy，不以 restart 计数单独通知。
- 恢复：明确健康观测持续 `recover=300s`；未知/遗漏检查不能当作健康恢复。
- 稳定身份按检查 key（容器/单元/HTTP/磁盘/站点）划分，detail 改变不另开事件；一个对象的故障不反复重发其他对象。
- 生产事件状态：`/var/lib/host-watchdog/incidents.json`；容器 restart 诊断状态：`/var/lib/host-watchdog/state`。原子写入与锁保护并发；不要删除状态来「消音」。
- 常态退出 0；发现问题退出 1；通知或内部错误退出 2。oneshot 的 inactive/dead 不等于故障，unit 允许 0/1 不应掩盖退出 2。
- 本轮六机未建立独立外部 dead-man，`HC_PING_URL` 未构成有效外部通知闭环。

### 4.1 实际白名单

以下是 2026-09-26 审计清单与本轮部署配置的维护基准，不是「主机上所有容器」清单。新增业务先确定负责人和重要性，再更新白名单。

| 主机 | Docker `WATCH` | systemd `SYSTEMD_UNITS` | HTTP 检查 | 其他 |
|---|---|---|---|---|
| node0 | `blog`、`newt` | `docker.service` | `blog=http://127.0.0.1:80`，2xx/3xx | `/`：≥85% ticket、≥95% page；无 Pangolin DB |
| node1 | `pangolin`、`gerbil`、`traefik`、`blog`、`mcm-site`、`apikv-site`、`postgres`、`redis`、`ntfy-ntfy-1`、`webhook-webhook-1`、`casdoor` | `docker.service` | ntfy：`http://10.1.0.8:8080/v1/health`；Casdoor：`http://127.0.0.1:8000/api/health`，2xx/3xx | `/`：≥85% ticket、≥95% page；Pangolin DB `/home/docker/pangolin/config/db/db.sqlite` |
| node2 | `gorse-gorse-1`、`minio` | `docker.service`、`fail2ban.service` | Gorse：`http://127.0.0.1:8088/api/health/ready`，2xx/3xx；MinIO：`https://minio.apikv.com:9000/minio/health/live`，解析至 127.0.0.1，接受 200/403、保留 TLS 校验 | `/`：≥85% ticket、≥95% page；无 Pangolin DB |
| k1 | 空（不依赖 Docker） | `kubelet.service`、`containerd.service`、`newt.service` | `kubelet=http://127.0.0.1:10248/healthz`，2xx/3xx | `/`：≥85% ticket、≥95% page；无 Pangolin DB |
| k2 | 空（不依赖 Docker） | 同 k1 | 同 k1 | 同 k1 |
| k3 | 空（不依赖 Docker） | 同 k1 | 同 k1 | 同 k1 |

HTTP 每次超时 10s。容器必须存在、running，若有健康状态则不能 unhealthy。六台主机的磁盘检查有三个独立 key：`disk` 在 `DISK_WARN_PCT=85` 时进入 ticket，`disk-critical` 在 `DISK_CRIT_PCT=95` 时进入 page，`disk-read` 在无法读取水位时进入 ticket。读取失败同时将原容量 key 标为 unknown，既不假报已满，也不伪造容量恢复。Pangolin 按稳定 `siteId` 跟踪，每个站点显式报告健康/离线；只精确忽略 **`sites.name=mac`**，不按 `type=newt` 排除生产隧道，也不匹配 `mac-backup` 等近似名称。

node1 白名单不含 `blog-reminder` 等所有业务容器；未知业务不因本轮通知迁移被自动纳管。k1/k2 的宿主 watchdog 是本轮补齐，旧审计中「未发现」只描述部署前状态。

## 5. 集群规则、AM 和持久 bridge

### 5.1 来源与 owner

| 对象 | 配置源 | 发布方式 |
|---|---|---|
| vmalert 规则 | 同级 kubernetes 仓 `components/vmalert/rules/*.yml` | 安装器生成 `observability/vmalert-rules`，挂载 `/config/*.yml`，投影后 reload 才生效 |
| vmalert Deployment | 同级 kubernetes 仓 `components/vmalert/values.yaml` | Helm |
| Alertmanager | 同级 kubernetes 仓 `components/alertmanager/values.yaml` | Helm release alertmanager |
| alert-bridge | 同级 kubernetes 仓 `components/alert-bridge/` | 脚本 CM + Deployment/PVC；脚本 SHA 注解驱动滚动 |
| Gatus | 同级 kubernetes 仓 `components/gatus/{config,endpoints}.yaml` | 安装器/CM，凭据从 Secret 注入 |

不能直接修改 CM 作为最终修复：Helm/安装器会覆盖，vmalert 内存也可能尚未 reload。现有 Argo Application `ecommerce-kyverno` 不意味着告警链已受 GitOps 管理；任何后续接管都须先明确资源 owner。

当前源码目录有 **45 条 alert、0 条 recording rule**：CNPG 10、app 5、CDC 9、K8s 8、readiness 2、security 5、pipeline 6。[完整 expr/for/keep_firing_for/labels/annotations](alerting-rules.md) 自动从源文件生成；不再维护另一套手抄表达式。

K8s 对象指标来自 OTel `k8s_cluster`，经集群内 VictoriaMetrics 查询；常用名是 `k8s_container_restarts`、`k8s_container_ready`、`k8s_pod_phase`，标签为下划线形式。写规则前仍须验证实际 series，表达式合法或 health=ok 不等于有数据。采集断供由 `K8sClusterMetricsMissing` 等单独覆盖。

重启风暴需要 restart 窗口条件、当前未就绪与 Running phase 同时成立，连续 10m；Completed Job 不应形成持续故障。Deployment 完全不可用与部分副本降级分成两条，不因统一降噪把已有 critical 全降为 warning。适用持续故障规则使用 `keep_firing_for=5m` 延迟恢复；不是所有规则一律相同。

### 5.2 AM 只负责分组与刷新

- `group_by`：alertname、cluster、k8s_namespace_name、service_name、deployment_environment_name、severity。
- `group_wait=1m`：新组首批聚合；首发仍先受源规则 for 约束。
- `group_interval=5m`：组变更发送节奏。
- `repeat_interval=5m`：**AM 向 bridge 刷新，不是手机每 5 分钟通知**。先部署持久 bridge 才能启用该配置。
- `send_resolved=true`、`max_alerts=0`：保留完整成员；bridge 限制请求体与手机正文，而不是丢失恢复成员。
- Watchdog→null，不推手机；Gatus 单独检查其存在。
- NodeNotReady 抑制要求相同且非空 cluster/node；不猜 Pod 到 Node 的关系。ClusterMetricsMissing 仅抑制同 cluster 的相关 Kubernetes/readiness 告警，不压制 Gatus 独立探针。

### 5.3 Bridge 状态与消息

单副本、Recreate、1 GiB ReadWriteOnce PVC `alert-bridge-state`，`/state/notifications.json` 原子持久化；不支持多个进程共享写状态。稳定 key 包含 receiver、groupKey、class、topic；fingerprint+规范化 startsAt 区分新 episode。持久记录最新 startsAt，晚到旧 firing/resolved 不覆盖新事件。

首发不额外等待，依赖源规则的观察窗口。成员改变可更新并重置退避；annotation 中数值变化不另开事件。完整恢复只针对已通知 episode 发一次；混合 firing/resolved 分开计数。正文最多 6 行、3000 UTF-8 bytes、3 个对象，剩余数量和截断信息可见。unknown severity 可见且去 ticket。Click 只允许安全 HTTPS，拒绝 userinfo/control characters。

旧截图的 `alerts=2` 是 webhook 成员数，不是重启两次或两个节点独立发送。旧 bridge 从 commonAnnotations 取公共故障说明，resolved 只改标题，导致恢复摘要照抄。本轮 formatter 已改成明确恢复说明，保留对象和分类，不复述仍故障的段落。

发布走 ntfy JSON UTF-8。禁止 HTTP redirect；只有 2xx 且 JSON `event=message` 才确认成功。无配置不再返回假成功。`/healthz` 配置不完整为 503；`/livez` 只证明进程可响应。状态损坏/不可写应停止并保留证据，不能静默用空状态启动。

**首次使用空 PVC、丢失状态或改变 groupKey/topic 会重新首发当前 firing 组。** 迁移时保留 PVC，先在隔离环境验证。AM 重复周期改回旧值不等于状态回滚；回滚旧 bridge 可能恢复高频重复，须同时核对路由和发送策略。

## 6. Gatus 独立黑盒通知

Gatus 在集群 `ops` 命名空间，以 custom provider 直接发布 ntfy JSON，不经过 AM/bridge。故障 priority=4，恢复=2；保留旁路是为了 bridge/AM 坏了仍能发信。它依赖同一个 ntfy 和集群，不能替代外部独立心跳监测。

当前 **22 个探针**的 URL、conditions、interval 和阈值完整列在 [生成目录的 Gatus 部分](alerting-rules.md#gatus-探针22-项)。分组覆盖 cluster-origin、observability-pipeline、CDC、public-edge、node1-public，包括新增 Config Center 四项和 alert-pipeline-watchdog。

| interval | failure/success threshold | 从首个失败观测到触发 | 从首个成功观测到恢复 |
|---|---|---|---|
| 1m | 11 / 6 | 10m | 5m |
| 2m | 6 / 4 | 10m | 6m（不短于 5m） |
| 5m | 3 / 2 | 10m | 5m |

连续结果计数不是精确计时器；首次轮询相位、耗时、调度会改变故障发生至通知的总时延。`send-on-resolved=true`；`minimum-reminder-interval=0s` 在当前版本表示不发重复提醒，不是每轮提醒。

custom body 的状态片段只含受控常量，标题使用受控端点名称/组名；不直接把错误正文、URL 或任意内容拼入未转义 JSON。条件变更时应使用实际 Gatus 镜像做隔离解析/发送验证，而不是仅凭 YAML 语法判断。

关键边界：bridge health 证明配置就绪而非 ntfy/手机可达；Watchdog probe 证明 vmalert→AM 心跳仍存在；TCP probe 只证明连接；anonymous 401 只对受控后端健康判据有效，不能把 Pangolin SSO 的 401 当后端健康。CDC task 探针仍按 tasks[0]，扩 task 时须扩覆盖。

## 7. 证书任务独立生命周期

node1 `apikv-cert-renew.timer` 保持每天 03:17 Asia/Shanghai 加最多 45m jitter。wrapper `/usr/local/sbin/apikv-cert-renew` 使用 `/usr/local/lib/host-watchdog/certificate-notify.py`，后者复用 notify.py；源码在同级 docker-deploy 仓 `certificates/apikv-wildcard/certificate-notify.py`。

- 统一读取 `/etc/host-watchdog/watchdog.env`，旧 infra-monitor.env 不再是该任务的消费源。
- 独立生产状态：`/var/lib/apikv-cert/notifications.json`；测试状态：`/var/lib/apikv-cert/notifications-test.json`，不能借用 watchdog incident 文件。
- `hold=0`、`recover=0`：这是低频任务结果，不再叠加宿主 10m/5m 等待。
- renewal key：普通续期/分发失败 → ticket；expiry key：有效期 ≤7 天或无法读取/判断 → page。
- 正常成功不发日常成功噪音；只有已通知问题的恢复才发恢复。重复提醒遵循相应 class 的退避，但下一次任务运行才有机会发送。
- node2 接收脚本仍引用已退役 Harbor/nginx/端口路径；这是独立配置问题，本轮没有以「降噪」代替修复。

## 8. 排障与变更验证

### 8.1 没收到通知

1. 先确认应当通知：是否还在源规则 for、宿主 hold、Gatus 连续失败窗口或重复退避期间。看源状态，不能只看 ntfy。
2. 检查发布链状态：宿主最近退出码、AM receiver/抑制/静默、bridge health/PVC、Gatus 条件。不要输出 Secret/env 值。
3. 检查发布响应是否有错误；bridge/notify 的错误日志只保留异常类型，避免 URL/token 被异常文本泄漏。
4. 区分新身份权限、topic 配置、通知抑制与客户端订阅。publisher 没有读权限，不能用它读历史来判发送失败。
5. 仅在授权隔离 test topic 进行完整故障→抑制重复→恢复测试；不得给生产规则临时降阈值或向 core 发测试。

### 8.2 本地回归与目录维护

```bash
# ecommerce：宿主状态机，假时间/假发送器
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s infrastructure/host-watchdog -p 'test_notify.py' -v
# bridge：在同级 kubernetes 根目录执行其 README 中的 unittest 命令
# 规则/探针目录：源码变更后重新生成，再检查同步
../kubernetes/.venv-tools/bin/python scripts/generate-alerting-catalog.py --date 2026-09-26
../kubernetes/.venv-tools/bin/python scripts/generate-alerting-catalog.py --date 2026-09-26 --check
# 文档结构与链接
bash scripts/verify-context.sh
```

源规则/AM 改动还需对应版本 vmalert/Alertmanager dry-run；Gatus custom 配置需实际镜像隔离验收。上线后核对 CM 与运行态 API，不把安装命令退出 0 当全部加载成功。身份迁移、配置发布和真实通知测试由父级运维执行，本手册不内嵌凭据导出或自动发布命令。

## 9. 已知问题与未完成边界

- **外部 dead-man 缺失**：整机、整个集群或 ntfy 自身不可用，当前同故障域探针可能失声；Healthchecks 初始 check/email 不构成替代。
- **CNPG 备份问题**：备份陈旧/尚无成功备份仍需解决。告警策略上线不等于备份、恢复演练已完成。
- **安全指标缺失**：Vector/Tetragon 指标断供及其长期告警需要修复采集或标签，不能仅靠 ticket 分流隐藏。
- **node2 证书退役引用**：Harbor/nginx 依赖未修；证书任务失败可能是真故障。
- **Gatus 多域名证书噪音**：同一证书风险可能由多个 endpoint 报告，单证书 owner 聚合仍是候选，当前未伪装成已完成。
- **部署稳定性**：本次降噪部署的较早阶段，k2 负载曾影响 AM 发布，自动 rollback 后新 revision 2 已恢复；后续账号迁移未再次出现该故障。这不是持续容量验收，也不代表无需复核资源压力。
- **Healthchecks/Bugsink/业务提醒**：Healthchecks 无 ntfy；Bugsink 无 workload；blog-reminder 不迁移。不能把兼容代码、安装文档或 Secret 名当成已接线证明。
- **送达与观察期**：未承诺 24h 无噪音、误报率或手机送达率；短期验证只支持其实际覆盖的路径。

本轮审计与部署证据保存在同级 observability 仓 `audit/ntfy-2026-09-26/`。审计报告中的旧策略只记录改造前状态，不应与本手册的当前策略混读。方法论见 [告警信号卫生](../../context/team/alerting-signal-hygiene.md)，前端 SDK 接入仍见 [错误监控手册](error-monitoring.md)。
