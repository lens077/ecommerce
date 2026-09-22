# 基础设施补齐任务

- [x] 盘点 node1/node2 外部 Casdoor、Postgres、Redis、Gorse、MinIO，确认不重复部署
- [x] 部署 Dragonfly v1.39.0，TLS + AUTH + OpenEBS PVC
- [x] 创建 Dragonfly 独立 Gateway/TCPRoute（10.10.31.242:6379）
- [x] 部署 ArgoCD chart 10.9.2，Web UI HTTPRoute（argocd.dev.test）；原生 CLI gRPC 保留受限管理通道
- [x] 更新 `.service-matrix.yaml` 和 `context/team/local-env.md` 的 PostgreSQL/Dragonfly/节点拓扑
- [x] 更新 Config Center README、Gatus 探针和组件交接文档
- [ ] 在 Pangolin 创建新集群 newt site，并迁移旧 node3/node4/node5 资源
- [ ] 创建 remote-dev 的 Dragonfly/PG/Kafka Pangolin resources
- [ ] 通过 Pangolin 验证 Grafana、ArgoCD、PG、Dragonfly、Kafka 的公网入口
- [ ] 完成 ArgoCD CLI 原生 gRPC 受限入口设计（HTTPRoute 不承载原生 gRPC）
- [ ] 部署或复用 OpenBao/ESO（当前 Casdoor/外部服务已在线，未重复部署）
- [ ] 为真实业务开发服务生成/校验 remote-dev Config Center 配置
