# 基础设施补齐任务

- [x] 盘点 node1/node2 外部 Casdoor、Postgres、Redis、Gorse、MinIO，确认不重复部署
- [x] 部署 Dragonfly v1.39.0，TLS + AUTH + OpenEBS PVC
- [x] 创建 Dragonfly 独立 Gateway/TCPRoute（10.10.31.242:6379）
- [x] 部署 ArgoCD chart 10.9.2，Web UI HTTPRoute（argocd.dev.test）；原生 CLI gRPC 保留受限管理通道
- [x] 更新 `.service-matrix.yaml` 和 `context/team/local-env.md` 的 PostgreSQL/Dragonfly/节点拓扑
- [x] 更新 Config Center README、Gatus 探针和组件交接文档
- [x] 在 Pangolin 创建新集群 newt site，并迁移旧 node3/node4/node5 资源（site 11，旧 site 已删）
- [x] 创建 remote-dev 的 Dragonfly/PG/Kafka Pangolin resources（rid 59/26/61，2026-09-23 协议级实测）
- [x] 通过 Pangolin 验证 Grafana、ArgoCD、PG、Dragonfly、Kafka 的公网入口（ArgoCD rid 60 新建；traces/vmalert/alerts/hc 用 access token 验业务内容）
- [ ] 完成 ArgoCD CLI 原生 gRPC 受限入口设计（HTTPRoute 不承载原生 gRPC）
- [x] 部署或复用 OpenBao/ESO；OpenFGA/Kyverno/Tetragon/Rollouts/KEDA/VPA 已装并功能级验证（VPA updater 关）
- [ ] 为真实业务开发服务生成/校验 remote-dev Config Center 配置——阻塞：Config Center 未部署（P5，需人工签 Casdoor machine token）
- [x] 真实行 CDC 往返（PG→Kafka→ES 含 search_catalog）；source `snapshot.mode=when_needed` 修 broker 滚动后 task FAILED
