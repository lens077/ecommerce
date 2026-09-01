---
name: capability-seams
layer: team
description: 能力接缝的准入与验收：定义方、至少两个可用提供方、消费方缺一不可，接口签名不得暴露 vendor 类型
---

# 能力接缝：准入与验收判据

## 目的

[`docs/TECH.md`](../../docs/TECH.md) §1.2 已规定「深度模块化（Deep Module）：将复杂性隐藏在小的接口后面。例如 `PaymentPort`、`ObjectStore`、`SearchCatalog`。调用方不应感知 Elasticsearch、Kafka 或 Silo 的细节」。本规范不另造一套架构原则，而是把「调用方不应感知具体实现」变成可执行、可评审的能力接缝（capability seam）判据。

能力接缝不是 `interface` 的同义词。只有一个实现的接口仍可能是合理的深度模块边界，但不能据此声称能力已经可替换。

## 定义：三个角色缺一不可

一个能力接缝必须同时存在以下三个角色：

| 角色 | 判据 |
|---|---|
| **Service Definition** | 声明最小能力契约，拥有与 provider 无关的输入、输出和错误语义。 |
| **Service Provider** | 至少有两个能在受支持运行路径中提供该能力的实现。测试用 mock/fake、构造函数别名和同一实现的薄包装不计。 |
| **Consumer** | 只通过 Service Definition 使用能力，不依赖具体 provider 或其 vendor 类型。 |

评审时必须为三个角色分别列出代码路径。少一个角色，这段代码就只是接口、适配器或测试替身，不是能力接缝。

## 硬判据：接口签名不得出现 vendor 类型

**Service Definition 的任何接口签名里都不得出现 vendor 类型。出现一个就不算能力接缝。**

这里的 vendor 类型包括第三方 SDK、客户端库和具体基础设施驱动所定义的请求、响应、枚举、错误及回调参数。检查范围覆盖方法参数、返回值、回调和它们引用的项目内类型；类型别名或嵌入字段不能把 vendor 类型「洗成」本地契约。标准库类型和项目拥有的 provider-neutral 领域类型不属于 vendor 类型。

接口外面有一层壳、注释里写着「隔离具体客户端」，都不能替代签名检查。暴露 vendor 类型的壳比没有壳更危险：注释会让评审者和调用方误以为已经解耦，实际迁移时才发现接口与消费方都绑定在旧实现上。

一个直接的替换检验是：新增或切换 provider 时，Service Definition 和 Consumer 是否无需修改。只要消费方还要解析旧 SDK 的响应、判断旧 SDK 的枚举或处理旧 SDK 的错误，答案就是「否」。

## 正例：配置源

[`backend/pkg/config/source.go`](../../backend/pkg/config/source.go) 中的 `Source` 是能力接缝，`Watcher` 是按需发现的可选能力。2026-09，这套配置能力从 10 个服务副本上提为唯一共享实现；泛型 `New[T proto.Message]` 接收 `Source`，并与 `Live[T]` 复用同一接缝，三个角色和硬判据没有改变。

- `Source.Load` 的数据边界是 `map[string]any`；`Source` 与 `Watcher` 的签名只使用标准库类型和项目拥有的 `WatchEvent`，没有暴露 Viper 或 Config Center SDK 类型。Viper 只参与实现内部的 YAML 解析。
- [`NewSDKSource`](../../backend/pkg/config/source_sdk.go) 与 [`NewFileSource`](../../backend/pkg/config/source_file.go) 提供两个真实实现，`NewSource` 按环境变量选择启动时使用的 provider。
- Config Center provider 额外实现 `Watcher`，文件 provider 不实现。[`startWatch`](../../backend/pkg/config/config.go) 通过 `live.source.(Watcher)` 的运行时类型断言发现可选能力，没有迫使所有 `Source` 都支持热更新。
- 推送内容解析、解码或校验失败，以及配置项被删除时，代码都不会调用 `Live.Set`，因此继续使用 last-known-good（最后一份已知可用配置）。provider 的坏输入不会破坏 Consumer 当前持有的有效状态。

这个设计满足深度模块化原则：Consumer 读取项目拥有的数据契约，具体配置 SDK、文件读取和 Viper 解析都留在 provider 内部。

## 历史反例：搜索引擎壳（2026-09 已修复）

> 本节保留一段已经删除的代码作为事故样本，不描述当前实现。2026-09 的 Meilisearch→Elasticsearch 代码迁移删除了 `SearchEngine`，并从 `backend/go.mod` 移除了 Meilisearch 客户端。

迁移前，`backend/services/search/internal/data/data.go` 曾声明：

```go
// SearchEngine isolates the repository from the concrete Meilisearch client.
type SearchEngine interface {
    Search(context.Context, string) (*meilisearch.SearchResponse, error)
    Health(context.Context) error
}
```

注释声称它隔离了具体 Meilisearch 客户端，但 `Search` 直接返回 `*meilisearch.SearchResponse`，违反 vendor 类型硬判据；当时也只有 `meilisearchEngine` 一个 provider。

当时的 Consumer `searchRepo.Search` 继续遍历 Meilisearch 的 `Hits` 并调用 `DecodeInto`，测试也直接构造 `meilisearch.SearchResponse`。迁移最终必须同时修改接口、Consumer 和相关测试。这里的注释在骗人：它描述的是尚未实现的解耦，而不是代码已经具备的性质。

## 当前活例：单实现深度模块边界

迁移后的 [`SearchCatalog`](../../backend/services/search/internal/data/data.go) 返回项目自有的 `CatalogProduct`，Elasticsearch SDK 类型只留在 provider 内部。它仍然**不是能力接缝**：[`esCatalog`](../../backend/services/search/internal/data/catalog.go) 是唯一生产 provider，代码注释也如实称它为「deep-module boundary」，没有夸大为「capability seam」。这正是「单实现深度模块边界」的正确标签。

[`TestSearchCatalogContractContainsNoVendorTypes`](../../backend/services/search/internal/data/search_test.go) 把签名判据变成了门禁：测试用反射递归遍历接口方法及其参数、返回值和嵌套类型，命中 `github.com/elastic/` 或 `github.com/meilisearch/` 前缀就失败。文档说明评审意图，测试阻止同类耦合回流；能机械检查的硬判据应优先采用这种模式。

## 克制：不要为假设的未来制造接缝

只有在当前代码中能指出三个角色时，才把一段边界称为能力接缝。不要因为「将来可能更换」就预先增加 provider 注册表、选择器或抽象层。

DeepSeek Harness 本身是通用插件框架；在 59 个服务中，也只有 28 个标为可替换 seam，其中真正长出第二个实现的只有 11 个。业务系统需要可替换的比例只会更低，因此应优先保持一个深而小的模块边界，等第二个真实 provider 出现后再把它提升为能力接缝。

## 评审清单

声称新增或保留一个能力接缝前，逐项给出证据：

1. Service Definition 的代码路径和最小契约。
2. 至少两个真实 Service Provider 的代码路径，以及明确的装配或选择点。
3. 至少一个 Consumer 的代码路径，并证明它只依赖 Service Definition。
4. 对接口参数、返回值、回调和项目内别名的递归检查结果：没有任何 vendor 类型。
5. 替换 provider 的影响范围：不需要修改 Service Definition 或 Consumer。
6. 可选能力的处理方式：使用独立小接口，由装配处或 Consumer 按需发现。

任一项不满足，就按实际情况标为「单实现深度模块边界」或「provider-specific adapter」，不要称为可替换的能力接缝。
