# 2026-08-31 SigNoz 评估：一体化可观测平台候选（观察项）

> 用户决策语境：「未来或许可能换到它」。本文回答四个问题：**SigNoz 是什么**、**什么场景该用它**、**与现行观测栈逐项比对**、**若切换的成本与触发条件**。
> 结论先行：**当前不换，列为观察项**。现行「Victoria 家族 + Grafana + vmalert」组装栈已调顺且资源占用低；SigNoz 的价值在「一体机收敛组件数 + 三信号同库关联」，对应代价是常驻 ClickHouse 的内存底座——node3 现有容量放不下。触发重估条件见 §五。
> 关联事实：GitLab Observability（O11y，Experiment 状态）就是 SigNoz 的 fork；本仓已另行零成本试用其 CI/CD 插桩（只加 CI 变量，不碰应用遥测管道），与本评估互不影响。

## 一、SigNoz 是什么

- 定位：「开源 Datadog 替代」的**一体化可观测平台**——trace/metric/log/异常/告警/看板收进单个应用，自带 UI（[官网](https://signoz.io/)、[what-is-signoz](https://signoz.io/docs/what-is-signoz/)）。2021 年创立，YC W21，GitHub 约 32k star（2026-08 查）。
- 架构：OTel 原生（只收 OTLP，无私有 agent）→ signoz-otel-collector → **单一 ClickHouse** 存三信号 → 内置查询/看板/告警。查询提供 Query Builder、PromQL 与 ClickHouse SQL 三种入口（[GitHub README](https://github.com/SigNoz/signoz)）。
- 形态：社区版自托管（Docker/K8s），另有商业云版。主仓为社区代码 + `ee/` 企业目录双区结构，具体许可条款在真正引入前需复核。
- 与 GitLab O11y 的关系：GitLab 实验性可观测产品即其 fork（[gitlab_o11y 仓库](https://gitlab.com/gitlab-org/embody-team/experimental-observability/gitlab_o11y)提交历史全是「Merge upstream SigNoz v0.125.1」类合并）。这从侧面说明 SigNoz 被验证为「可收编自托管」的底座；但 GitLab 托管版本身是 Experiment、无 SLA，且 GitLab 有两次砍掉可观测产品的历史（Jaeger 集成 15.0 移除、observe.gitlab.com beta 已成孤儿），**托管版不作为迁移路径，自托管 SigNoz 才是候选形态**。

## 二、作用场景（什么时候它是对的选择）

1. **组件数收敛**：一个应用替掉「采集看板告警」组装链的存储与消费侧（VM + VL + VT + Grafana + vmalert + Alertmanager 六件），升级、备份、鉴权、TLS 只剩一处。
2. **三信号同库关联**：trace 详情页直接跳关联日志/指标，无需在 Grafana 手工维护 derivedField/tracesToLogs/exemplar——本仓 2026-08-06 评审曾查出这类关联配置整体缺失（`docs/progress-archive/OBSERVABILITY_REVIEW_20260806.md`），这是组装路线的固有维护面。
3. **高基数聚合分析**：列式 ClickHouse 对 group by/漏斗类查询强，且可用 SQL 直查遥测数据。
4. **人力受限**：没有精力维护两套查询 DSL（MetricsQL/LogsQL）+ 看板生成脚本 + 告警规则文件的团队，一体机的默认体验更省。

反场景（即当前不换的理由）：观测预算内存紧、已有深度调优沉淀、需要按信号独立换件的灵活性。

## 三、与现行栈逐项比对

现行栈事实以 `.service-matrix.yaml`（pigsty_node3 段）、`docs/TECH.md` §9、`TODO.md` 采集层现状为准。

| 维度 | 现行栈（Victoria 家族 + Grafana + vmalert，node3） | SigNoz（自托管） |
|---|---|---|
| 架构形态 | 组装式：Vector/otel-node DaemonSet + 集群内 OTel Collector + node3 otelcol → VM/VL/VT + Grafana + vmalert/Alertmanager | 一体机：signoz-otel-collector + ClickHouse + 内置 UI/告警 |
| 存储 | 每信号专用引擎，内存/磁盘效率高（VM 家族以低占用著称） | 单 ClickHouse；其 GitLab fork 官方建议最低 2c/8GiB、生产 4c/16GiB + 100GiB 盘（[部署文档](https://docs.gitlab.com/operations/observability/setup_self_managed/)） |
| 查询语言 | MetricsQL / LogsQL / VT 的 Jaeger 兼容查询 | Query Builder / PromQL / ClickHouse SQL；对 MetricsQL 扩展函数无兼容承诺，现有查询迁移需逐条实测 |
| 三信号关联 | Grafana 手工配置，属长期维护面 | 同库天然关联，UI 内置跳转 |
| 看板 | 三盘体系由脚本生成（`docs/observability/grafana/`），口径修正（zero-filled、`db_system_name` 过滤、点号命名等）沉淀在 `common.py` | 内置看板 + 模板 JSON；现有口径修正需逐条重实现 |
| 告警 | vmalert PromQL 规则 + Alertmanager → ntfy 桥，firing/resolved 已实测（`docs/observability/OBSERVABILITY.md`） | 内置告警（阈值/异常检测/Apdex）；ntfy 通知需以 webhook 形态重接，可行性需验证 |
| 采集入口 | OTLP（collector bearertokenauth，三身份 token 在 Vault）+ **vector jsonline 直推 VL**（非 OTLP 通路）+ otel-node hostmetrics | 只收 OTLP 一口；vector jsonline 通路必须改造（vector 换 OTLP 输出或改用 collector filelog，两条路都需验证） |
| PII 脱敏 | Vector VRL 规则 + 「故意未脱敏样本必须被拦截」CI 用例（`docs/TECH-RADAR.md` §8.5） | 需在其 collector/pipeline 层重建同等规则与测试 |
| 鉴权 | OTLP 入口 bearertokenauth 已闭环（2026-08-27 起匿名写入关闭） | 社区版 ingest 鉴权形态不同；GitLab fork 的 ingest-auth 尚在分支开发中（2026-08 观察到 `feat/ingest-auth-*` 系列分支），引入前需单独设计 |
| 故障域 | node3 单点 = 观测全断（已接受的硬依赖） | 不变——换栈不改变单点性质，仍是一台机器上的一套系统 |

## 四、若切换：成本清单

1. **应用侧近零代码**：10 服务 + 网关的 OTLP exporter 认标准环境变量（`OTEL_EXPORTER_OTLP_HEADERS` 注入已实测），改 endpoint/headers 即切流。
2. **双写过渡零风险**：现有 node3 otelcol 加一路 exporter 即可三信号 fan-out 到 SigNoz 并行评估——这是组装栈的优点，评估期不必动任何应用。
3. **vector 容器日志通路改造**：jsonline→OTLP 或改 filelog 采集，需 PoC 验证（含脱敏规则等价迁移）。
4. **看板与告警重建**：三盘脚本与 17+ 条 vmalert 规则语义重写，是最大的一块人工成本；口径修正必须逐条搬，否则重蹈「错误率空图」「基数失控」旧坑。
5. **部署落点**：node3 总内存 7.25GiB（与 PG 数据面、CDC 用 ES 容器同机），放不下常驻 ClickHouse——需要独立 ≥16GiB 落点或替换式腾挪，属于基础设施变更而非组件替换。
6. **历史数据不迁移**：保留期内双栈并行，到期后下线旧栈。

## 五、触发重估条件（建议，满足任两项再启动 PoC）

1. 再次发生因组件间关联缺失/口径漂移导致 >1 人日的排障事故。
2. Victoria 家族关键组件断更，或出现无法绕过的缺陷。
3. 跨三信号的关联/SQL 级分析成为每周常态需求。
4. 可用独立观测节点 ≥4c/16GiB（对齐其 fork 的生产建议规格）。
5. 组件数收敛成为明确目标（如运维人力收缩）。

PoC 形态：利用 §四.2 的双写通路，节点就绪后 fan-out 三信号跑两周，验收「vector 通路改造可行 + 一张核心盘与三条核心告警等价重建 + ntfy 通知打通」再谈切换。

## 六、证据与来源

- SigNoz：[官网](https://signoz.io/) · [what-is-signoz](https://signoz.io/docs/what-is-signoz/) · [GitHub](https://github.com/SigNoz/signoz) · [YC 档案](https://www.ycombinator.com/companies/signoz)
- GitLab O11y（fork 证据与部署规格）：[gitlab_o11y 仓库](https://gitlab.com/gitlab-org/embody-team/experimental-observability/gitlab_o11y) · [Self-Managed 部署文档](https://docs.gitlab.com/operations/observability/setup_self_managed/) · [O11y 总览](https://docs.gitlab.com/operations/observability/observability/)
- GitLab 砍可观测产品史：[Jaeger 集成 15.0 移除](https://about.gitlab.com/blog/gitlab-releases-15-breaking-changes/) · [observe.gitlab.com 迁移 issue](https://gitlab.com/gitlab-com/gl-infra/delivery/-/work_items/21999)
- 本仓现行栈事实：`.service-matrix.yaml`（pigsty_node3 段） · `docs/TECH.md` §9 · `docs/observability/OBSERVABILITY.md` · `docs/observability/grafana/README.md` · `TODO.md`「采集层」行
