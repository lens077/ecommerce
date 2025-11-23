# 小镇做题家的电商项目

# 技术设计
1. 语言： Golang + React TypeScript
2. API：使用google protobuf定义API来规范前后端的交互，@bufbuild/buf负责生成
3. 通信：前后端使用connectrpc/connect(兼容gRPC)来进行RPC协议通信
4. 数据库：编写SQL，使用工具生成go代码来调用
5. 后端：后端架构参考go-kratos的template来划分，biz层是定义结构体，data层负责与数据库/MQ/Search等中间件交互，service层负责转换proto，server则是应用本身的服务(uber/fx)和第三方服务，例如注册发现(consul)
6. 前端：采用Vite+React TypeScript和husky+cz-git+biome来规范化，playwright+vitest用于测试
7. CI/CD：通过GitHub Actions将前后端项目构建/打包推送到容器注册表并更新清单仓库的版本号，由Argo CD监听清单仓库的变更并更新部署
8. 可观测性：由fluent-bit采集日志（Info，Warn，Error），应用通过OpenTelemetry sdk发送应用指标，由Jaeger展示链路（微服务调用情况），来使用Grafana进行追踪，监控，优化

# Backend stack
- golang
- connect-go
- Buf
- Protobuf
- sqlc
- fx
- casdoor

# Frontend stack
- React
- TypeScript
- Connect-web
- Buf

# Protocols
- RPC

# Infrastructure
## Scheduling
- Docker
- Kubernetes

## Streaming
- kafka

## Observability
- loki
- opentelemetry
- victoria-metrics
- jaeger
- grafana

## Databases
- Postgres
- Redis

# 先决条件
1. 前端：Node.js >= 22
2. 后端：Golang >= go1.13
3. 数据库：Postgres >= 12
4. 缓存：Redis >= 6
5. 注册/发现：Consul

如果想体验完整项目，你还需安装:
1. Docker
2. Kubernetes
3. ArgoCD
4. Consul
5. cert-manager
6. OpenTelemetry
7. Victoria metrics
8. Grafana
9. Loki
10. Jaeger
11. fluent-bit

# 运行
## backend
```bash
docker compose -f backend/infrastructure/postgres up -d
docker compose -f backend/infrastructure/redis up -d
docker compose -f backend/infrastructure/consul up -d
```
修改`configs/config.yaml`为你的host地址:
```yaml
data:
  database:
    host: "192.168.3.105"
  redis:
    host: "192.168.3.114"
```

启动后端
```bash
make run
```

测试：
- api:
```bash
curl -v -X POST http://localhost:4000/greet.v1.GreetService/SubmitAuth \
--header 'Content-Type: application/json' \
--data-raw '{}'
```

- CI:
![img_3.png](img_3.png)

- CD:
![img_2.png](img_2.png)

- Register/discover:
![img.png](img.png)

- Trace:
![img_1.png](img_1.png)

- Log:
![img_4.png](img_4.png)

- Metrics
![img_5.png](img_5.png)

## Frontend
```bash
pnpm i
pnpm dev
```

测试：
```bash
curl -v http://localhost:3000
```
