# 新增 qqbot 服务骨架并接通事件接收

Status: ready-for-agent
Blocked by: 01

新增本仓第 11 个后端服务 `qqbot`，接通与 QQ 机器人开放平台的事件收发。
本单**不实现任何业务功能**，只把接入、鉴权、幂等的底座做对。

## 接入模式：Webhook

**接线方案以 [wiring.md](../wiring.md) 为准，当前推荐 Webhook（HTTPS 回调）。**

需要纠正一个容易乐观的判断：**选 Webhook 不等于绕过 IP 白名单。**
取 AccessToken、发消息、调 OpenAPI 都是出站调用，两种模式都受白名单约束。
Webhook 把需要解决的问题从两个减到一个，没有减到零——
「固定公网出口 IP」仍是前置条件，见 [04](./04-正式环境资质与前置裁决.md)。

选 Webhook 的真实收益是三条：入站复用已有的 Pangolin 通路（本仓有逐字操作手册）、
无状态可多副本、不引入长连接的单活协调问题。论证见 wiring.md §1.1 与 §4。

沙箱不受 IP 白名单限制，因此本单的全部验收可以在沙箱完成。

## ⚠️ 范围边界：本单不覆盖正式环境连通性

**本单全绿只证明沙箱可用，不证明正式环境能跑。** 这一条必须写在前面，因为差异是静默的：

沙箱免 IP 白名单，而本单的多条验收（Access Token 刷新、发消息、任何 OpenAPI 调用）
在正式环境都要经过白名单。**同一份代码在沙箱全绿、升正式环境后会在第一次调 OpenAPI 时失败**，
且平台返回的错误只出现在日志里、界面无感知——本仓在企业微信告警上已经踩过这个形态
（见 [04](./04-正式环境资质与前置裁决.md) 引用的前科）。

因此：

- 正式环境连通性由 [04](./04-正式环境资质与前置裁决.md) 承担，**不是本单的验收项**。
- 本单交付后**不得**据此宣称「QQ 机器人已接通」，只能说「沙箱接入已验证」。
- 04 的验收标准里「正式环境下能成功接收事件并调用 OpenAPI 发出一条消息」一条，
  才是正式环境可用的证明。

## 范围

1. 建立服务目录 `backend/services/qqbot`。**骨架照抄 payment**——
   它是唯一「承接第三方服务端回调」的现役服务，签名自证、带不了我们的 JWT，与 QQ Webhook 同形。
   照抄时的两处例外见 wiring.md §2.1。
2. 在 `internal/conf/v1/conf.proto` 声明配置结构，为每个字段推断校验约束（`buf.validate`），
   配置加载路径开 `ErrorUnused` + 调 `protovalidate`。
   **写 proto 前先读设计文档**（AGENTS.md 硬规则 2、`context/team/proto-design.md`）。
   建议的配置块形状见 wiring.md §6.2。
3. Access Token 获取与刷新。
4. Webhook 接收端点：`op=13` 回调地址验证 + 常规事件的 ed25519 签名校验。
5. 幂等底座：入站事件去重表、出站 `msg_seq` 分配表。**两者都放 PostgreSQL。**
6. 订阅 `GROUP_AND_C2C_EVENT`（`1<<25`）。不订阅频道相关 intents。
7. 接入 OpenTelemetry，需要哪些指标见「验收标准」里的指标一条。

## 硬性约束

- **签名校验必须在进程内完成。** 回调可信性来自 ed25519 签名，不来自我们的鉴权体系；
  网关帮不上忙，反而多一跳。校验失败直接拒绝。
- **Access Token 有生命周期，不是静态凭据。** 必须在过期前刷新，
  且刷新期间已在途的请求不受影响。这一项现在做对，否则只会在长时间运行后暴露。
- **`msg_seq` 必须持久化，不能用内存计数器。** 进程重启后内存计数器会回退，
  导致后续消息被平台判为重复而全部失败（`40054005`）。
- **幂等键不得放 Dragonfly。** `.service-matrix.yaml` 的 `externals.redis` 明确写：
  业务服务只放可丢缓存，不得承载锁、幂等键或领域真相。
  Access Token 缓存是可丢的，允许放 Dragonfly。
- 凭据只能来自 Config Center，不得经环境变量明文注入镜像。

## 三个会咬人的坑（都已有人付过学费）

**1. 不要把任何 Secret 或 ConfigMap 卷挂到 `/etc/ssl/certs` 根目录。**
会遮蔽发行版 CA bundle，让容器内所有公网 HTTPS 调用报
`x509: certificate signed by unknown authority`，且报错指向证书而非挂载。
**这条对 qqbot 尤其致命**——它是本仓少数需要主动出公网 HTTPS（调 `api.sgroup.qq.com`）的服务。

**2. Pangolin 资源的 target 必须走 443，不能走 80。**
本仓 HTTPRoute 的 `parentRef` 都带 `sectionName: https`，80 上没有任何路由，走 80 必然 404。
建资源时也不要勾 Health Check，且必须走面板或 API 而非数据库后门。
详见 wiring.md §4.1。

**3. liveness 探针只探端口，不要用 `/healthz`。**
readiness 用 `/healthz`（数据库不通返 503 好摘流量），
但用它做存活会让一次数据库抖动把所有 Pod 连环重启。照抄 payment 的探针配置。

## 仓库门禁

**权威清单在 [wiring.md](../wiring.md) §2.2**，逐条标了 structcheck 的断言位置与行号。
不要凭印象补，照那份清单走。

两处需要人先决策、不要闷头做的：

- `helm/charts/qqbot/` 的补齐要求你在一条**已知不是集群真相源**的部署路径上造产物
  （wiring.md §2.2 第 11c 条与其后的警告）。做还是走 `deployment_coverage.exceptions`，要人定。
- `gateway_prefix` 不能留空，而改路由模板要同 PR 升级 control-tower 依赖——
  **这条路当前是堵的**（可用的 `v` 前缀 tag 只到 `v0.1.1`，发布 tag 已到 `0.2.8`）。
  见 wiring.md §3.3，这是排期阻塞。

提交前：更新 `TODO.md`（AGENTS.md 硬规则 3），跑 `scripts/verify-quick.sh` 与
`cd backend && go test -count=1 ./structcheck/...`。

## 验收标准

1. 沙箱环境下能通过 `op=13` 回调地址验证。
2. 常规事件的 ed25519 签名校验生效：篡改报文后请求被拒绝。
3. 中断 60 秒后恢复，期间的事件不丢失、不重复处理（验证平台重投被正确去重）。
4. 服务重启后，同一入站事件不会被重复处理。
5. Access Token 在过期前自动刷新，刷新失败时有告警，不静默降级。
6. 以下指标可查：回调成功率与签名校验失败数、Access Token 刷新成功率与剩余有效期、
   按错误码分类的失败计数。
7. 配置缺必需段或含未知键时，服务**启动失败**而不是静默跳过。
8. AppSecret 不出现在仓库、镜像与日志中。
9. wiring.md §2.2 的门禁清单全绿。

**上述验收标准全部在沙箱环境执行。** 见文首「范围边界」——全绿不代表正式环境可用。

## 参考

- 方案：[spec.md](../spec.md)「平台事实基线」「新增服务需要通过的仓库门禁」
- 接线：[wiring.md](../wiring.md) §2（落位与门禁）、§4（接入模式）、§6（配置）、§9（存储）、§10（部署）
- proto 约定：`context/team/proto-design.md`

## Comments
