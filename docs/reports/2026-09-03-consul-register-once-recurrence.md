# 2026-09-03 一个写进知识库却没修的缺陷，四天后在十个服务上复发

> 语境：本文是一篇事后复盘，第一人称。事故对象是 `backend/pkg/registry` 的 Consul 注册逻辑；
> 时间跨度 2026-08-29 → 2026-09-03。所有数字来自日志、`kubectl` 输出和本机实测，
> 每处都标了来源；没有实测过的判断会写明「推断」。
> 结论先行：**缺陷本身不难修（一个守护循环，两百多行含测试），难的是它 4 天前就被诊断、
> 记录、标注为「遗留」，然后所有人都往前走了。** 这篇文章一半讲修法，一半讲那 4 天。
> 状态：**待审阅**。修复代码已在两个仓库的工作区，未提交。

---

## 一、我本来不是来修这个的

2026-09-03 我在推匿名购物链路。要验证访客 cookie 那条轨在 dev 网关上生效，
先得把网关镜像从 0.2.5 升到 0.2.10。升之前照例看一眼集群：

```
NAME                    READY   UP-TO-DATE   AVAILABLE   AGE
control-tower-gateway   0/2     1            0           3d11h
```

网关两个 Pod 全是 `0/1`，`Running` 但永远不 ready。kubelet 的事件是
`Readiness probe failed: HTTP probe failed with statuscode: 503`，
**97 分钟内失败 1177 次**——每 5 秒一次，从没成功过。dev 网关整体不接流量。

我升级照做了（用户授权的动作），新 Pod 起来后访客轨日志正常，但 `readyz` 依旧 503。
于是改去查 503。

## 二、两条弯路，先认错

网关 `/readyz` 是三个条件的与：

```go
ready := d.State.Ready() && d.Resolver.Ready()
if ready && d.Sessions != nil {
    if err := d.Sessions.Ping(r.Context()); err != nil { ready = false }
}
```

配置那项日志里五个键都 `hot update applied`，排除。剩两项：Consul 解析器、Dragonfly 会话存储。

**弯路一：Dragonfly TLS。** 我在 Dragonfly 日志里看到一行：

```
Error reading from peer 10.244.2.58:39599 0 < 5, socket state: State: CLOSE_WAIT
```

`10.244.2.58` 是网关 Pod。「期望读 5 字节读到 0」看起来像 TLS 握手在客户端侧失败后立刻断开。
我据此向用户报告「网关信任的 CA 与 Dragonfly 证书不匹配，大概率证书轮换后 CA 没同步」。

用户让我修。修之前我先验，四项**全部对得上**：

| 检查 | 结果 |
|---|---|
| `openssl verify -CAfile <网关信任的 CA> <Dragonfly 服务端证书>` | `OK` |
| 两侧 CA 的 SHA-256 指纹 | 完全相同（`07:2C:B0:D4:…:F1:61`） |
| 服务端证书 SAN | 含 `dragonfly.dragonfly.svc`，与连接地址一致 |
| 口令 | 两侧 md5 一致，用户名 `default` |

那行日志只是旧 Pod 连接关闭时的常规噪声。**我把一条噪声当成了根因，先射箭再画靶。**

**弯路二：Cilium 网络策略。** 排除 Dragonfly 后我查 Consul，发现业务服务的注册请求全是
`i/o timeout` 而不是 `connection refused`——包被丢了，像是策略拦截。
`ecommerce` 命名空间确实有一条 `enableDefaultDeny` 的 `CiliumNetworkPolicy`。
逐条核对：11 个 serviceaccount 都放行了到 `app=consul,component=server` 的 8500/8501，
Consul Pod 的实际标签也匹配。策略没配错。

两条弯路花掉的时间比修复本身长。

## 三、真因：Consul 目录里只有 Consul 自己

带 ACL token 查目录（不带 token 会返回 200 空列表——这个坑仓库注释里早就写了）：

```
{"consul":[]}
```

**10 个业务服务一个都没注册。** 网关的 `Resolver.Ready()` 是 `readyN > 0`，一个实例都解析不到，
自然 503。

时间线（来自 Pod `startedAt` 与各服务日志）：

| 时刻（2026-09-02） | 事件 |
|---|---|
| 09:59 | 所有 Pod 同批重建（整机重启） |
| 16:30:26 | Consul 容器再次启动 |
| 16:31:08 ～ 16:31:21 | 10 个业务服务各做**唯一一次**注册，全部 `dial tcp 10.244.2.189:8500: i/o timeout` |
| 16:31:xx | 每个服务打一条 WARN：`failed to register with Consul, service discovery disabled`，然后继续启动 |

`10.244.2.189` 正是 Consul 当前 Pod 的 IP，DNS 没解析错。42～55 秒的窗口里包被丢，
与 Cilium 在节点重启后策略尚未编程完成的时段相符（这一条是**推断**，没有抓包）。

关键不在那 55 秒，在**之后**。注册代码是这样的：

```go
OnStart: func(context.Context) error {
    if err := registry.Register(options, appInfo); err != nil {
        logger.Warn("failed to register with Consul, service discovery disabled", zap.Error(err))
        return nil
    }
    go registry.TTLCheckPinger(pingCtx, options)
    return nil
},
```

一次尝试，失败记 WARN，永不再试。而心跳那边：

```go
ping := func() {
    if err := r.client.Agent().UpdateTTL(checkID, "ttl check passing", api.HealthPassing); err != nil {
        // 记录错误，但不退出 Pinger，因为这可能是暂时的网络问题
        // 如果长时间失败，Consul Agent 会将服务标记为 Critical
        r.logger.Error("failed to update Consul TTL", zap.Error(err), zap.String("ID", r.ID))
    }
}
```

注释里的理由是错的。Consul 重启后 agent 本地注册全部丢失，对未知 CheckID 回 404——
**没有 check 可以被标成 critical，服务已经不在目录里了。** 心跳会每 10 秒报一次错，直到进程重启。

于是十个服务在 K8s 眼里全部健康：

```
ecommerce-cart-deploy-644959df47-4bfrj        true    2026-09-02T09:59:39Z
ecommerce-user-deploy-5cfdc7f86-pkxtl         true    2026-09-02T09:59:39Z
...（15 个 Pod，READY 全为 true）
```

readiness 探针不覆盖注册，注册失败不影响 HTTP 监听。**没有任何信号。**

## 四、这个缺陷 4 天前就被诊断过

查到根因后我去 `context/` 沉淀，发现
`context/project/ecommerce/registry/experience/consul-register-once-then-give-up.md`
**已经存在**，提交于 2026-08-29 17:05。它记的是同一个缺陷的第一次发作：

- `payment` 在 05:44 的集群故障窗口内启动，DNS 短暂解析不到 Consul
- 此后 3 小时 `1/1 Running` 零重启，网关侧 `streak` 累到 204——
  `204 × 30s ≈ 102min`，正好等于 Pod age
- 文中原话：「这是本次 **9 小时**无人发现的直接原因之一」

它的「遗留」一节写得非常准确：

> **注册失败没有重试**是设计缺陷，不是配置问题。10 个服务共用同一份
> `internal/pkg/registry/consul.go`，都有这个行为。要么加重试+退避，要么让注册失败直接
> fail fast……当前这种「静默降级并继续服务」是最坏的一种。

诊断对了，修法列了，标题是「遗留（已知，未改）」。然后 4 天后，同样的触发条件，
影响面从 1 个服务变成 10 个，网关从「某个服务解析不到」变成「整体 503」。

**我认为这才是本次事故最值得记的部分。** 知识库工作正常——它准确捕获了缺陷。
失败的是从「记录」到「修复」那一跳：没有 owner，没有挂进 `TODO.md`，
「遗留」两个字在 experience 文档里是终态而不是待办。

## 五、修法

把「一次注册 + 独立心跳 goroutine」换成一个守护循环 `Maintain`：

```
注册 ──失败──▶ 指数退避（1s 起、×2、封顶 30s、不限次数）──▶ 再注册
  │成功
  ▼
心跳续 TTL ──任一次失败──▶ 回到「注册」（同 ID 覆盖，幂等）
  │ctx 取消
  ▼
返回
```

三条设计判断，每条都有对立面：

**保留 fail-open。** `OnStart` 只 `go Maintain()`，进程不等 Consul。
8-29 那篇文档提过另一条路——注册失败直接 fail fast，让 K8s CrashLoop 把问题暴露出来。
没选它：本项目对 Consul 的定位是「暴露以备将来」，10 个服务当前都不依赖它做发现，
不该让一个可选依赖决定进程生死。

**心跳失败一律当「Consul 可能忘了我」。** 不区分「网络抖动」和「真的丢了」——
重注册是幂等的（同 ID 覆盖），误判的代价是一个多余的 PUT；不重注册的代价是永久不可见。
这条不对称决定了不需要区分。

**配置错误不重试。** 地址格式错、缺 `check.ttl` 这类错误包成 `ErrInvalidOptions`，
`Maintain` 直接返回记 ERROR。它们不会自愈，重试只会把真正的错误埋进退避噪声。

顺手修的两处：`registration completed` 那条打在 `ServiceRegister` **之前**的假 DEBUG
（8-29 排障时把人误导向「已注册」）删了；从未注册成功的进程退出时不再去 Consul
注销一个不存在的东西。

改动量：本仓 `backend/pkg/registry/` 2 文件 +245/−30，模板仓 2 文件 +243/−58。
各新增 4 条测试，对应三种故障形态和一条退出语义。

## 六、实测数据

单元测试用 `httptest` 假 agent 钉住行为。但我不放心只信假 agent——
上一次「注释里说 Consul 会标 critical」就是没打过真 Consul 的产物。
所以用 cart **真实的**适配层和 fx 装配，只装 log/config/registry 三个模块，
经 `port-forward` 打集群里的真实 Consul：

| 场景 | 我做了什么 | 观测到什么 |
|---|---|---|
| Consul 起得慢 | 进程启动时 18500 端口无人监听，31 秒后才开隧道 | 重试时刻 +0/+1/+3/+7/+15/+31s（退避 1→2→4→8→16），**第 6 次成功**；进程全程 alive |
| Consul 重启丢注册 | 05:10:12 直接调 API 注销该服务 | 05:10:17 心跳 404 → 05:10:18 重注册成功。**6 秒**，一个心跳周期内 |
| Consul 不可达 | 05:10:26 杀隧道，05:10:48 恢复 | 退避 1→2→4→8→16s，05:10:59 重注册，恢复后 11 秒 |
| 优雅退出 | `SIGTERM` | Consul 目录实例数 1 → 0 |

第二行是关键。旧代码在这个场景下会每 10 秒打一条 `failed to update Consul TTL`，
打到进程重启为止；新代码 6 秒自愈。

（表里的 `service=critical` 是 gRPC 就绪检查——harness 没起 gRPC 服务，预期内，
与注册逻辑无关。）

## 七、十个服务怎么一起修好

这一步比我预想的便宜，因为 2026-08 底做过一次基础设施去重：
10 个服务的 `internal/pkg/registry/consul.go` 已经从各 260 行的全量副本
收成 42 行的薄适配层，只做 Bootstrap→Options 映射，实现在 `backend/pkg/registry`。
`structcheck` 里有一条 `TestInfraAdaptersStayThin` 守着适配层不准再 import consul 客户端。

所以修共享包一处，10 个服务零改动，`go build ./... && go vet ./...` 和 structcheck 绿。

**但集群里跑的还是旧代码。** 我从日志行号（`consul.go:84`、`:92`、`:199`、`:205`）
能看出，部署的镜像早于去重，仍是各自的全量副本。修复要生效必须发布新镜像，
这是打 tag 触发 CI 的动作，本文没做。

模板仓 `go-connect-template` 的 `internal/pkg/registry/consul.go` 是那 260 行副本的源头——
新服务就是从它长出来的。同步了同一套语义（配置形态不同，逻辑一致），
它自己的 3 条旧测试原本锁着旧行为（「OnStart 内完成注册」「未注册也要调注销」），
按新语义改了。`go-connect-template-cli` 不含 registry 源码，它 `clone` 模板仓，
本地有缓存的话要 `--no-cache` 刷一次。

## 八、没做的和没验的

- **修复未部署。** 两个仓库工作区各一处改动，未提交、未发镜像。
  集群里 10 个服务仍是旧逻辑；网关 503 的即时解法仍是 `rollout restart` 让它们重新注册一次。
- **告警缺口没补。** 「注册数 < 预期服务数」至今没有任何告警。重试解决「抖动后自愈」，
  解决不了「Consul 挂半天没人知道」。
- **`CONSUL_ENABLED` 与口头约定不符。** 用户的理解是「10 个服务显式声明不使用 Consul」，
  实际 10 个 dev 部署清单全是 `"true"`，集群 env 也是。cart 已随本次翻成 `"false"`
  （用户明确要求「修好后保持关闭」），其余 9 个待决定。翻的时候记住：网关 `readyz`
  依赖 Consul 目录非空，全关等于网关永久 503，除非同时给网关换 resolver。
- **Cilium 那 55 秒窗口是推断。** 没抓包，只有「timeout 而非 refused」加时间线吻合。

## 九、我打算改的一条流程

把 experience 文档里的「遗留（已知，未改）」当成一个信号而不是终态。
具体做法不在本文定，但至少满足一条：**有 `TODO.md` 条目，或有明确的「不修」理由。**
这次那篇文档两样都没有——它是准确的，也是无用的，直到我第二次踩上去。

---

参考：

- [`context/project/ecommerce/registry/experience/consul-register-once-then-give-up.md`](../../context/project/ecommerce/registry/experience/consul-register-once-then-give-up.md)——8-29 首次记录，本次补了「复发」「修复」「实测数据」三节
- [`context/project/ecommerce/registry/INDEX.md`](../../context/project/ecommerce/registry/INDEX.md)——代码路径已更新为共享包 + 薄适配层
- `backend/pkg/registry/consul.go`、`consul_test.go`——修复与测试
- `go-connect-template/internal/pkg/registry/consul.go`、`registry_test.go`——模板同步
