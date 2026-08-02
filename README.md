# 小镇做题家的电商项目
本项目的组成使用(或部分使用)了本人其他的仓库:
1. 网关: https://github.com/lens077/ecommerce-gateway
2. 云原生基础设施部署: https://github.com/lens077/cloud-native-deploy
3. 微服务开发脚手架: https://github.com/lens077/go-connect-template-cli
4. 微服务项目模板: https://github.com/lens077/go-connect-template

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
  这些技术栈来编写一个中大型的电商项目,预计代码量会超过5w,甚至10w以上代码,我需要通过RBAC权限模型来给电商的三个角色进行划分,目前是消费者,商家,管理员,
  微服务划分包括但不限商品,搜索(ES),订单,支付,库存等常见功能,请你扮演一个专业的软件工程思想,10年经验的前端,后端,基础设施架构师和用户体验优先的产品经理,给我设计出这个电商的模型,
  包括数据库, 后端架构设计, 微服务划分, 微服务之间的通信边界(领域事件),先给出电商最核心微服务,之后层层递进扩展

# 技术设计

1. 语言： Golang + React TypeScript
2. API：使用google protobuf定义API来规范前后端的交互，@bufbuild/buf负责生成
3. 通信：前后端使用connectrpc/connect(兼容gRPC)来进行RPC协议通信
4. 数据库：编写SQL，使用工具生成go代码来调用
5.

后端：后端架构参考go-kratos的template来划分，biz层是定义结构体，data层负责与数据库/MQ/Search等中间件交互，service层负责转换proto，server则是应用本身的服务(
uber/fx)和第三方服务，例如注册发现(consul)

6. 网关：身份验证和授权， 路由守卫，安全功能等集成到网关，将通用功能集成到网关层，后端每个微服务无需重复集成
7. 前端：pnpm workspace 的 monorepo，采用 vite-plus(vp) + React TypeScript。vite-plus 一个包同时提供 dev
   server、构建、测试(vitest)、lint(oxlint)、格式化(oxfmt)、任务运行器和 git 钩子，所以没有 husky /
   biome / eslint / prettier；提交信息由仓库根的 commitlint 校验。桌面端用 Tauri 套壳
8. CI/CD：通过GitHub Actions将前后端项目构建/打包推送到容器注册表并更新清单仓库的版本号，由Argo CD监听清单仓库的变更并更新部署
9. 可观测性：由fluent-bit采集日志（Info，Warn，Error），应用通过OpenTelemetry
   sdk发送应用指标，由Jaeger展示链路（微服务调用情况），来使用Grafana进行追踪，监控，优化

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
cd services/<service>

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
--header 'Authorization: Bearer ***REMOVED-JWT***' \
--data-raw '{}'
```

- CI:
  ![img_3.png](images/img_3.png)

- CD:
  ![img_2.png](images/img_2.png)

- Register/discover:
  ![img.png](images/img.png)

- Trace:
  ![img_1.png](images/img_1.png)

- Log:
  ![img_4.png](images/img_4.png)

- Metrics
  ![img_5.png](images/img_5.png)

## Frontend

`frontend/` 是一个 pnpm workspace monorepo，5 个 app + 8 个共享包。
结构、分包原则、四层目录职责和工具链细节见 [`frontend/README.md`](frontend/README.md)。

| app        | 端口 | 说明                                     | 启动                |
| ---------- | ---- | ---------------------------------------- | ------------------- |
| `consumer` | 3000 | 消费者端：商品、购物车、下单、地址、订单 | `pnpm dev`          |
| `merchant` | 3002 | 商家端：店铺、商品、订单、报表           | `pnpm dev:merchant` |
| `admin`    | 3003 | 管理端：用户、商家、品类、报表           | `vp run admin#dev`  |
| `config`   | 3005 | 配置中心：配置下发、历史、密钥脱敏       | `pnpm dev:config`   |
| `desktop`  | —    | Tauri 壳，套在上面三个之一外面           | `pnpm desktop`      |

共享包：`api`（Connect 传输层与拦截器）、`configs`、`constants`、`i18n`、
`tauri`（桌面端胶水）、`tracker`（埋点）、`ui`、`utils`。

```bash
cd frontend
pnpm i        # prepare 会跑 vp config 装 git 钩子（core.hooksPath 指向 frontend/.vite-hooks/_）
pnpm dev      # consumer，端口 3000
pnpm ready    # vp fmt && vp lint && vp run -r test && vp run -r build，提 PR 前跑它
```

测试：

```bash
curl -v http://localhost:3000
```

## 前端设计
### 地址页
“智能推荐/默认”：当用户进入“新增地址”页面时，通过 IP 定位自动选中“省、市、区”，用户只需要手动输入“详细地址（门牌号）”。

# 数据来源
1. IP: https://developer.aliyun.com/article/1638991
2. 中国省，市，区, 街道四级SQL数据: https://github.com/gaohuazi/china_regions

## 开发
### 推送
- 推送到 gateway 单独仓库 ： `git subtree push --prefix=gateway gateway main`
- 同步到主仓库 ： `git push main main`
