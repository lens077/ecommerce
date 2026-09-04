---
name: infra-duplication
layer: team
description: 基础设施副本的治理：同构门禁只能冻结漂移、不能消除副本；副本的根因在生成模板，不在服务
---

# 基础设施副本：门禁不是治疗，模板才是根因

> **触发事故（2026-09-01）**：10 个微服务的 `internal/pkg/` 各存一份 `config`/`log`/`otel`/
> `registry`/`env`/`meta`/`dbutil`，合计 **15,106 行**生产 Go 代码，占当时手写后端代码的 44%。
> `structcheck/homogeneity_baseline.txt` 记录着已存在的漂移：`registry/consul.go` 有 8 个变体
> （address 的空指针防护没有同步到其他服务）、`log/log.go` 有 4 个变体。

## 症状：门禁绿着，副本照样在长

`TestInfraHomogeneity` 用两把尺子（原文哈希、把服务名归一化后的哈希）判定副本是否一致，
新漂移立即失败，基线条目收敛后提示删行。这道棘轮做得对，但它**只能保证副本彼此相同，
不能告诉你某个文件根本不该存在**。

两个可观察的后果：

- 改一处基础设施要改 10 处，再更新一次基线。一次性技术债变成每次改动都要交的复发税。
- 迁移过程中发现 `payment` 与 `merchant` 的 `log/` 各带一份 32 行的 `ZapESLogger`，全仓零引用。
  两份内容一致，所以门禁满意；但它们是死代码，且这两个服务并不依赖 Elasticsearch。

## 根因：服务由模板生成，模板演进不回流

服务骨架由 [`go-connect-template-cli`](https://github.com/lens077/go-connect-template-cli)
从 [`go-connect-template`](https://github.com/lens077/go-connect-template) 一次性生成。
模板曾在 `internal/pkg/` 包含全部七个模块（2026-09-01 实测：`config`、`dbutil`、`env`、
`log`、`meta`、`otel`、`registry`）；这批实现现已迁入 `go-connect-kit`。

生成之后没有回流通道：模板改了，已生成的服务不会跟着变；服务改了，要靠人手工同步回模板
（模板最近一次提交是 `feat(template): sync cart production standards`）。
`log/log.go` 的四个变体就是这样产生的——四个服务停留在不同时期的模板快照上。

**推论：只在业务仓去重，治的是症状。** 已有的 10 个服务清干净之后，第 11 个服务生成出来
仍然自带七份副本。

## 规则

1. **判断一道同构门禁是在治疗还是在止血，看基线条目是否在减少。** 条目数长期不变，说明
   它只是把漂移冻住了。基线归零、门禁本身可以删除，才是收敛完成的信号。
2. **去重之前先问「这些副本是谁生成的」。** 如果来自模板或脚手架，去重必须配合修改生成方，
   否则新服务会把问题带回来。
3. **共享实现要放在可被模板导入的位置。** 模板服务于新项目，它无法 import 某个业务仓的
   `internal` 或仓内 `pkg`。这决定了根因的闭环需要一个独立可发布的模块，而不只是仓内上提。
4. **不要在共享包里接收具体配置类型。** 共享层只接收 provider-neutral 的纯 Go Options 或
   泛型参数；把 protobuf 配置结构体映射成 Options 的适配代码留在各服务内。

## 边界：什么该留在服务里

上提共享实现之后，各服务保留一层薄适配层，职责只有两项：泛型实例化，以及把本服务的
`confv1.Bootstrap` 映射成共享层的 Options。适配层不承载任何实现逻辑。

判断标准是行数与内容，不是位置：本次收敛后每个服务的适配层是 157 行
（`config` 22、`log` 27、`otel` 66、`registry` 42）。一旦某个服务的适配层开始变厚，
通常意味着有服务专属职责正在寄生——`payment` 曾把一个 HTTP request context 辅助函数
塞进宽泛的 `meta` 包，就是这个模式。

## 现状（2026-09-03）

`go-connect-kit` 已承载七个共享模块。ecommerce 与 control-tower 改为消费 kit；
`go-connect-template` 不再生成实现副本，只保留配置、日志、OTel、registry 的 protobuf-to-options
adapter。`dbutil`、`env`、`meta` 直接导入 kit。Config Center 的具体来源由
`control-tower/sdk/configsource` 适配 `config.Source` / `config.Watcher`。

`homogeneity_baseline.txt` 中与 config 实现副本相关的条目应删除；`money/numeric.go` 属于独立的
服务级同构问题，不在本次基础设施迁移范围内。

这条闭环不使用 BSR。BSR 只分发 proto，不能分发 Go 实现；共享实现通过普通 Go module
版本发布。删除 kit 后，配置热更新、日志、遥测、Consul 自恢复和数据库错误映射会重新散回
各消费方，说明模块通过删除测试并提供了实际 leverage。
