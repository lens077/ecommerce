---
name: consul-kv-missing-key-silent-disable
module: behavior
description: 缺 recommend 块时 gorse 被静默关掉而不是启动失败；nil-safe getter + 不校验未知键 = 缺配置等于悄悄降级
---

# 推荐功能「没生效」，但服务启动正常、日志无错

> 事故原文发生在 Consul KV 时代（KV 已于 2026-08-08 退役）。载体换成了 Config Center，
> **但下面这个失效模式与载体无关**，所以整条保留，只把叙述换成 Config Center 说法。

**症状**

`behavior` 服务正常启动、正常注册到 Consul、健康检查通过、日志里**没有任何错误**，
但 gorse 相关能力（`Track` 投喂 / `Recommend` / `SimilarItems`）实际上完全没工作。

**关键陷阱**

「启动成功 + 无报错」会让人默认配置是对的，于是往 gorse 服务端、网络、数据同步方向排查。

真正的原因在**配置加载阶段就已经发生了，但它不报错**。

两个叠加因素让它彻底静默：

1. 配置解码用 mapstructure，**没有开启 `ErrorUnused`** → Bootstrap 里多余的键（比如从 cart
   派生来的 `store:` / `search:`）不报错
2. 缺 `recommend:` 块时，生成的 getter 是 **nil-safe** 的 → 取不到配置不 panic，
   代码走「未配置 = 不启用」分支 → **gorse 被静默关掉，而不是启动失败**

即 `(buf.validate.field).required = true` 写了也白写——没人调 `protovalidate`，约束就只是注释。

**修复**

补齐 `behavior` / `product` 的 `recommend:` 块。上传前用服务自身的 `decodeConfig` 验证可解析。

**根治方向（✅ 已落地，2026-08-18）**

这类「缺配置 = 静默降级」是**类别性问题**，当年列的三条现在全部接线完毕：

1. ✅ mapstructure 开 `ErrorUnused` —— 未知键直接报错
2. ✅ `Init` 与热更新在解码后调 `protovalidate.Validate`（`validateBootstrap`）——
   `required` 缺段变成硬门禁：**启动时校验失败起不来；热更新校验失败保留当前配置只记 ERROR**
3. ✅ 每个服务 config 包有 `TestRealConfigFiles_DecodeAndValidate`，在有
   `configs/{dev,pre}.yml` 的机器上验证真实配置过得了校验（文件 gitignore，CI 自动 skip）

接线位置：`backend/services/{service}/internal/pkg/config/config.go → validateBootstrap + ErrorUnused`，
见 [`.service-matrix.yaml`](../../../../../.service-matrix.yaml) 的 `config_validation` 段。

⚠️ **由此产生一个新的发布风险**：服务重启后会用新校验去读配置中心的 `bootstrap.yaml`，
其中有未知键或缺 `required` 段的副本会让服务**直接起不来**。发布前先按本地
`configs/{dev,pre}.yml` 对齐配置中心内容（同段的 `rollout_warning`）。

**排查捷径**

功能「没生效」但服务一切正常时，**先 dump 服务实际加载到的配置**，不要先怀疑下游。
配置的唯一运行时来源是 Config Center 的 `<svc>/<env>/bootstrap.yaml`，
见 [`../../config/INDEX.md`](../../config/INDEX.md)。
