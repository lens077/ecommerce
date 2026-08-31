# node3 黑盒探活

本目录保存 node3 上独立黑盒探活的无凭据副本。探针运行在 Kubernetes 集群外部，因此集群控制面或集群内采集器故障时，探针仍可执行。

## 部署位置

node3 使用以下固定路径：

- 配置：`/opt/ecommerce-gatus/config.yaml`
- SQLite 数据：`/opt/ecommerce-gatus/data/gatus.db`
- 容器：`ecommerce-gatus`
- 本机状态页：`http://127.0.0.1:8081`

node3 已有另一套 `gatus` 容器。本部署使用独立容器、目录、端口和数据库，不修改或重启已有容器。

## 探测面

| 探针 | 判定条件 | 覆盖范围 |
|---|---|---|
| `shop-home` | HTTP 200，响应体包含「灯市」 | node1 Pangolin、newt、Cilium Gateway、consumer 前端 |
| `product-detail-ssr` | HTTP 200，响应体包含 `estee-lauder-anr` | 公网隧道、consumer-next、网关、product 服务与商品数据 |
| `pangolin-control-plane` | HTTP 200，响应体包含 `Pangolin` | node1 TLS、Traefik 与 Pangolin 控制面 |
| `node1-homepage` | HTTP 200，响应体包含「服务导航」 | node1 TLS 与本机 Nginx |

以下候选项不进入配置：

- `https://gateway.apikv.com/healthz` 和 Product RPC 均从 node3 收到 Envoy 404。只读检查显示集群没有 gateway `HTTPRoute`。在恢复 gateway `HTTPRoute` 前，不能把 404 写成健康状态。
- `https://192.168.3.101:6443/livez` 从 node3 连接超时。node3 无到集群私网的路由。

`product-detail-ssr` 是当前不修改集群的功能性替代探针。它校验响应体中的商品编码，不把「HTTP 200 但后端内容为空」判为成功。恢复 gateway `HTTPRoute` 后，应增加任务书指定的 POST RPC，并继续校验响应体中的 `estee-lauder-anr`。

## 告警出口

Gatus 使用 Alertmanager API v2：`http://127.0.0.1:9059/api/v2/alerts`。容器使用 host network，因此回环地址指向 node3 宿主机。此链路不需要凭据，告警可通过 Alertmanager `/api/v2/alerts` 查询。

Gatus 连续失败 2 次后发送 `GatusBlackboxEndpointDown`。配置设置 `send-on-resolved: false`。恢复后，Alertmanager 在 `resolve_timeout` 到期时自动关闭告警；恢复状态可能比 Gatus 状态页延迟数分钟。

## 更新步骤

更新前，必须从 node3 逐项执行真实请求。只有可达且响应内容符合预期的端点才能进入 `config.yaml`。

```bash
scp infrastructure/gatus/config.yaml node3:/tmp/ecommerce-gatus-config.yaml
ssh node3 'install -d -m 0755 /opt/ecommerce-gatus/data && \
  install -m 0644 /tmp/ecommerce-gatus-config.yaml /opt/ecommerce-gatus/config.yaml'
```

首次部署：

```bash
ssh node3 'docker run -d \
  --name ecommerce-gatus \
  --restart unless-stopped \
  --network host \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  -v /opt/ecommerce-gatus/config.yaml:/config/config.yaml:ro \
  -v /opt/ecommerce-gatus/data:/data \
  ghcr.io/twin/gatus:v5.36.0@sha256:c5f210d095fa78e6efaa20ffeb14803f2ba4f10615e16a6d12087697149617f0'
```

更新已有部署时，先备份配置，再替换本任务创建的容器：

```bash
ssh node3 'cp /opt/ecommerce-gatus/config.yaml \
  /opt/ecommerce-gatus/config.yaml.bak-$(date +%Y%m%d%H%M%S)'
# 上传新配置后，删除并按「首次部署」命令重建 ecommerce-gatus。
```

## 验证

检查所有真实端点的最新结果：

```bash
ssh node3 'curl -fsS http://127.0.0.1:8081/api/v1/endpoints/statuses' \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print([(x["group"],x["name"],x["results"][0]["success"]) for x in d])'
```

验证告警链路时，临时加入指向 `http://127.0.0.1:1/` 的 canary 端点，并将 `failure-threshold` 设为 1。确认 Alertmanager `/api/v2/alerts` 出现 `GatusBlackboxEndpointDown` 后，删除 canary 并重建容器。不要把 canary 留在长期配置中。

## 回滚和卸载

回滚配置时，恢复最近的 `config.yaml.bak-*`，再重建 `ecommerce-gatus` 容器。完全卸载：

```bash
ssh node3 'docker rm -f ecommerce-gatus'
```

保留 `/opt/ecommerce-gatus/data` 可保留历史结果。确认不再需要历史后，才可人工删除 `/opt/ecommerce-gatus`。卸载不会修改 node3 上已有的 `gatus` 容器、Pigsty 服务或 Kubernetes 工作负载。
