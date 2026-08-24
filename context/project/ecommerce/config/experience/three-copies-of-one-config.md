---
name: three-copies-of-one-config
layer: project/ecommerce/config
description: 历史上同一份服务配置存在三处的漂移事故；现已由 Config Center 单源消除，留下的是「怎么判断某个段该不该有」的方法
---

# 历史事故：一份配置曾有三个副本

> 2026-08-08 后本文仅作事故复盘。Consul KV Bootstrap 已删除，Config Center 是唯一
> 运行时来源；禁止按本文历史路径恢复 KV 或 `dev-consul`。
> 当年逐个服务的漂移清单已随 KV 一起消失，不再复述；留下的是判断方法和两个仍会复发的陷阱。

## 症状

三种，看起来毫不相干：

1. behavior 起来了、注册了、健康检查通过，但推荐功能没有任何反应，日志一行异常都没有
2. cart 在 pre 环境里商品缩略图全是坏链
3. 有人照着仓库里的 `merchant/configs/dev.yml` 改了 Consul 的心跳参数，改完发现字段名根本对不上

## 真相

同一份 Bootstrap 配置存在三处，而**没有任何机制保证它们一致**：

| 位置 | 谁在读 |
|---|---|
| Consul KV `ecommerce/<svc>/<env>.yml` | 已退役 |
| 配置中心 `<svc>/<env>/bootstrap.yaml` | **唯一运行时来源** |
| 仓库 `backend/services/<svc>/configs/<env>.yml` | **没有任何程序读它** |

第三个是关键，而且它今天仍然存在：那些文件从来不是运行时配置，只是本地工作副本。
但因为它们躺在仓库里、名字又叫 `dev.yml`，所有人都默认它们是真相源。

## 为什么全都是静默的

配置解码只跑 mapstructure，**从不调 `protovalidate`**，而且没开 `ErrorUnused`：

- 缺块 → 不报错，protobuf 的 getter 是 nil-safe 的，功能被静默关掉
- 多余的块 → 不报错，直接忽略

于是 `(buf.validate.field).required = true` 一个都没生效过。
（这两道门已于 2026-08-18 接线，见
[`../../behavior/experience/consul-kv-missing-key-silent-disable.md`](../../behavior/experience/consul-kv-missing-key-silent-disable.md)。）

## 该怎么做

**编辑入口固定在 Config Center 管理员 API/UI**。本地 Bootstrap 只可作为一次性迁移材料，
不能成为自动回退源。服务端 machine token 只允许读取和 Watch，不能写配置。

**改配置前先对着 `conf.proto` 的 `Bootstrap` 数一遍段**。判断某个段该不该有，
唯一依据是那个服务自己的 proto，**不是「隔壁服务有」**。跨服务复制配置是这些错误的共同来源。

**验证方式**：用该服务真实的 `Bootstrap` 类型 + 与 `decodeConfig` 完全相同的解码链路解一遍，
再列出实际被填充的顶层字段。只看 YAML 语法合法说明不了任何问题——当年每一份都是合法 YAML。

## 配置中心必须经 SDK selector

不要在服务内手写 Config Center 的 ConnectRPC client，也不要再使用
`CONFIG_SOURCE=configcenter` 加 `CONFIG_CENTER_*` 环境变量。Config Center 对机器读取要求
`x-config-center-service-token`；旧的手写客户端没有携带该 header，会得到 401。统一使用
`github.com/lens077/control-tower/sdk/configsource` 读取本地 `CONFIG_SOURCE_FILE`：SDK 从 selector
的 `config_center.service_token` 创建请求头。业务服务额外限制 selector 只能是 `config_center`。

selector 是加载远端 Bootstrap 之前唯一可用的启动配置。示例文件只记录地址、命名空间、环境和
key；含 token 的 `configs/source.dev.yaml` 必须被 gitignore，集群用 Kubernetes Secret 以文件形式
挂载。服务启动时 selector 缺失或 token 无效应直接失败，绝不静默降级。

## 陷阱

- **`.gitignore` 里的 `per.yml` 是 `pre.yml` 的笔误**（`4a3eb70b`），加上四个服务压根没有这个文件，
  结果 11 份带明文凭据的配置一直被 git 跟踪。**配了 ignore 不等于 ignore 生效**，
  用 `git check-ignore -v <文件>` 逐份验，没有输出就是没拦住。
- **第一直觉「以仓库为准单向覆盖」是错的**：仓库副本没有任何程序读，它不是真相源；
  合并方向要三方比对（仓库 / 配置中心 / proto），以 proto 为裁判。

## 相关

- 哪些段改了会立刻生效：[`config-hot-reload-boundaries.md`](config-hot-reload-boundaries.md)
- 缺块导致 gorse 静默关闭的原始记录：[`../../behavior/experience/consul-kv-missing-key-silent-disable.md`](../../behavior/experience/consul-kv-missing-key-silent-disable.md)
- 心跳参数本身的坑：[`../../registry/experience/consul-ttl-first-ping-blind-window.md`](../../registry/experience/consul-ttl-first-ping-blind-window.md)
