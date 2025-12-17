# 小镇做题家的电商项目

# 技术设计
1. 语言： Golang + React TypeScript
2. API：使用google protobuf定义API来规范前后端的交互，@bufbuild/buf负责生成
3. 通信：前后端使用connectrpc/connect(兼容gRPC)来进行RPC协议通信
4. 数据库：编写SQL，使用工具生成go代码来调用
5. 后端：后端架构参考go-kratos的template来划分，biz层是定义结构体，data层负责与数据库/MQ/Search等中间件交互，service层负责转换proto，server则是应用本身的服务(uber/fx)和第三方服务，例如注册发现(consul)
6. 网关：身份验证和授权， 路由守卫，安全功能等集成到网关，将通用功能集成到网关层，后端每个微服务无需重复集成
7. 前端：采用Vite+React TypeScript和husky+cz-git+biome来规范化，playwright+vitest用于测试
8. CI/CD：通过GitHub Actions将前后端项目构建/打包推送到容器注册表并更新清单仓库的版本号，由Argo CD监听清单仓库的变更并更新部署
9. 可观测性：由fluent-bit采集日志（Info，Warn，Error），应用通过OpenTelemetry sdk发送应用指标，由Jaeger展示链路（微服务调用情况），来使用Grafana进行追踪，监控，优化

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
3. 网关: Golang >= go1.13
4. 数据库：Postgres >= 12
5. 缓存：Redis >= 6
6. 注册/发现：Consul

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

启动后端微服务
```bash
cd application/<service>

go run cmd/server/main.go \
-config-center=http://<consul-addr> \
-config-path=<consul-service-config-file>
```

## 网关：
```shell
OWNER=OWNER \
CASDOOR_URL=https://CASDOOR_URL \
DISCOVERY_DSN=consul://<consul-addr> \
DISCOVERY_CONFIG_PATH=<consul-service-config-file> \
POLICIES_FILE_PATH=./dynamic-config/policies/policies.csv \
MODEL_FILE_PATH=./dynamic-config/policies/model.conf \
USE_TLS=false \
USE_HTTP3=false \
HTTP_PORT=8080 \
go run cmd/gateway/main.go
```

测试：
- 直接访问后端:
```bash
curl -v -X POST http://localhost:4000/greet.v1.GreetService/SubmitAuth \
--header 'Content-Type: application/json' \
--data-raw '{}'
```

- 经过网关:
```shell
curl -v -X POST http://localhost:8080/user.v1.UserService/UserProfile \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6ImVjb21tZXJjZSIsInR5cCI6IkpXVCJ9.eyJhdWQiOlsiMDI5MWFiMjFmNTZmZmE2NWY5ODQiXSwiYXZhdGFyIjoiaHR0cHM6Ly9jZG4uY2FzYmluLm9yZy9pbWcvY2FzYmluLnN2ZyIsImF6cCI6IjAyOTFhYjIxZjU2ZmZhNjVmOTg0IiwiZGlzcGxheU5hbWUiOiJ0ZXN0IiwiZW1haWwiOiJ4aWNvbnlAcXEuY29tIiwiZXhwIjoxNzY1OTUyNjc3LCJpYXQiOjE3NjU5NDkwNzcsImlkIjoiZTMzZTEyYmEtZmIyNS00ZmI1LWFhNGMtOTNmZWUyN2IxODQxIiwiaXNzIjoiaHR0cHM6Ly9hcGlrdi5jb206ODA4MSIsImp0aSI6ImFkbWluLzQ1Y2RmNmExLTUxYTItNDJhMi04MDFmLTM1MjI1NWY1NGI1NiIsIm5hbWUiOiJ0ZXN0IiwibmJmIjoxNzY1OTQ5MDc3LCJzdWIiOiJlMzNlMTJiYS1mYjI1LTRmYjUtYWE0Yy05M2ZlZTI3YjE4NDEiLCJ0YWciOiIiLCJ0b2tlblR5cGUiOiJhY2Nlc3MtdG9rZW4ifQ.uI2JOg2efTKUojBp5TbAPCDd27d08R66uLubOy084tDllPCp21me36gVrtdJJ5KKPQlsEd8vqxBK8gBUsy9vJOTeFjqm0GtwiGqsxemJc1rYV7-25rIeiiDz0JUnKEN0GMa6rmXesiWbM02pIC4WRnXisv1s8wPkYgvag_CJo8-RxjuwC54JQfcbt2u33TWKBUvlwNUlx7_jLDfrhMZmmyabCAFcVKOZkQBh2fbqjP4uIiVOM_oBvqF9tapRDq0ZWtI136LiZmqtDBzubTfC2X1QvHQNE6J_w93-LLpX1i-yooC7oXBNNNSh4379U_ZjcbFJYENd1-Ie_fUL6KJrmrC20SJK2Pby78NMYkaOpHNYSGzxKi25ULlbBEdmNTsHsQKPlLM3O3zWTWC04WZ2uXlEwD5j7nHJbiMuXqBeudvIFo_RMTwrJyU_u2FeHrHGmMxcFxERwOKO8vC-4u0JxUTL7BghgcJPg776wU4VJ5ayMVGTQIEOhVONlGZg3wzqJHPZ1WPkYncweZrD6LTlP3L-YarO2mLoa6r6fS5s2UtTIQXEri-zhzqegDEeGgPVIWlVs4PEK-xnH3JluWMUCNCd-AykD11YRqI_iwYqFOSjQpm2WLywGYiL7YVYufqfxsUEXzXRphHR1Q9mXb8IET0n4aTY_F0rtlf2sd9QucU' \
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
