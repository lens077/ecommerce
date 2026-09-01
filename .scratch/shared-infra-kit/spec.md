# 共享基础设施库 go-connect-kit：方案与迁移计划

Status: ready-for-human

把 10 个微服务各存一份的 7 个基础设施模块收敛到一个独立仓库，消除复制粘贴漂移。
本文只做方案论证，不含已执行的代码改动。

## 摘要

- 漂移是真的，但**不是随机的**：4 个服务停留在 Config Center 迁移之前的旧 `constants` 上，`log/log.go` 的 4 个变体全部由这一个根因产生。
- 根因是**生成方式没有更新通道**：`co-cli` 从 `go-connect-template` 一次性生成骨架，之后模板演进不会回流到已生成的服务。
- 抽取共享库**可行**，且比预期便宜：`Server` / `Data` / `Auth` / `Observability` / `Discovery` 五个 proto 消息在 10 个服务里逐字节相同。
- 7 个模块按耦合性质分三类，**成本差一个数量级**，不应当作一件事推进。
- 推荐分层混合方案：类 1 直接搬、类 2 用泛型、类 3 用共享 proto，分三期落地。
- 类 3 的 proto 分发方式**已定为 BSR 发布**。需注意本仓当前零 BSR 依赖、全部 proto 走 vendored，此选择会新增一类构建期网络依赖（§3.1）。

## 一、实测证据

### 1.1 重复的体量

以 cart 为基准统计生产代码（不含测试）：

| 模块 | 单服务行数 | ×10 服务 | 耦合类别 |
|---|---:|---:|---|
| `env` | 27 | 270 | 类 1 |
| `meta` | 31 | 310 | 类 1 |
| `dbutil` | 235 | 2,350 | 类 1 |
| `config` | 516 | 5,160 | 类 2 |
| `log` | 105 | 1,050 | 类 3 |
| `otel` | 331 | 3,310 | 类 3 |
| `registry` | 262 | 2,620 | 类 3 |
| **合计** | **1,507** | **15,070** | |

后端非测试 Go 共 58,719 行，其中生成的 `conf/v1` 21,034 行、sqlc models 3,178 行。
扣除生成代码后手写代码为 34,507 行，上表的 15,070 行占其中 **43.7%**。

### 1.2 漂移的根因：`constants` 包被分叉成 5 份

| 包 | 常量数 | 状态 |
|---|---:|---|
| `backend/constants` | 45 | 当前版，10 个服务全部引用 |
| `services/address/constants` | 32 | 影子 |
| `services/cart/constants` | 32 | 影子，与 address 逐字节相同 |
| `services/merchant/constants` | 32 | 影子 |
| `services/inventory/internal/constants` | 16 | 影子 |

四个影子包是旧版共享包的化石，缺少 Config Center 迁移新增的常量
（`EnvConfigSource`、`EnvConfigSourceFile`、`EnvConfigCenter*`），
而这些正是 `config/source.go` 的 `NewSource()` 在读取的键。

影子包可安全删除，依据如下：

- 影子常量在共享包中**同名同值**：address 32/32、cart 32/32、merchant 32/32、inventory 16/16
- **值冲突 0 处**，**仅影子包独有的常量 0 个**
- 影子包内的 `GetEnvString` / `GetEnvBool` 是死代码：全仓 `constants.GetEnv*` 调用 0 次，所有服务都走 `internal/pkg/env`
- 需要改动 import 的文件共 **18 个**

### 1.3 改 import 后的收敛验证

把影子 import 换成 `backend/constants` 后重新计算归一化哈希：

```
log/log.go   主流(behavior)  = f445a4a9
             address  修正后 = f445a4a9   完全落回
             cart     修正后 = f445a4a9   完全落回
             merchant 修正后 = f445a4a9   完全落回
             inventory修正后 = 992056d2   仅剩 import 分组位置差异
```

`registry/consul.go` 改 import 后**不收敛**，属于独立的逻辑漂移。
以 address 版为基准的差异行数：merchant 0、payment 2、product 4、user 12、behavior 14、search 14、order 21、inventory 33、cart 65。

### 1.4 两处需要人工判断的真分叉

**`registry/consul.go` 的空指针防护**。基线注释记载「address 的空指针防护没同步到其他服务」，
该记载已过期：实测 10 个服务**全部**具备这道防护。但传播过程中降级了——
主流版是 `fmt.Errorf("consul check configuration is missing")`，
address 与 merchant 版是 `errors.New("consul check configuration is missing: discovery.consul.check.ttl")`，
并保留了说明「为什么返回错误优于裸注册」的三行注释。
机制传下去了，理由没有传下去。

**`dbutil/handler.go` 的错误码写法**。两个阵营：

| 阵营 | 服务 | 写法 |
|---|---|---|
| A（6 个） | behavior、inventory、order、product、search、user | `pqerror.UniqueViolation` 具名常量，依赖 `github.com/lib/pq` |
| B（4 个） | address、cart、merchant、payment | 裸字符串 `"23505"`，无额外依赖 |

B 阵营把 `InvalidSchemaName` 与 `InvalidCatalogName` 合并为一条错误信息，A 阵营分开返回。
这是可观测的行为差异，不只是风格差异。

### 1.5 模板与 CLI 的现状

`go-connect-template` 最新提交是 `d61ef7b feat(template): sync cart production standards`，
即模板本身是从 cart 同步过去的。但两者互有领先：

- 模板有 `log/es.go`，cart 没有
- cart 有 `dbutil/status.go`，模板没有
- 归一化后仍有差异的文件：`config/source.go` 9 行、`otel/otel.go` 7 行、`money/numeric.go` 23 行、`log/log_test.go` 304 行

因此「cart 是最好的模板」只在多数模块上成立，不能整仓照搬。

Go 版本三处不一致：模板 1.26.5、`co-cli` 1.26.1、ecommerce 1.27.0。

`co-cli` 采用减法生成：克隆模板后按 feature 删除文件、`+co:` 标记行和 `go.mod` 依赖，
契约是模板仓的 `.co/manifest.yaml`。manifest 明确写明 **`.proto` 里不放标记**，
所以 CLI 不会裁剪 proto。据此判断，`Log` 消息的三个变体是**人工手改**的结果：

- address、search：删除 elasticsearch 字段时正确保留 `reserved 3; reserved "elasticsearch"`
- **behavior：删除字段 3 但未加 `reserved`**

`buf.yaml` 已启用 `FIELD_NO_DELETE_UNLESS_NUMBER_RESERVED` 与
`FIELD_NO_DELETE_UNLESS_NAME_RESERVED`，behavior 的写法与该规则冲突，
存在字段号被复用导致线协议不兼容的风险。此项独立于本次迁移，建议单独修复。

## 二、模块按耦合性质分三类

这是本方案的核心判断。7 个模块对各服务生成类型 `confv1` 的依赖程度不同，
迁移成本相差一个数量级，不应当作同一件事推进。

### 类 1：无 conf 依赖（`env`、`meta`、`dbutil`）

生产文件对 `confv1` 零引用，可直接移入共享库，改 import 即可。

单份 293 行，×10 共 2,930 行。

### 类 2：依赖 Bootstrap 容器类型（`config`）

耦合面比预期小得多。实测 `config` 包内 `confv1` 的引用分布：

| 文件 | `confv1.` 出现次数 |
|---|---:|
| `config.go` | 9 |
| `live.go` | 9 |
| `source.go` | 0 |
| `source_file.go` | 0 |
| `source_sdk.go` | 0 |

真正的接缝层（`Source` / `Watcher` / `NewSource` / `parseYAMLToMap`）**已经与服务无关**，
返回 `map[string]any`；解码函数签名是 `decodeConfig(data map[string]any, target any) error`，
本身就不依赖具体类型。

剩余耦合只有两处形态：

- `Live` 结构体，实为 `atomic.Pointer[confv1.Bootstrap]` 加订阅表
- `fx.Module` 的 provider 签名 `func(lc fx.Lifecycle) (*confv1.Bootstrap, error)`

两者都是标准泛型候选：`Live[T]`、`Module[T]`。
各服务只需保留一个约 20 行的绑定文件，把 `T` 实例化为自己的 `Bootstrap`。

单份 516 行，×10 共 5,160 行。

### 类 3：依赖 conf 子消息的字段（`log`、`otel`、`registry`）

这三个模块需要读取 `confv1.Log`、`confv1.Observability`、`confv1.Discovery` 的**字段**，
泛型解决不了，必须让这些类型本身可共享。

有利证据：这些消息在 10 个服务里已经事实统一。

| 消息 | 跨 10 服务一致性 |
|---|---|
| `Server` | 逐字节相同 |
| `Data` | 逐字节相同 |
| `Auth` | 逐字节相同 |
| `Observability` | 逐字节相同 |
| `Discovery` | 逐字节相同 |
| `Log` | 3 个变体，差异仅为 elasticsearch 字段的有无 |

各服务的 `Bootstrap` 结构也一致：字段 1–7 相同（含 `reserved 6; reserved "search"`），
服务专属配置一律追加在字段 8 及以后（cart 的 `Store`、product 与 behavior 的 `Recommend`、
search 的 `Search`、payment 的 `Pay`）。

单份 698 行，×10 共 6,980 行。

## 三、proto 策略三方案的详细优劣

以下针对类 3 的三种处理方式。类 1 与类 2 在任一方案下都可迁移，不受影响。

### 方案 A：共享库同时拥有基础设施 proto

共享库定义 `Server` / `Data` / `Auth` / `Observability` / `Discovery` / `Log`，
各服务的 `Bootstrap` 引用这些消息，服务专属配置仍留在自己的 proto 里。
共享模块的签名变为 `NewConsulRegistry(d *kitconfv1.Discovery, ...)`。

**优势**

- 覆盖全部 7 个模块，去重最彻底：15,070 行降至 1,507 行，约省 13,563 行
- `protovalidate` 约束集中定义一次，不再 10 份各自演进
- `buf` 的 breaking 规则天然守护这份共享契约，改坏会在 CI 暴露
- 与既有工程习惯一致：仓库已经在用 buf 管理 proto，`third_party/validate/validate.proto` 就是 vendored proto 的先例

**代价与风险**

- **关键陷阱**：如果每个服务各自从同一份 `.proto` 生成 Go 代码，得到的是**不同的 Go 类型**（包路径不同），共享模块无法接收。必须保证共享消息的生成产物只存在于 kit 模块中，服务侧把它当作依赖而非生成输入。实现上需要 kit 的 `.proto` 声明 `option go_package` 指向 kit 模块，并在服务侧的 `buf.gen.yaml` 里排除该路径。这是本方案唯一真正困难的部分。
- 跨仓 proto 依赖的分发方式**已定为 BSR 发布**，具体接线与前置条件见 §3.1。
- 10 个服务的 `conf.proto` 都要改并重新 `buf generate`，属于仓库级改动。
- kit 的 proto 改动会同时影响 10 个服务，等于把 10 个独立的破坏面合并成一个。收益是一致性，代价是爆炸半径。
- 仓库选定为 public，proto 定义将公开。已确认其中不含凭据，仅有主机名与端口字段名。

**适用判断**：这是唯一能真正解决类 3 的方案，也是收益最大的方案。困难集中在 buf 接线，属于一次性成本。

#### 3.1 BSR 落地细节（已选定）

分发方式选定为 BSR 发布。以下是实测得到的现状与接线步骤。

**现状：本仓当前没有任何 BSR 依赖**

这是选型时必须知道的事实——BSR 对本仓是**新引入的构建依赖**，不是既有做法的延续。

| 项 | 实测结果 |
|---|---|
| `buf` CLI | 1.72.0，已安装 |
| BSR 登录状态 | 未登录（`buf registry whoami` 报 `Not currently logged in`） |
| 根与服务级 `buf.yaml` 的 `deps:` | 全部处于注释状态 |
| 9 个服务的 `buf.lock` | 存在但为空，只有 `version: v2` |
| 现有外部 proto | 全部 vendored 在 `backend/third_party/`（`validate`、`google/api`、`google/type`、`google/protobuf`） |

**有利条件：managed mode 的排除写法已有先例**

`backend/buf.gen.yaml` 已经在用 `managed.disable` 为外部模块关闭 `go_package` 重写：

```yaml
managed:
  enabled: true
  disable:
    - file_option: go_package
      module: buf.build/bufbuild/protovalidate
    - file_option: go_package_prefix
      module: buf.build/googleapis/googleapis
```

kit 模块照抄这个写法即可，这正是 §3 所述「关键陷阱」的解法：
关闭 `go_package` 重写后，服务侧生成的代码会 `import` kit 的 Go 包，
而不是把共享消息重新生成一份成为互不兼容的类型。

**接线步骤**

1. 注册 buf.build 账号与 `lens077` 组织，`buf registry login`（**需要人工完成**，见下）
2. kit 的 `.proto` 声明 `option go_package = "github.com/lens077/go-connect-kit/api/conf/v1;confv1"`
3. `buf push` 发布 kit 模块，公开可读
4. 各服务 `buf.yaml` 取消 `deps:` 注释并加入 `buf.build/lens077/go-connect-kit`
5. `buf dep update` 生成非空 `buf.lock`
6. 各服务 `buf.gen.yaml` 的 `managed.disable` 增加 kit 模块的 `go_package` 条目
7. 服务 `conf.proto` 改为 `import` kit 消息，重新 `buf generate`

**人工前置条件（我无法代劳）**

- 注册 buf.build 账号并创建 `lens077` 组织
- 生成 token 并 `buf registry login`
- 确认计费：公开模块免费，私有模块需付费计划。仓库已定为 public，公开模块即可

**需要接受的代价：构建不再是自足的**

当前所有 proto 都 vendored，构建对外部网络零依赖。改用 BSR 后，
`buf generate` 与 CI 需要能访问 buf.build。公开模块读取无需认证，
但网络不可达时构建会失败。

若后续认为该代价不可接受，退路是把 kit 的 `.proto` 也 vendored 进各服务的
`third_party/`，同时**保持 `go_package` 指向 kit 模块**——生成产物的归属不变，
因此这条退路不影响 Go 侧结构，只改变 proto 的取得方式。
建议把这一点作为第 3 期的回滚预案记录在案。

### 方案 B：只抽取类 1（`env`、`meta`、`dbutil`）

**优势**

- 最安全，无 proto 改动，无泛型改造，编译器全程兜底
- 可在一天内完成并验证
- 能立即验证共享库的分发链路（go.mod 引用、CI、版本管理）是否顺畅

**代价与风险**

- 只省 2,637 行，占 15,070 行的 17.5%
- `config` 这个 516 行 ×10 的大头原地不动
- 漂移问题基本未解决：本次实测的真分叉集中在 `registry/consul.go`（类 3）与 `dbutil/handler.go`（类 1），只抽类 1 仅覆盖其中一处
- 已有的 `TestInfraHomogeneity` 门禁仍需保留，每次基础设施改动仍是 10 处编辑

**适用判断**：作为独立方案收益不足，但作为**第一期**用于验证链路是合适的。

### 方案 C：共享库用 Go 接口解耦，不碰 proto

共享模块改为接受小接口而非具体 proto 类型，各服务写适配器。

**优势**

- 不动 proto，不需要 buf 跨仓接线
- 各服务保留完全独立的配置演进自由

**代价与风险**

- 对类 3 效果很差。接口若返回 `*confv1.Discovery`，返回类型仍是各服务自己的类型，问题原样存在；要真正解耦就必须把接口下沉到基础类型（`Addr() string`、`Scheme() string` 等），等于为每个服务手写一层字段透传适配器。
- 新增约 10 份适配代码，抵消一部分去重收益，并新增一类会漂移的文件
- 丢失 `protovalidate` 在配置层的校验人体工学：约束写在 proto 上，改走接口后校验时机与错误信息都要重做
- 备选的 protoreflect 按字段名反射读取方式，牺牲编译期类型安全，且性能与可读性都更差

**适用判断**：类 2 用泛型是对的，但把泛型思路延伸到类 3 会产生比复制粘贴更差的结构。不推荐用于类 3。

### 三方案对比

| 维度 | 方案 A 共享 proto | 方案 B 只抽类 1 | 方案 C 接口解耦 |
|---|---|---|---|
| 覆盖模块 | 7 / 7 | 3 / 7 | 7 / 7（类 3 质量差） |
| 去重行数 | 约 13,563 | 约 2,637 | 约 11,000，另增 10 份适配 |
| 是否解决 `consul.go` 分叉 | 是 | 否 | 是 |
| 是否保留 protovalidate | 是 | 是 | 否 |
| 主要难点 | buf 跨仓生成接线 | 无 | 适配层设计与维护 |
| 爆炸半径 | 大（10 服务共享契约） | 小 | 中 |
| 可回滚性 | 中 | 高 | 中 |

## 四、推荐方案：分层混合

不要在三者之间二选一，而是按类别各用其适配的手段：

| 类别 | 模块 | 手段 |
|---|---|---|
| 类 1 | `env`、`meta`、`dbutil` | 直接移入共享库 |
| 类 2 | `config` | 泛型 `Live[T]` / `Module[T]`，各服务留约 20 行绑定 |
| 类 3 | `log`、`otel`、`registry` | 共享 proto（方案 A） |

理由：类 2 用泛型比共享 proto 更贴切，因为耦合的是**容器类型**而非字段；
类 3 用共享 proto 比接口更贴切，因为耦合的是**字段读取**，而这些消息已经事实统一。

## 五、分阶段迁移计划

每一期都以「能编译、能通过既有门禁」为交付标准。

### 第 0 期：先修漂移，不动结构

不依赖共享库，可独立交付，且能让后续迁移的基线唯一。

1. 删除 4 个影子 `constants` 包，18 个文件的 import 指回 `backend/constants`，跑 `goimports`
2. 删除 order 在 `log/log.go` 中多出的 4 行注释；修正 `config/live.go` 里指向 `cart.go` 的注释
3. `registry/consul.go` 以 address / merchant 版为准同步 10 个服务，保留解释性注释
4. `dbutil/handler.go` 二选一（建议 A 阵营：具名常量可读性更好，`lib/pq` 已在 `go.mod` 中）
5. 每步后收敛的条目从 `structcheck/homogeneity_baseline.txt` 删行

验证：`cd backend && go build ./... && go test -count=1 ./structcheck/...`

`TestInfraHomogeneity` 是棘轮，条目收敛后会主动要求删除对应基线行，验证信号是现成的。

### 第 1 期：建库 + 迁移类 1

1. `gh repo create lens077/go-connect-kit --public`
2. 迁入 `env`、`meta`、`dbutil`，模块路径 `github.com/lens077/go-connect-kit`
3. 打 `v0.1.0`
4. **先只改 1 个服务**（建议 cart，它与模板最接近）验证引用链路
5. 通过后推广至 10 个服务

产出：验证 go.mod 引用、版本管理与 CI 是否顺畅。省约 2,637 行。

### 第 2 期：迁移类 2（`config`）

1. 在 kit 中实现泛型 `Live[T]`、`Source`、`Watcher`、解码与校验
2. 各服务保留约 20 行绑定文件实例化 `T = *confv1.Bootstrap`
3. 同样先单服务验证再推广

省约 4,644 行。

### 第 3 期：迁移类 3（共享 proto）

前置：完成 §3.1 的人工步骤（buf.build 账号、组织、`buf registry login`）。

1. 在 kit 中定义基础设施 proto，`go_package` 指向 kit 模块
2. `buf push` 发布为公开模块，**先在单个服务上打通生成链路再推广**
3. 迁移 `log`、`otel`、`registry`
4. 10 个服务的 `conf.proto` 改为引用共享消息，加 `deps`、加 managed 排除、重新生成

省约 6,282 行。风险最高，必须在前两期链路稳定后进行。
回滚预案见 §3.1 末段：改回 vendored `.proto` 不影响 Go 侧结构。

### 第 4 期：模板与 CLI 收口

1. `go-connect-template` 改为依赖 `go-connect-kit`，不再自带 7 个模块
2. 合并模板与 cart 的互相领先项：模板补 `dbutil/status.go`，cart 侧确认是否需要 `log/es.go`
3. 三仓 Go 版本对齐（模板 1.26.5、`co-cli` 1.26.1、ecommerce 1.27.0）
4. `co-cli` 的 `.co/manifest.yaml` 相应更新
5. 评估是否为 `co` 增加 `co upgrade`，让已生成的服务能拉取模板演进——**这是本次漂移的根因，不解决它，未来仍会重现**

## 六、风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| 类 3 的 buf 生成接线失败 | 第 3 期阻塞 | 先在单服务打通再推广；失败则类 3 退回原地，前两期成果不受影响 |
| BSR 不可达导致构建失败 | `buf generate` 与 CI 红 | 本仓当前所有 proto 都 vendored，构建自足；改用 BSR 后新增网络依赖。退路是把 kit 的 `.proto` 也 vendored，`go_package` 保持指向 kit，Go 侧结构不受影响（§3.1 末段） |
| BSR 账号或计费未就绪 | 第 3 期无法启动 | 公开模块免费，仓库已定为 public；账号与 `buf registry login` 是人工前置，需在第 3 期前完成 |
| kit 的破坏性改动波及 10 服务 | 全线构建红 | kit 走 semver，服务侧按版本升级而非 `latest`；kit 仓开 CI |
| public 仓暴露内部结构 | 信息披露 | 已确认 7 个模块内不含凭据；迁移前再逐文件复核一次 |
| 第 0 期与后续期次冲突 | 返工 | 第 0 期先合入，让基线唯一后再开始迁移 |

各期相互独立且顺序可停：任一期完成后停下都是自洽状态，不存在「改到一半必须继续」的中间态。

## 七、待决事项

1. ~~**类 3 的 proto 分发方式**~~ —— **已定：BSR 发布**，接线与前置条件见 §3.1
2. ~~**`dbutil/handler.go` 阵营取舍**~~ —— **已定：A 阵营（`pqerror` 具名常量）**。
   依据：B 阵营含永不匹配的死分支（`code := pgErr.Code` 取的是 SQLSTATE，
   而 B 写了 `case "23000", "IntegrityConstraintViolation"` 这类名字分支）；
   `github.com/lib/pq` 已是 `go.mod` 直接依赖，选 A 不新增依赖。
3. ~~**`log/es.go` 归属**~~ —— **已定：`+co:elasticsearch` 可选能力进入 kit**。
   依据：`es.go` 对 Elasticsearch 零 import（仅 `net/http`/`time`/`conf`/`zap`），
   靠结构化接口满足 `elastic-transport` 的 `Logger`；kit 拥有含 optional
   `ElasticSearch` 子消息的 `Log` 后，该消息的 3 个变体自动收敛为 1，
   behavior 缺失 `reserved` 的隐患一并消除。
4. ~~**是否为 `co` 增加 `upgrade` 能力**~~ —— **已定：做**。这是漂移的根因项，
   不做则本次清理完成后漂移仍会重现。纳入第 4 期。

### 人工前置事项：已完成

BSR 账号与 `buf registry login` **已完成**（`buf registry whoami` 返回 `Logged in as sumery`）。
第 3 期的硬前置条件已解除。

## Comments

（待补充）
