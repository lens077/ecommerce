# 可观测性「统一关联底座」对抗评审报告

> 评审日期:2026-08-06
> 评审对象:ecommerce 可观测性体系(采集→存储→关联→分析)+ 集群真实部署状态
> 验收标准:指标/日志/链路/事件/变更五维数据 **统一采集、统一存储、统一查看、统一分析**;
> RUM、Prometheus 指标、ARMS 调用链、SLS 业务日志汇聚到同一数据面,进入「统一口径的关联底座」
> 评审方式:`/adversarial-review` 多模型对抗面板,report-only 模式(未修改任何代码/集群)
> 数据来源:node101/102/103 集群实测(kubectl + port-forward curl,2026-08-06)+ 三仓源码
> (ecommerce / config-center / cloud-native-deploy)

## 一句话结论

**未达到目标。** 设计层面五个维度都规划了,但用集群真实数据验证时,「统一关联底座」的三个支柱
——统一采集、统一口径、统一查看——每一个都在关键处断裂:链路面 0 条应用 trace、日志面所有
pod 标签是坏字面量 `.pod_name`、RUM 与后端无任何共享 join key、Grafana 里没有 Jaeger 数据源。
数据不是「串不起来」,是**多个维度当前压根没进到面上**。

## 评审团

| 评审员 | 模型/通道 | 状态 | 原始发现 |
|---|---|---|---|
| Claude fresh-eyes | Fable,隔离子代理(无主会话记忆) | ✅ 完成 | 5 条 |
| Codex | `codex` 只读沙箱(跨模型族) | ✅ 完成 | 18 条 |
| 外部 provider(deepseek/kimi/glm/gemini) | 未配 key,未派发;敏感度门槛本也排除 | — | — |

所有指控由编排者对照集群实测与源码逐条核实后才收录。

---

## 达标度总览

| 维度 | 采集 | 存储 | 统一口径 | 可关联查看 |
|---|---|---|---|---|
| 指标(Prometheus/VM) | 部分(仅 host + 3 个服务 rpc/pgx) | ✅ | ⚠️ 网关命名不一致 | ❌ 无 exemplar 导航 |
| 日志(Loki) | ✅ 但双路径 schema 冲突 | ✅ | ❌ pod 标签全坏 | ❌ 无 derived field 到 trace |
| 链路(Jaeger) | ❌ 0 应用 trace | 单副本本地盘 | ⚠️ 采样口径冲突 | ❌ Grafana 无 Jaeger 源 |
| 事件(k8s events) | ❌ 未采 | — | — | — |
| 变更(deploy/argo) | ❌ 未进面 | — | — | — |
| RUM(web-vitals) | 仅 1/4 前端 | ✅(未部署故无数据) | ❌ 无 traceparent | ❌ 与后端无 join key |

---

## CONFIRMED —— 已核实的发现(按对目标破坏程度排序)

### 🔴 BLOCKER:统一底座的结构性断裂

**1. 集群里没有任何应用遥测源(全维度落空)**
`ecommerce` 命名空间 **0 个 Pod**——后端、网关、前端、以及承载 RUM 入口的 `behavior` 服务全没部署。
ArgoCD 只管一个 `vpa` Application(OutOfSync),仓库的 `ecommerce-appset` 根本没 apply。
当前时刻发生下单失败,没有任何工作负载会产出 RUM/指标/日志/trace,而 Grafana 仍显示「正常」。
*(实测:kubectl。两位评审员均标此为最高优先。)*

**2. 应用链路面为空——Jaeger 里没有业务 trace**
`jaeger api/services` 只返回 `["badger-migration-e2e", "jaeger"]`。ARMS/调用链维度在数据面上是空的。
*(实测:curl jaeger。)*

**3. 日志面 pod/namespace 标签全是坏字面量,无法按工作负载下钻**
Loki 每条流标签为 `k8s__pod_name=".pod_name"`、`k8s__namespace_name=".namespace_name"`、
`k8s__container_name=".container_name"`——fluent-bit `Label_keys $k8s.pod_name` 在被
`nest`+`Add_prefix` 拍平成含点键后,record accessor 把 `.` 当嵌套分隔符取不到值。所有容器日志
坍缩成只能按 business_line/level 区分的流;pod 元数据只活在 JSON body 里。正确写法 `$['k8s.pod_name']`。
*(实测:curl loki labels + configmap。)*

**4. 事件与变更维度从未进入数据面**
无 kube-state-metrics、无 node-exporter、无 k8s event exporter、无 cadvisor 抓取。Kubernetes 事件、
Pod 状态、容器资源、ArgoCD 变更历史、部署 marker 一个都没采。一次 CrashLoopBackOff+内存压力的发布
事故,面上无任何 event/restart/container-memory 序列可查。*(实测:kubectl get all -A。)*

**5. 手机号脱敏是 Lua-pattern 空操作 + `Keep_Log On` 保留原始明文——PII 双重泄漏**
部署中 fluent-bit lua:`string.gsub(record["phone"], "(%d{3})%d{4}(%d{4})", ...)`。**Lua 模式不支持
`{3}` 量词**,匹配不上任何真实手机号,原样返回。更糟:`Merge_Log On`+`Keep_Log On` 保留原始 `log`
字符串字段,即使 email 脱敏(`(.+)@`→`***@` 有效)也被绕过——完整未脱敏 JSON 随 `log` 整条进 Loki。
违反「无 PII 泄漏」验收项。*(实测:fluent-bit configmap;claude+codex 独立命中。)*

**6. 脱敏过滤器只碰顶层 `email`/`phone` 两键,漏掉真正的敏感 sink**
`payment/internal/server/logging.go` 把 `httpReq.PostForm` 整个 dump 成 `form_data`(交易/回调数据),
RUM 路径把 `user_id`/`session_id` 写日志,历史发现里 debug 日志泄漏 bearer token——这些键都不叫
email/phone,脱敏看不见。给了「已脱敏」的虚假安全感。*(核实:payment logging.go:54-66 + configmap。)*

**7. 基础设施对象存储凭据明文进 Git**
`cloud-native-deploy/loki/helm/other/install.sh:51` 等多处硬编码 MinIO accessKeyId 明文。能读仓库者
即可到达 MinIO 端点,读取/删除所有留存日志(含安全与用户遥测)。*(核实:grep;凭据值不复述。)*

### 🟠 MAJOR:口径与关联的实质缺陷

**8. Grafana 不是统一观测面——没有 Jaeger 数据源,零关联配置**
`observability/grafana/common.py:13-15` 只定义 VM/Postgres/Loki 三个数据源 UID(硬编码),
**没有 Jaeger/Tempo 数据源**;全仓 grep `derivedField|tracesToLogs|tracesToMetrics|exemplar|traceID`
**零命中**。带 trace_id 的日志无法跳到 trace,延迟毛刺无法跳到 metric。数据源还是手工在 UI 建的、
无 provisioning source of truth。*(核实:common.py + grep。)*

**9. RUM 与后端 trace 没有任何共享 join key**
前端 `packages/perf` 用 web-vitals + 手写 Connect-JSON via sendBeacon 上报,**无 `@opentelemetry/*`、
不透传 traceparent、后端不回 Server-Timing/traceresponse**。慢 `frontend.api.duration` 无法关联到后端
span。唯一跨层键 `anon_id`/`session_id` 只在日志,不在 metric、不在 span。DESIGN.md 声称「覆盖
前端→网关→微服务→数据库全链路」——前端那段不存在。*(核实:前端全量 grep。)*

**10. 网关采样口径与后端相反,后端配置管不住网关**
gateway `AlwaysSample()`(非 `ParentBased`);后端 `ParentBased`。网关是 trace 根,永远 100% 采样,
下游只能跟随。设 10% 采样也没用,网关根仍全采,压垮 collector 和单副本 Jaeger。
*(核实:tracing.go:112-117 vs otel.go。)*

**11. 网关 5xx 被记成成功——错误在链路和日志里隐身**
`tracing.go`:`err!=nil` 才 `SetStatus(Error)`,否则 `SetStatus(Ok)`。后端返回 503 但无传输层 error →
`err==nil` → **span 状态 OK**(状态码只作 attribute)。`logging.go` 同理:503 记成 `LevelInfo`。
Jaeger 错误检索、日志 error 级告警都漏掉真实 5xx。*(核实:tracing.go:81-90、logging.go:23-31。)*

**12. 只有 consumer 一个前端接了 RUM**
只有 `consumer/src/bootstrap.tsx` 调 `initPerf`;merchant/admin/config 无 Web-Vitals 初始化。商家后台
报表页 LCP 退化到 10 秒,面上无任何 web-vitals。*(核实:四个 app grep initPerf。)*

**13. 遥测身份 join key 在免鉴权入口可被伪造**
`behavior/identity()` 注释明说 `x-md-global-user-id` 是「可信的网关注入源」。但 gateway jwt 中间件命中
白名单(`telemetry.v1/CollectWebVitals`、`behavior.v1/Track`)时**直接 return 不剥离入站头**,剥离/rewrite
中间件在 config.yaml 全被注释掉。攻击者带 `x-md-global-user-id: <受害者ID>` POST 到 `/Track`,事件、
推荐流、web_vitals 日志全归到受害者名下。*(核实:jwt.go:266-296、behavior.go:88-96、config.yaml 注释块。)*

**14. RUM 上报吞掉 HTTP 失败,发送前已清空缓冲**
`report.ts` 的 `postCollect` 只 `await fetch` 不检查 `Response.ok`,且 `flushApiTimings` 发送前先
`this.apiTimings=[]`。behavior 路由 404、网关 503 都被当成投递成功、不重试、无失败信号。
*(核实:report.ts;注:代码注释显示对 apiTimings「失败就算了」是有意旁路策略,但对 4xx/5xx 无区分。)*

**15. 「DB 错误率」面板画的是错误/秒,不是比率**
`build_infrastructure.py`:`zero_filled(_db_err, _db_all)` = `(sum(rate(errors)) or sum(rate(count))*0)`——
**分子从未除以分母**。标题「DB 错误率」、unit=none、红线阈值 0.1。1 error/s 混在 10000 ops/s 里,
真实 0.01%,面板画成 `1` 直接飘红误报。*(核实:build_infrastructure.py:133-139 + common.py zero_filled。)*

**16. 节点覆盖统计掩盖丢失 1/3 节点,且前提已过时**
`build_infrastructure.py:38-41` 阈值 ≥2 为绿,desc 说「正常值是 2,因为 node1 是 control-plane、
collector 不调度过去」。**实测已不成立**:collector/fluent-bit DaemonSet 现在 3/3,node1 也在跑,
VM 里 node1/node2/node3 各 32 条 system 序列。阈值 ≥2 意味着任一节点掉到 2 仍绿——覆盖损失被掩盖。
*(实测:VM k8s_node_name={node1,node2,node3}。)*

**17. 核心存储全是单副本本地盘,无生产级 HA**
Jaeger(badger 本地盘)、VictoriaMetrics(single、本地 PV)、Loki(single-binary)、Grafana 均单副本。
承载卷节点故障时 Pod 无法带数据漂移——恰在需要诊断时丢 trace 或 metric。*(实测:kubectl + manifests。)*

**18. fluent-bit 全局限流 + Skip_Long_Lines 在事故时静默丢日志,无丢弃计数**
`throttle Rate 500/Window 5`(集群级聚合、无 per-stream 公平、无 dead-letter)+ `Skip_Long_Lines On`。
节点错误风暴时(如 TODO.md 记录的 connect-0 484 次重启刷屏),超限日志和超长栈被丢——事故自己的
日志正是被丢的那批,而 collector `:8888` 自监控无人抓,面上无 ingestion-loss 计数。
*(核实:configmap + 无 collector 自监控抓取。)*

### 🟡 MINOR

**19. `OTEL_LOGS_EXPORTER: "none"` 是死配置,日志双份外发**
该 env 在 compose.yaml 和所有 deploy 清单里设置,但没有任何 Go 代码读它(grep OTEL_ 零命中)。
`log.go` 无条件 `NewTee(stdout, otelOTLP)`。注释说「日志只走 stdout 由 fluent-bit 采」是假的——
只要 `observability.enable=true`,日志同时经 stdout→fluent-bit 和 OTLP→collector→Loki 两条路进 Loki,
标签 schema 不兼容(`k8s__*` vs `service_name`),无单一 LogQL selector 覆盖全部日志。

**20. 9/10 服务的 serviceName 默认值是 `org-service`**
`cmd/server/main.go` 除 behavior 外 9 个服务默认 `"org-service"`。`SERVICE_NAME` env 缺失时九个服务在
Jaeger/VM/Loki 坍缩成同一身份。叠加 helm 用 `-v1` 后缀名、deploy/gateway discovery 用无后缀名——
同一服务按部署路径产生两个 `service.name`。「统一口径」最基础的键(service.name)四处不一致。

**21. 网关 TLS 分支逻辑颠倒且被丢弃(潜伏 BLOCKER)**
`tracing.go:127-136`:`AppendCertsFromPEM` 成功/失败臂写反,`log.Fatalf("failed to append ca cert")` 在
**成功**时触发;`WithTLSClientConfig` 结果没 append 进 options。当前 `tls` 未启用故不可达,一旦为网关
开 TLS,进程直接 Fatal 崩溃。

---

## PLAUSIBLE —— 未完全证实,未被驳倒

- **基础设施遥测端点无鉴权对外暴露**:`cloud-native-deploy` 下 VM/Jaeger/Loki/Grafana/kafka-ui/MinIO
  均有 Gateway API HTTPRoute。若网关层无 AuthorizationPolicy,LAN 客户端可查询敏感日志或伪造
  metric/log/trace 撑爆存储。未验证是否挂了网关级认证;VM-single/Jaeger 默认无鉴权,值得确认。

---

## REFUTED / 证据纠错(评审员抓到编排者 Evidence 里的错)

- **「基础设施盘 Loki 面板只能看到 0.05% 的 OTLP 流」方向反了**。实测 Loki `service_name` 值就是
  `"kube-logs"`(从 `job=kube-logs` fallback),`{service_name=~".+"}` 匹配得上 kube-logs 主体(约 99.9%),
  不是只看到 OTLP 流。真正的残余缺陷是 #3 的坏 `k8s__*` 标签,不是「面板几乎空」。
- **「代码里完全没有 exemplar」措辞过强**。OTel Go SDK v1.45 默认启用 trace-based exemplar filter,
  被采样 span 上下文里记 histogram 时 SDK 自带 trace 关联 exemplar,grep 源码为空不能证明零 exemplar。
  但实际结论仍成立:VM 数据源 + Grafana 未配任何 exemplar 导航,查询层做不到 metric→trace 跳转。

---

## 生产级差距硬项清单

除上述发现,达到生产级还缺:HA/多副本存储、pipeline 自监控(collector `:8888` 无人抓,「遥测有没有
半路丢」无法回答)、告警(0 规则、无 vmalert/alertmanager)、PII/密钥治理(#5/#6/#7)、配置纳入 GitOps
(整个可观测栈在 imperative install.sh 里,节点上手改过 loki values)。

## 修复优先级建议

小改动大收益,建议先做:
1. **#3 fluent-bit 标签**(`$['k8s.pod_name']`,一行)——立刻恢复日志按 pod 下钻。
2. **#5/#6 PII 脱敏**——`Keep_Log Off` 或改脱敏策略,堵住手机号/form_data/token 明文落 Loki。
3. **#11 网关 5xx 状态**——按 `reply.StatusCode>=500` 设 span Error / log Error,让错误可被发现。
4. **#13 身份伪造**(安全)——网关补一条入站 `x-md-*` 剥离中间件,建议单独确认后再改。
5. **#15/#16 看板**——DB 错误率改真比率、节点覆盖阈值对齐 3 节点现状。
