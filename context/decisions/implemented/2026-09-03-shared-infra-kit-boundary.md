---
name: 2026-09-03-shared-infra-kit-boundary
layer: decisions
status: implemented
description: 共享基础设施实现只存在于 go-connect-kit，消费方只保留 protobuf-to-options adapter
---

# 决策：共享基础设施以 kit 为实现边界

## 问题

10 个业务服务和生成模板曾各自保存 `config`、`log`、`otel`、`registry`、`dbutil`、`env`、
`meta` 实现。哈希同构门禁只能冻结副本之间的漂移，无法阻止同一份实现被同时复制回所有服务；
仓内 `backend/pkg` 上提也不能阻止模板生成第 11 份副本。

## 决策

`go-connect-kit` 是共享实现的唯一归属，也承载跨仓复用的 YAML/JSON Schema 脱敏校验辅助。
kit 的运行时接口只接收 provider-neutral Go Options 与泛型
`config.Live[T]`，不导入 ecommerce、control-tower、模板或消费方 protobuf。各消费方只保留：

- 泛型配置类型实例化和 `confv1.Bootstrap` 到 Options 的映射；
- restart-required 配置段投影；
- Config Center 原始 SDK 到 `config.Source` / `config.Watcher` 的 control-tower adapter。

`env`、`meta`、`dbutil` 由消费方直接导入。`config`、`log`、`otel`、`registry` 的薄 adapter
不得直接依赖 Viper、mapstructure、OTel exporter、Consul API 等实现库。

这条依赖链不使用 BSR。BSR 分发 proto，不分发 Go 实现；kit 按普通 Go module 版本发布。

## 考虑过的替代方案

- **只上提到 `backend/pkg`** — 能清理现有服务，但模板无法导入业务仓，下一次生成仍会复制实现。
- **共享配置 proto 并通过 BSR 分发** — 把消费方契约和共享实现错误地绑在一起，还新增无关的 proto 发布链路；Go Options 已能提供更小、更稳定的接缝。
- **在消费方保留同名完整转发包** — 路径看似兼容，但没有隐藏复杂度，容易继续承载实现并让删除测试失真。

## 后果

发布顺序固定为 kit → control-tower SDK source adapter → ecommerce/模板。消费方已脱离临时
`go.work`；仓库内不得提交本地 `replace`，各消费方 pin 的版本以自己的 `go.mod` 为准。

本文不复述具体版本号：版本的真相源是 `go.mod`，抄进散文的那一刻就开始等着过期
（本节曾写「当前已发布 kit `v0.3.0`」，而消费方早已 pin 到 `v0.4.2`）。
`[DECISION]` 门禁只校验路径、`status` 与必需章节，管不了内容是否新鲜。

`TestSharedImplementationsDoNotReturnToConsumers` 守住删除结果，`TestInfraAdaptersStayThin` 守住
adapter 的依赖边界；`TestInfraHomogeneity` 只比较仍由本仓维护的同构代码，不再比较允许按服务
protobuf 分化的 adapter。触发事故与注错验证记录在
[evolution-log.md](../../harness-framework/evolution-log.md)。
