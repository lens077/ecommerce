# 电商项目网站全链路 WebGL 设计：体素沙盘与请求导体

> 状态：**设计方案 + 可运行设计稿**（2026-09-10）。设计稿见同目录 [`voxel-construction-site-demo.html`](voxel-construction-site-demo.html)，单文件、Three.js r160、模拟数据。
> 对照的真实链路以 [`docs/TECH.md`](../../TECH.md) §2 与 [`.service-matrix.yaml`](../../../.service-matrix.yaml) 为准。
> 本文只定「画什么、状态从哪来、请求怎么走、用什么画、长什么样」；组件当前实况不在本文核实，凡依赖实况的条目标「待核实」。进度见 [`docs/todo/前端技术栈与工程化.md`](../../todo/前端技术栈与工程化.md)。

## 一、目标与定位

把 TECH.md §2.1 的生产请求路径做成一个可交互的 3D 沙盘：

- **上层是前端视角**，底层是基础设施；画面自上而下与请求自外向内同向。
- **每个基础设施是一个体素物理块**，块上有一盏灯：健康检查通过亮绿灯，降级亮琥珀灯，离线或错误亮红灯，状态未知或过期则整块变暗。
- **请求是导体**：块与块之间用铜色走线连接，请求以光脉冲沿走线流动，贯穿浏览器、边缘、Kubernetes 网络、网关、微服务与数据层。
- **两种数据源共用一份状态契约**：默认用模拟状态离线演示，可切换到真实健康聚合数据。

它不是监控面板的替代品，而是「链路怎么协作」的教学与演示入口：面板回答「哪里坏了」，沙盘回答「坏在链路的哪一环、请求会在哪里被挡住」。

## 二、场景布局：阶梯式等轴测沙盘

> 2026-09-10 第一版用透视相机 + 四块悬浮平板 + 每条边一根飞线管，实测画面糊成一团、平板互不相连。第二版改为下面的形态，截图见 §十一。

整个沙盘是**一整块阶梯状实体**，从后向前、从高到低四级台阶。等轴测视角下「更远」与「更高」都朝屏幕上方，所以客户端在最上、数据层在最下，与请求方向一致。

| 台阶 | 承载的逻辑层 | 物理块 | 台面高度 y | z 范围 |
|---|---|---|---:|---|
| T1 客户端 | L1 | consumer SPA、consumer-next、merchant、admin、Tauri | 24 | −50 … −34 |
| T2 边缘 | L2 | CDN / 云 WAF（规划位）、node1 Pangolin、Casdoor、node2 边缘主机 | 16 | −34 … −18 |
| T3 集群 | L3 + L4 + L5 | 三块节点机架；Cilium Gateway、CiliumNetworkPolicy 墙、Hubble；control-tower、OpenFGA、Dragonfly Session；10 个服务 | 8 | −18 … 16 |
| T4 数据与观测 | L6 | 左段 PostgreSQL、Elasticsearch、Kafka、Dragonfly Cache、Gorse、MinIO；右段 OTel Collector、Victoria 三件套、Gatus、聚合器 | 0 | 16 … 42 |

布局约束：

- **脊线**。一根铜色主走线沿 `x = 0` 从 T1 母线一路下台阶到 T4 母线，在每级台阶的立面垂直下落。Pangolin、Cilium Gateway、control-tower 三个块直接坐在脊线上，请求必须穿过它们。
- **母线与支线**。每级台阶一条横向母线；不在脊线上的块用一条短支线接母线。任何两块之间的路径都是「支线 → 母线 → 脊线 → 母线 → 支线」，画面里只有一根主干。
- **节点机架**。T3 上三块薄机架对应 node101 / node102 / node103。网关层与服务层的 Pod 块落在机架上，机架离线时其上的块一起变暗，与真实故障域一致。
- **CiliumNetworkPolicy 墙**。T3 后缘一道城墙，只在脊线处开一道门，对应「只放行 Gateway → control-tower」。
- **集群外块**用不同的底座色区分（Pangolin、Casdoor、node2、node3 上的数据与观测组件）。观测段的母线画成虚线，表示遥测旁路不在请求主路径上。

逻辑层 L1–L6 的定义仍以 TECH.md §2.1 为准；台阶只是把 L3、L4、L5 压进同一级，因为它们共享节点故障域。

## 三、物理块清单与亮灯规则

### 3.1 块清单

每个块有唯一 `id`，用于拓扑、状态与场景三份数据之间引用。表中「健康来源」是**设计采用的来源**，接入时逐项核实。造型见 §七.2。

| id | 台阶 | 块 | 健康来源（设计） | 备注 |
|---|---|---|---|---|
| `client.consumer` | T1 | consumer SPA | 浏览器本地：页面自身可加载即视为在线 | 沙盘运行在浏览器里，客户端块恒亮，只作为请求起点 |
| `client.consumer-next` | T1 | consumer-next | Gatus 黑盒探测 `shop-home` / `product-detail-ssr` | |
| `client.merchant` / `client.admin` / `client.desktop` | T1 | 商家端 / 管理端 / Tauri | 无探针，恒为「未知」 | 只作请求起点 |
| `edge.cdn` | T2 | CDN / 云 WAF | 无探针，恒为「规划位」 | TECH.md §2.2 定义但未落地，半透明 |
| `edge.node1.pangolin` | T2 | Pangolin 入口 | Gatus 探测 `pangolin-control-plane` / `node1-homepage` | 承载 gateway 与 shop 两个域名的 TLS 终止；坐在脊线上 |
| `gw.casdoor` | T2 | Casdoor | Gatus 探测 `casdoor.apikv.com`〔探针待核实〕 | 集群外，经 Pangolin |
| `edge.node2` | T2 | node2 边缘主机 | Gatus 探测 Gorse / MinIO 入口 | |
| `k8s.node101` / `k8s.node102` / `k8s.node103` | T3 | 三台节点 | VictoriaMetrics 查询 `k8s_node_condition_ready`〔指标名待核实，见 TECH.md §9.3〕 | node101 兼控制面 |
| `k8s.cilium-gateway` | T3 | Cilium Gateway API | Gatus 探测 `gateway-health`（`https://gateway.apikv.com/healthz`） | 探到 200 即 T2→T3 通路存在；坐在脊线上 |
| `k8s.cnp` | T3 | CiliumNetworkPolicy 默认拒绝墙 | Hubble 流指标存在性（`HubbleFlowTelemetryMissing` 告警的反向） | 画成城墙，只在脊线处开门 |
| `k8s.hubble` | T3 | Hubble | 同上 | |
| `gw.control-tower` | T3 | control-tower gateway | 网关 `/readyz`（含 Session Store ping） | `/healthz` 只证明进程活着，亮灯以 `/readyz` 为准；坐在脊线上 |
| `gw.dragonfly-session` | T3 | Dragonfly Session 实例 | 由 `gw.control-tower` 的 `/readyz` 间接反映 | 推断态 |
| `gw.openfga` | T3 | OpenFGA | Pod 就绪计数〔指标名待核实〕 | |
| `svc.<name>` × 10 | T3 | 十个 Go 服务 | 各服务 `/healthz` JSON（含依赖状态与版本） | 与 Helm readinessProbe 同一路径 |
| `data.postgres` | T4 | PostgreSQL（node3 Pigsty） | 十个服务 `/healthz` 中的依赖字段聚合 + node3 Pigsty 自带指标 | 经 node1 隧道 |
| `data.elasticsearch` | T4 | Elasticsearch | `svc.search` `/healthz` 的依赖字段（alias 可读） | |
| `data.kafka` | T4 | Kafka | Debezium connector / task 状态与 sink lag（node3 `cdc-connect-exporter`） | 当前只承载搜索 CDC 行投影线 |
| `data.gorse` / `data.minio` | T4 | Gorse / MinIO | Gatus 探测入口域名 | 在 node2 |
| `data.dragonfly-cache` | T4 | Dragonfly 业务缓存 | 服务 `/healthz` 依赖字段聚合 | 与 Session 实例分开画，对应 TECH.md §7.1「严禁混用实例」 |
| `obs.otel-collector` | T4 | OTel Collector | VictoriaMetrics `otelcol_receiver_accepted_*` 是否持续增长 | |
| `obs.vm` / `obs.vl` / `obs.vt` | T4 | Victoria 三件套 | 各自 `/health` 或 Gatus 探测 | |
| `obs.gatus` | T4 | Gatus | 聚合器能否读到 Gatus API | Gatus 离线时，所有以 Gatus 为来源的块降为「未知」 |
| `obs.aggregator` | T4 | topology-health 聚合器 | 前端能否按周期拉到新样本 | 离线时全部块过期转灭 |

### 3.2 四态灯与判定

| 状态 | 灯 | 块外观 | 判定 |
|---|---|---|---|
| `up` | 绿，稳定发光 | 正常材质 | 最近一次探测成功，且延迟低于阈值 |
| `degraded` | 琥珀，慢闪 | 略暗 | 探测成功但延迟超阈值，或多副本中部分就绪，或 `/healthz` 返回 200 但依赖字段有 `false` |
| `down` | 红，快闪 | 变暗一档 | 探测失败、非 200、Pod 未就绪 |
| `unknown` | 灭 | 变暗两档 | 没有来源，或最近一次样本超过 3 个采样周期未更新 |

规则：

- **不只靠颜色**。四态同时用亮度、闪烁频率与块体明暗区分，色觉障碍用户也能读。
- **过期即未知**。真实数据源断了不能停留在上一帧的绿灯，超时后必须转灭。
- **推断态要标出来**。`gw.dragonfly-session` 这类靠间接来源推断的块，HUD 里写明来源是推断。
- **节点带动 Pod**。节点 `down` 时，落在它上面的所有块强制降为 `unknown`，不管它们自己上一次的样本是什么。
- **网关跟随会话存储**。`gw.dragonfly-session` 非 `up` 时 `gw.control-tower` 按 readyz 规则转 `down`。

### 3.3 走线状态

- **支线**颜色随其所属块的状态变：`up` 铜色、`degraded` 亮琥珀、`down` 暗红、`unknown` 暗铜。
- **母线与脊线**保持中性铜色，不承载状态；它们是网络本身，不代表某个组件。
- **脉冲在进入下一块前检查目标块状态**，目标非 `up` / `degraded` 时脉冲停在当前块并闪红。
- **`depends_on_planned` 画成虚线**，只在服务层用短虚线把 order 与 inventory / product / address、payment 与 order 连起来；脉冲走到虚线即停止并标「未接线」。虚线不走母线与脊线，避免与真实路径混淆。

## 四、状态契约：模拟与真实共用一份 JSON

沙盘只认一种输入。模拟源与真实源都产出同一结构，前端不区分来源。

```json
{
  "generated_at": "2026-09-10T08:00:00Z",
  "interval_seconds": 30,
  "blocks": {
    "gw.control-tower": {
      "state": "up",
      "source": "readyz",
      "inferred": false,
      "latency_ms": 12,
      "replicas": { "ready": 2, "desired": 2 },
      "node": null,
      "detail": "ok"
    },
    "svc.cart": {
      "state": "degraded",
      "source": "healthz",
      "inferred": false,
      "latency_ms": 480,
      "replicas": { "ready": 1, "desired": 1 },
      "node": "k8s.node102",
      "detail": "deps.minio=false"
    }
  }
}
```

字段约定：

| 字段 | 类型 | 说明 |
|---|---|---|
| `generated_at` | RFC 3339 | 聚合时刻。前端据此判断过期 |
| `interval_seconds` | 整数 | 聚合周期。过期阈值 = 3 × 本值 |
| `blocks.<id>.state` | 枚举 | `up` / `degraded` / `down` / `unknown` |
| `blocks.<id>.source` | 字符串 | 来源标识，如 `healthz`、`readyz`、`gatus`、`vm`、`mock` |
| `blocks.<id>.inferred` | 布尔 | 是否推断态 |
| `blocks.<id>.node` | 块 id 或 null | Pod 所在节点，决定块落在哪块机架上 |
| `blocks.<id>.detail` | 字符串 | HUD 展示的一行说明，不含凭据与内网地址 |

拓扑本身（有哪些块、哪些边、边的策略状态、块的台阶与坐标）是另一份静态数据，由人维护；状态文件只更新 `blocks` 里的动态字段。两份数据的块 id 必须一致，页面加载时校验，不一致直接报错而不是静默丢块。设计稿阶段拓扑内联在 HTML 里，S1 拆成 `topology.json`。

## 五、数据接入层

### 5.1 模拟源

- 与真实源同结构，默认全 `up`；无探针的块为 `unknown`。
- HUD 提供「逐块故障开关」：任一块可切四态，切换立即生效，并按 §三 规则联动走线与脉冲。
- 提供故障剧本：`node103 离线`、`Dragonfly Session 不可达`（网关 readyz 转红、所有需登录场景在网关被挡）、`node3 隧道断开`（PostgreSQL、Kafka、Elasticsearch 与观测层同时转红，对应 `.service-matrix.yaml` 里「node3 或 Pangolin 隧道故障 = 数据面连不上库、观测全断」）、`cart 依赖降级`。

### 5.2 真实源：健康聚合器

真实源不能让浏览器直接探内网端点。集群内 `/healthz` 不对公网开放，Gatus 与 VictoriaMetrics 在 node3，跨域与鉴权都不允许前端直连。设计一个**健康聚合器**：

- 位置：本仓 `tools/topology-health`，Go 二进制，与其他 tools 同构。
- 运行形态：集群内单副本 Deployment 或 CronJob，周期与 `interval_seconds` 一致。
- 采集来源：按 §3.1 表，分四类：
  1. 集群内 HTTP：十个服务 `/healthz`、网关 `/readyz`；
  2. Kubernetes API：Pod 就绪计数与所在节点（只读 RBAC，限定 `ecommerce`、`gateway`、`openfga` 等命名空间）；
  3. Gatus API：边缘与集群外块；
  4. VictoriaMetrics 查询 API：节点、Hubble 存在性、OTel Collector 吞吐。
- 输出：一份 §四 结构的 JSON。
- 暴露方式：经 control-tower gateway 新增本地路由 `/topology/state`，**按 C 级（必须登录）处理，且限 admin 角色**。理由：状态文件包含每个块的健康与副本信息，属于内部拓扑，不得匿名可读。本地路由与 `/auth/` 同列，不进包路由。

聚合器本身也是一个块（`obs.aggregator`），它离线时前端收不到新样本，所有块按过期规则转灭，画面自证「数据源没了」。

### 5.3 前端切换

HUD 顶部一个开关：`模拟 | 真实`。真实模式下每 `interval_seconds` 拉一次 `/topology/state`，失败三次后自动退回模拟并在 HUD 显示原因。真实模式不允许手动改块状态，只能看。

跨仓改动：新增网关路由在 control-tower 仓，本仓 `backend/structcheck` 核对路由模板时同步升级依赖版本（AGENTS.md「反直觉约定」）。

## 六、请求导体

### 6.1 背景脉冲

链路上持续有低密度脉冲流动，表示系统在运转。脉冲只走 A 级匿名路由（`.service-matrix.yaml` `anonymous_paths`），随机在 `Search`、`GetProductDetail`、`Recommend`、`ListRegions` 中挑选，起点随机取 T1 的一个客户端块。默认约每秒 1 条。

### 6.2 场景触发

HUD 提供场景按钮，每个场景按真实路由走一条**高亮追踪**脉冲，HUD 同步逐跳说明。

| 场景 | 级别 | 路径（块 id 序列） | 网关内动作 | 落地依赖 |
|---|---|---|---|---|
| 搜索 | A 匿名 | `client.consumer` → `edge.node1.pangolin` → `k8s.cilium-gateway` → `gw.control-tower` → `svc.search` → `data.elasticsearch` | 剥离 `x-md-*`，匿名清单放行，不查 Session | ES alias 只读 |
| 商品详情 | A 匿名 | 同上，至 `svc.product` → `data.gorse` | 同上 | Gorse 走 node2 |
| 加入购物车 | B 访客 | 至 `svc.cart` → `data.minio` | 剥离头，签发或识别访客 cookie，注入 `x-md-global-user-id` 与 `x-md-global-anonymous=true` | 对应 TECH.md §8.4，**当前为设计草案** |
| 登录 | — | `client.consumer` → … → `gw.control-tower` → `gw.casdoor` | BFF `/auth/` 本地路由，Casdoor code exchange，会话写 Dragonfly | |
| 下单 | C 登录 | 至 `svc.order` → `svc.inventory`（虚线） | 剥离头 → 查 Session（Dragonfly）→ OpenFGA Check → 注入可信头 → H2C 转发 | 对应 `depends_on_planned`，脉冲在 `svc.order` 停止并标「服务间调用未接线」 |
| 支付回调 | A 匿名 | 起点 `edge.node1.pangolin` → … → `svc.payment` → `data.postgres` | 匿名清单放行，签名校验在服务内 | 外部支付渠道块暂不画 |

每一跳的 HUD 文案写「在哪一层、谁做了什么、依据是什么」，网关一跳固定展示 §八.5 十步序列中命中的那几步。

### 6.3 Fail-closed 演示

脉冲遇到非 `up` 的块或被拒绝的策略时，在该块处中断、闪红，并显示对应 ConnectRPC 错误码：

| 中断位置 | 原因 | 错误码 |
|---|---|---|
| `gw.control-tower` | 场景为 C 级且 HUD 未勾选「已登录」 | `UNAUTHENTICATED` |
| `gw.control-tower` | OpenFGA 关系不成立（模拟跨租户） | `PERMISSION_DENIED` |
| `gw.control-tower` | `gw.dragonfly-session` 非 `up` | 网关 readyz 失败，摘流量；脉冲停在 `k8s.cilium-gateway` 并显示 `UNAVAILABLE` |
| `gw.control-tower` | 路由表无此前缀 | `NOT_FOUND` |
| `svc.*` | 目标服务非 `up` | `UNAVAILABLE` |
| `svc.*` | 模拟字段不合法 | `INVALID_ARGUMENT` |
| 任一虚线边 | 边为 `planned` | 不是错误，脉冲停止并标「未接线」 |

## 七、Three.js r160 技术设计

### 7.1 交付形态

- 单页离线文件 `voxel-construction-site-demo.html`，Three.js r160 通过 import map 引入，路径固定为 `three` 与 `three/addons/`。设计稿阶段指向 unpkg 固定版本；S1 把 r160 的 `three.module.js` 与用到的 addons 拷到 `voxel/vendor/`，离线运行不依赖网络。
- 不进 `frontend/` pnpm workspace。理由：它是设计文档的配套演示，不参与前端构建与门禁。将来若要嵌入 admin 后台，只需把 `voxel/` 作为模块引入并把数据源指向 `/topology/state`。

### 7.2 组件造型：按各组件的图标取形

所有组件都由少量体素零件（`BoxGeometry`、低段数 `CylinderGeometry` / `ConeGeometry` / `TorusGeometry` / `OctahedronGeometry`）拼装，顶点色着色后**合并成一个 Mesh**，整个沙盘的组件只占一次 draw call。

| 组件 | 造型 | 取形依据 |
|---|---|---|
| consumer / consumer-next / merchant / admin | 显示器：底座 + 支柱 + 蓝色屏幕 | 浏览器端 |
| Tauri | 桌面主机，前面板一条亮屏 | 桌面壳 |
| CDN / 云 WAF | 半透明盾牌，中间一条黄色竖纹 | 边缘防护，规划位 |
| Pangolin | 隧道拱门：两根深色门柱 + 阶梯式拱顶 + 黑色洞口 | 公网隧道入口 |
| Casdoor | 门：深紫门框 + 紫色门板 + 黄色门把 | 名字里的 door |
| node2 | 带三条散热槽的主机箱 | 边缘主机 |
| 节点 | 薄机架底板，四边有轨条 | 服务器机架 |
| Cilium Gateway | 黄色六边形蜂巢，上面一个深色六边形芯 | Cilium 的蜂巢与蜜蜂 |
| CiliumNetworkPolicy | 城墙 + 垛口，只在脊线处开一道黄色门 | 默认拒绝 |
| Hubble | 小底座 + 支柱 + 倾斜的碟形天线 | 望远镜 |
| control-tower | 塔台：方形底座、白色塔柱、红色环带、玻璃控制室、天线 | 名字里的塔台 |
| OpenFGA | 挂锁：锁体 + 半圆锁梁 + 钥匙孔 | 授权 |
| Dragonfly（Session 与 Cache） | 带四片翅膀的芯片 | 蜻蜓 |
| 10 个 Go 服务 | 青色货箱，带盖与十字捆带 | Pod 里的容器 |
| PostgreSQL | 三层蓝色圆柱数据库，层间亮环 | 数据库 |
| Elasticsearch | 三层黄色圆柱，顶上一只放大镜 | 搜索 |
| Kafka | 三根深色横管束在支架上 | 分区日志 |
| Gorse | 橙色八面体 | 推荐引擎的星形 |
| MinIO / Silo | 红色桶，桶口一圈亮环 | 存储桶 |
| OTel Collector | 绿色漏斗 | 采集汇聚 |
| Victoria 三件套 | 紫色细塔楼，顶端亮灯 | 存储塔 |
| Gatus | 底座 + 支柱 + 倾斜的雷达盘 | 黑盒探测 |
| topology-health 聚合器 | 绿色小盒 + 天线 + 黄色信标 | 聚合上报 |

### 7.3 场景图

```text
Scene
├── Lights：HemisphereLight（天光冷、地光暖）+ DirectionalLight（主光，带阴影）
├── Massif：阶梯实体（四级台阶 + 台面 + 前缘压条 + 底板），一个 Mesh
├── PolicyWall：CiliumNetworkPolicy 城墙，一个 Mesh
├── Blocks：全部组件，顶点色合并为一个 Mesh；记录每块的顶点范围用于变暗与拾取
├── Lamps：InstancedMesh，每块一盏，MeshBasicMaterial，bloom 只挑它们
├── Tracks：脊线 + 母线 + 支线 + 虚线，扁平铜色盒段合并为一个 Mesh；支线段记录顶点范围用于变色
├── Pulses：InstancedMesh 小球，沿折线按弧长推进
├── Labels：CSS2DRenderer 文字标签（组件名、台阶名、墙名）
└── OrthographicCamera + OrbitControls（左键平移、滚轮缩放、右键小幅微转）
```

### 7.4 关键实现点

- **等轴测正交相机**。`OrthographicCamera`，视线方向 `(1, 1, 1)` 归一化，视口半高 46；数字键 1–4 聚焦各台阶，0 复位。OrbitControls 限制极角与方位角范围，避免转到破坏等轴测读感的角度。
- **曼哈顿布线**。路径函数 `route(A, B)` 只产出轴对齐折线：A 支线 → A 母线 → 脊线切片 → B 母线 → B 支线。脊线是预先定义的折线，含每级台阶立面的垂直下落点；脊线切片按 z 区间截取并按方向翻转。坐在脊线上的块直接以脊线上的点为端口。
- **走线是几何不是线段**。每段走线是扁平盒子，母线宽 0.7、脊线宽 1.1、支线宽 0.55；金属度 0.6，弱自发光，让铜色在暗底上有厚度。
- **脉冲沿折线按弧长推进**。每条 hop 路径缓存累计弧长；脉冲对象只记 `(ids, i, d)`，每帧 `d += speed × dt`，到达 hop 末端换下一 hop 并在进入前检查目标块状态。
- **灯用自发光基础材质**。四态颜色乘以 2.2–2.6 倍亮度进入 bloom，`UnrealBloomPass` 阈值 0.92、强度 0.55、半径 0.35，普通体素与走线不进 bloom。
- **拾取**。`Raycaster` 命中合并 Mesh 后，用 `faceIndex` 反查索引数组得到顶点号，再按每块的顶点范围定位块。
- **合并几何的兼容性**。`OctahedronGeometry` 是非索引几何，其他都是索引几何，直接 `mergeGeometries` 会失败；统一在着色函数里 `toNonIndexed()` 后再合并。
- **响应式与降级**。`devicePixelRatio` 上限 2；帧率连续 2 秒低于 45 时关 bloom，HUD 显示当前档位。

### 7.5 性能预算

| 项 | 预算 |
|---|---|
| draw call | 不超过 20（阶梯 1、墙 1、组件 1、灯 1、走线 1、脉冲 1、后处理若干） |
| 组件三角形总数 | 不超过 60k |
| 同时存在的脉冲 | 不超过 200 |
| 目标帧率 | 60 fps；降级线 45 fps |
| 首屏资源 | Three.js r160 本体 + addons 不超过 1.2 MB 未压缩，无纹理贴图 |

### 7.6 文件清单（S1 拆分目标）

| 文件 | 内容 |
|---|---|
| `voxel-construction-site-demo.html` | 页面壳、import map、HUD 骨架；设计稿阶段全部逻辑内联在此 |
| `voxel/main.js` | 初始化渲染器、composer、控制器、主循环 |
| `voxel/topology.json` | 台阶、块、机架归属、脊线与母线定义、planned 边；人维护 |
| `voxel/state.mock.json` | 模拟状态，与真实源同结构 |
| `voxel/state-source.js` | 数据源抽象：`mock` 与 `live` 两个实现，统一输出 §四 结构，负责过期判定 |
| `voxel/icons.js` | §7.2 的造型函数表 |
| `voxel/scene-massif.js` | 阶梯实体、机架、城墙 |
| `voxel/scene-tracks.js` | 曼哈顿路由、走线几何、支线变色 |
| `voxel/pulses.js` | 背景脉冲与场景追踪脉冲的调度、中断动画 |
| `voxel/scenarios.js` | §6.2 场景表与 §6.3 fail-closed 规则 |
| `voxel/hud.js` | 面板、故障开关、剧本、逐跳说明 |
| `voxel/vendor/` | Three.js r160 本体与 addons 的离线拷贝 |

## 八、请求治理设计（真实链路对照）

沙盘画的每一跳都对应下面的治理规则；改这一节等于改真实链路的约束，须与 TECH.md 同步。

当前项目文档定义的生产请求路径：

```text
手机 / Web / Next.js / Tauri
         │
         │ HTTPS / HTTP3，业务内容为 Protobuf 或 ConnectRPC
         ▼
CDN / 云边缘 WAF / DDoS 清洗
         │
         ▼
Pangolin 公网隧道
         │
         ▼
Cilium Gateway API
         │ TLS 终止、入口路由、KPR
         ▼
control-tower gateway
         │
         ├─ Casdoor 有状态 Session 认证
         ├─ Dragonfly Session Store
         ├─ OpenFGA 对象级授权
         ├─ 租户和路由治理
         ├─ 超时、错误映射、可信身份头
         └─ ConnectRPC over HTTP/2 H2C
         ▼
对应 Go 后端微服务
         │
         ├─ ConnectRPC server interceptor
         ├─ Protovalidate
         ├─ OTel trace / metric / log
         ├─ 业务级 owner 校验
         └─ PostgreSQL / Dragonfly / Kafka 等内部依赖
```

### 8.1 必须保持的边界

- 后端微服务不暴露公网。
- Cilium NetworkPolicy 默认拒绝，只允许明确声明的入口和依赖。
- 网关是认证和授权的统一入口。
- 认证使用 Casdoor 有状态 Session，Session 存在 Dragonfly。
- OpenFGA 负责 merchant、store、order 等对象关系授权。
- JWT 不作为新的双重鉴权路径。
- 网关到后端使用 ConnectRPC over HTTP/2 H2C，禁止降级到 HTTP/1.1。
- 网关注入的身份头只能由受信任网关生成，后端仍必须执行业务对象归属校验，防止 IDOR。
- Cilium 负责网络可达性和 L3/L4/L7 过滤，不能替代业务授权。
- 真实 WAF 和大流量清洗应位于云边缘，不放入静态资源 Caddy，也不把 WAF 责任塞进 Go 网关。

### 8.2 入口策略

外部流量只允许到 Cilium Gateway API 对应的入口工作负载。后端命名空间默认拒绝：

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: ecommerce-default-deny
  namespace: ecommerce
spec:
  endpointSelector: {}
  ingress:
    - fromEntities:
        - cluster
  egress:
    - toEntities:
        - cluster
```

生产配置不能直接照搬示例，必须根据 `.service-matrix.yaml`、实际 namespace、ServiceAccount 和 Gateway API 实例补全。

### 8.3 网关到后端

只允许 control-tower gateway 访问声明的 ConnectRPC 服务端口，且目标服务必须与拓扑表一致：

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: gateway-to-backend
  namespace: ecommerce
spec:
  endpointSelector:
    matchLabels:
      app.kubernetes.io/part-of: ecommerce
  ingress:
    - fromEndpoints:
        - matchLabels:
            app.kubernetes.io/name: control-tower-gateway
      toPorts:
        - ports:
            - port: "8080"
              protocol: TCP
```

实际落地时应进一步按服务细分，而不是让所有后端互相可达。沙盘里的城墙只在脊线处开门，就是这条规则的可视化。

### 8.4 服务间调用

每个服务只声明自己的 `depends_on`。`depends_on_planned` 不能当成已接线依赖。策略应分别限制：

- DNS 到 CoreDNS。
- 配置读取到 control-tower config。
- 注册发现到 Consul（若该服务仍在使用）。
- 数据库访问到 PostgreSQL Service。
- 缓存访问到 Dragonfly。
- 事件访问到 Kafka。
- 服务到服务的 ConnectRPC 调用。

### 8.5 身份和授权十步

请求到达 control-tower gateway 后：

1. 清除客户端伪造的 `x-md-*` 身份头。
2. 解析 Casdoor Session。
3. 从 Dragonfly Session Store 读取会话状态。
4. 获取用户、租户和粗粒度角色。
5. 按 RPC 路由执行 OpenFGA 关系检查。
6. 仅由网关注入受信任身份头。
7. 将请求转发到对应 Go 微服务。
8. 微服务再次检查业务对象归属。
9. Protovalidate 校验输入。
10. 输出统一 ConnectRPC 错误码和 OTel 上下文。

认证或授权失败必须 fail closed：

| 情况 | 错误码 |
|---|---|
| 未登录 | `UNAUTHENTICATED` |
| 粗粒度角色不足 | `PERMISSION_DENIED` |
| 对象关系不成立 | `PERMISSION_DENIED` |
| 请求字段不合法 | `INVALID_ARGUMENT` |
| 网关找不到路由 | `NOT_FOUND` |
| 下游不可用 | `UNAVAILABLE` |

## 九、视觉提示词

下面这段是这份设计的完整视觉描述，用于重新生成、让另一位协作者或 AI 复现同一画面，或作为后续迭代的基准。改画面先改这里。

```text
主题：一座「电商全链路体素沙盘」，展示请求从浏览器一路穿过边缘、Kubernetes、网关、微服务到数据层的过程。
风格：等轴测低多边形体素微缩模型，混合电路板质感。干净、克制、暗底高对比，像一件放在黑色展台上的精密沙盘，不是游戏场景。

视角与构图：
- 正交等轴测相机，视线方向 (1,1,1)，不透视。
- 一整块阶梯状实体，四级台阶从画面右上（最高、最远）向左下（最低、最近）递降。
- 台阶依次是：客户端、边缘、Kubernetes 集群、数据与观测。每级台面是深蓝灰色，前缘一条略亮的压条，立面更深。
- 底部一块更大的黑色底板，像展台。背景纯深色 #0d1118，不要天空、不要环境贴图。

走线（电路板语言）：
- 一根铜色主脊线沿台阶中轴从最高级一路下到最低级，在每级立面垂直落下，像瀑布。
- 每级台阶一条横向铜色母线，每个组件一条短支线接母线。所有走线只走横竖两向，贴着台面，有厚度，金属感。
- 不要任何飞线、弧线、发光管子；不要交叉。
- 观测段的母线是虚线；未接线的依赖用短虚线在服务之间直连。

组件（每个都是几个体素零件拼成的小模型，按图标取形）：
- 浏览器端是蓝屏显示器，桌面端是主机箱。
- 边缘防护是半透明盾牌；公网隧道入口是深色拱门；身份服务是一扇紫色门；边缘主机是带散热槽的机箱。
- 集群是三块薄机架并排，服务是青色带盖货箱落在机架上；Cilium 网关是黄色六边形蜂巢坐在脊线上；集群后缘一道带垛口的蓝色城墙只在脊线处开一道黄色门。
- 网关是一座白色塔台，红色环带、玻璃控制室、顶上天线，坐在脊线上；授权是挂锁；会话存储是带四片翅膀的芯片。
- 数据库是三层蓝色圆柱；搜索引擎是三层黄色圆柱顶着放大镜；消息队列是三根横管束；对象存储是红色桶；推荐引擎是橙色八面体。
- 观测组件是绿色漏斗、紫色细塔楼、雷达盘、带信标的小盒。
- 每个组件旁边一盏 1 格见方的小灯：健康是稳定绿色，降级是慢闪琥珀，故障是快闪红色，未知是熄灭且组件整体变暗。灯是画面里唯一发光的东西，泛光克制。

光照与材质：
- 一盏暖色主光从左上后方打来，柔和阴影；冷色天光补底。
- 材质全部粗糙无反光，只有走线是金属铜色。
- 调色板：底板 #0f1520，台面 #223047，立面 #162032，铜走线 #c98a4b，客户端蓝 #4f7fd9，边缘琥珀 #c9894a，Cilium 黄 #f2c14e，服务青 #38a6d8，数据紫 #7e6fc2，观测绿 #5cb08a，灯绿 #3ddc84 / 琥珀 #ffb547 / 红 #ff4d3d。

动态：
- 小而亮的白蓝色光点沿走线流动，表示请求；点击场景按钮时一颗更大的暖黄光点走完整路径，途经组件依次点亮说明。
- 光点走到故障组件前停下并闪红。

文字：
- 每个组件上方一行小号浅灰标签；每级台阶左上角一行琥珀色大写层名。
- 左上角一块半透明深色面板放数据源开关、场景按钮、故障剧本、组件详情与图例。

避免：透视畸变、飞线、彩虹配色、大面积泛光、卡通描边、纹理贴图、拥挤的标签、悬浮平板。
```

## 十、落地顺序

| 阶段 | 交付 | 验收 |
|---|---|---|
| S0 设计稿（已交付 2026-09-10） | 单文件 HTML，等轴测阶梯沙盘 + 全量块 + 曼哈顿走线 + 四态灯 + 背景脉冲 + 六个场景 + 四个剧本 + 逐块开关；数据源 `mock` 可用，`live` 只有轮询骨架 | 页面可运行，截图见 §十一 |
| S1 静态沙盘定稿 | 拆分 §7.6 模块；`topology.json` 外置；vendor 离线拷贝；修完 §十一 的待优化项 | 页面离线打开可运行；块 id 与 `.service-matrix.yaml` 服务名一一对应；draw call 与帧率在 §7.5 预算内 |
| S2 请求导体定稿 | 补 `PERMISSION_DENIED` / `NOT_FOUND` / `INVALID_ARGUMENT` 三种中断演示；场景逐跳文案对齐 §八.5 | 每个场景的路径与 §6.2 表一致；每个中断位置显示对的错误码；虚线边不通脉冲 |
| S3 真实源 | `tools/topology-health` 聚合器 + 网关 `/topology/state` 路由 + 前端 `live` 数据源 | 聚合器输出通过 §四 契约校验；路由按 C 级限 admin；断源后 3 个周期内全部转灭；跨仓依赖版本同步升级 |
| S4 嵌入 | 可选：作为 admin 后台一个路由嵌入 | 不在本方案内定 |

S1 与 S2 只改本目录，不碰后端与集群。S3 涉及 control-tower 仓与集群 RBAC，按 AGENTS.md 硬规则 6 单独授权。

## 十一、截图复盘与待优化（2026-09-10）

第二版在本机浏览器实测可运行，整体形态达到 §九 的描述：阶梯实体、脊线、母线、图标化组件与灯都成立。对照截图列出待优化项，S1 一并处理：

- **标签重叠**。集群台阶中央 `control-tower ×2`、`Cilium Gateway API`、`node102` 三个标签叠在一起；数据台阶左侧 `PostgreSQL`、`Gorse`、`Elasticsearch` 挤在一处；观测段六个标签互相压住。修法：标签按块的屏幕投影做一次简单避让，或改为只在悬停与选中时显示组件名，常显只留台阶名。
- **城墙说明位置**。`CiliumNetworkPolicy · default-deny` 说明悬在 OpenFGA 上方，脱离了墙。修法：贴到墙体右端，字号再小一级。
- **Cilium 六边形被塔台遮住**。两者在脊线上距离太近。修法：六边形后移到城墙门内侧，塔台前移到机架前排；机架相应后缩。
- **CDN 盾牌看不清**。半透明加深色几乎不可读。修法：盾牌改为亮边框 + 半透明填充，或用虚线轮廓表示规划位。
- **Kafka 管束读感弱**。三根横管被支架挡住，像一个方盒。修法：管束抬高、支架改成两端细座，管口涂亮色。
- **台阶名漂在台阶外**。`L6 数据与观测`、`L3–L5 …` 标签落在台面左侧的空中。修法：标签锚在台面左前角内侧，并加一小段与台面同色的铭牌。
- **右上角徽标压住画面**。默认取景把客户端台阶顶到画面右上角，与徽标重叠。修法：默认目标点向后上方偏移，或把徽标移到左下。
- **默认视角下观测段贴着前缘**。观测组件几乎压在台阶前沿。修法：数据台阶再加深 6 个单位，观测行后移。
- **灯的位置不统一**。灯固定在组件右前方，塔台与门这类高组件的灯离本体太远。修法：按组件高度给灯位单独标定，或统一放在组件正前方台面上。

## 十二、待确认

- 节点、OpenFGA 就绪计数与 Hubble 存在性所用的 VictoriaMetrics 指标名，接入时按 TECH.md §9.3 的方法先查当前口径。
- Casdoor 是否已有 Gatus 探针；没有则在 `infrastructure/gatus/config.yaml` 补一条。
- `/topology/state` 的 admin 角色判定用现有 Casbin 策略还是 OpenFGA 关系，待与 control-tower 仓一并定。
- 支付回调场景是否要画外部支付渠道块作为起点。
