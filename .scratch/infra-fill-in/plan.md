# 基础设施补齐计划

## 目标

在现有 k1/k2/k3 集群中补齐项目当前需要且未部署的基础设施，避免重复部署已经在线的 node1/node2 服务；统一 Pangolin → Gateway API → K8s Service 的公网拓扑，并同步 `remote-dev` 与拓扑真相源。

## 实施顺序

1. 盘点外部基础设施：Casdoor、Gorse、MinIO、Postgres/Redis，确认不在 K8s 重复部署。
2. 部署 Dragonfly：集群内 TLS、Secret、ClusterIP、TCPRoute；验证 TLS/认证/健康。
3. 更新 `remote-dev`：缓存地址切换到 Dragonfly 新入口；同步配置中心模板与文档。
4. 部署 ArgoCD：固定版本、Server insecure 模式仅限集群 Gateway 使用；Web UI HTTPRoute；CLI/gRPC 不通过 HTTPS HTTPRoute 强行代理，保留 core/port-forward 或单独 h2c 受限入口。
5. 更新 `.service-matrix.yaml`、`TODO.md`/文档和组件配置，标明已部署、外部复用、暂缓项。
6. 验证：Pod、Service、Route 状态；Dragonfly TLS；ArgoCD Web UI；Config Center/remote-dev 配置引用；无凭据入 Git。

当前进度：Dragonfly、ArgoCD、Gatus 集群内配置已完成；Pangolin 新 site / remote-dev 公网资源仍待人工创建与验证。

## 风险与回滚

- Dragonfly 仅作为可丢缓存；不承载锁、幂等键或领域真相。
- TCPRoute/TLSRoute 使用独立 LB 地址，不能抢占共享 HTTP Gateway 的 443。
- ArgoCD CLI 原生 gRPC 不能假设 HTTPS HTTPRoute 能透传；优先使用 K8s API/port-forward，公网 CLI 入口需后续 Pangolin 受限资源和 h2c 验证。
- 回滚：删除新增 Dragonfly/ArgoCD release 与 Route；恢复 `remote-dev` 配置到旧值前先确认旧 Pangolin 资源仍存在。
