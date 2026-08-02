---
name: consul-kv-missing-key-silent-disable
module: behavior
description: Consul KV 缺 recommend 块时 gorse 被静默关掉而不是启动失败，服务看起来一切正常
---

# 推荐功能"没生效"，但服务启动正常、日志无错

**症状**

`behavior` 服务正常启动、正常注册到 Consul、健康检查通过、日志里**没有任何错误**，
但 gorse 相关能力（`Track` 投喂 / `Recommend` / `SimilarItems`）实际上完全没工作。

**关键陷阱**

「启动成功 + 无报错」会让人默认配置是对的，于是往 gorse 服务端、网络、数据同步方向排查。

真正的原因在**配置加载阶段就已经发生了，但它不报错**。

两个叠加因素让它彻底静默：

1. 配置解码用 mapstructure，**没有开启 `ErrorUnused`** → KV 里多余的键（比如从 cart 派生来的
   `store:` / `search:`）不报错
2. 缺 `recommend:` 块时，生成的 getter 是 **nil-safe** 的 → 取不到配置不 panic，
   代码走「未配置 = 不启用」分支 → **gorse 被静默关掉，而不是启动失败**

**根因**

Consul KV `ecommerce/behavior/dev.yml`（以及 `ecommerce/product/dev.yml`）缺 `recommend:` 块。
当前的 behavior KV 内容是从 cart 的配置派生来的，带着无关的 `store:` / `search:`，却没有 `recommend:`。

**修复**

补齐两份 KV 的 `recommend:` 块。上传前用服务自身的 `decodeConfig` 验证可解析。

**根治方向（尚未做）**

这类「缺配置 = 静默降级」是**类别性问题**，不止影响 behavior：

1. 开启 mapstructure 的 `ErrorUnused`，让多余键直接报错
2. 对**功能开关性质**的配置块，缺失时应当 **fail fast**，而不是 nil-safe 降级 ——
   「不配置就不启用」只应该用于真正可选的功能
3. 加一个校验脚本：按服务清单检查每个 `ecommerce/<svc>/dev.yml` 的必需键是否存在，进 CI

第 3 条就是「服务矩阵 + 配置门禁」的动机 —— 当前 `context/` 里还没有这份清单，待补。

**排查捷径**

功能"没生效"但服务一切正常时，**先 dump 服务实际加载到的配置**，
不要先怀疑下游。本项目所有服务的配置都来自 Consul KV `ecommerce/<svc>/dev.yml`，
见 [`context/team/local-env.md`](../../../../team/local-env.md)。
