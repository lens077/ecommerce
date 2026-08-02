---
name: three-copies-of-one-config
layer: project/ecommerce/config
description: 同一份服务配置存在仓库、Consul KV、配置中心三处，谁是源、谁会漂移、漂移会怎么静默生效
---

# 一份配置三个副本，谁也没拦着它们分叉

## 症状

三种，看起来毫不相干：

1. behavior 起来了、注册了、健康检查通过，但推荐功能没有任何反应，日志一行异常都没有
2. cart 在 pre 环境里商品缩略图全是坏链
3. 有人照着仓库里的 `merchant/configs/dev.yml` 改了 Consul 的心跳参数，改完发现字段名根本对不上

## 真相

同一份 Bootstrap 配置存在三处，而**没有任何机制保证它们一致**：

| 位置 | 谁在读 |
|---|---|
| Consul KV `ecommerce/<svc>/<env>.yml` | `CONFIG_SOURCE=consul` 的服务（默认） |
| 配置中心 `<svc>/<env>/bootstrap.yaml` | `CONFIG_SOURCE=configcenter` 的服务 |
| 仓库 `backend/services/<svc>/configs/<env>.yml` | **没有任何程序读它** |

第三个是关键：那些文件从来不是运行时配置，只是本地工作副本。但因为它们躺在仓库里、
名字又叫 `dev.yml`，所有人都默认它们是真相源。2026-08 清点时的实际状态：

- **behavior 的 KV 是 cart 的复制品** —— 带着 behavior 的 `conf.proto` 里根本没有的
  `store` 和 `search` 段，缺了 `required = true` 的 `recommend` 段
- **product 的 KV 缺 `recommend`**，而仓库副本有
- **payment 的仓库副本缺 `pay`**，而 KV 有
- **product 的 KV `pre.yml` 根本不是 pre**：连的是 `pg-dev.app.com` / `consul.app.com`
  这些从集群内解析不到的外部域名，它是 dev 换了个端口
- **cart 的 `pre.yml` 缺 `store` 段**，而 `internal/data/cart.go` 要用它拼 MinIO 缩略图 URL
- merchant / config 的仓库副本停在更老的 schema（`ping_interval_seconds: 1`、`host: 127.0.0.1`）

## 为什么全都是静默的

配置解码只跑 mapstructure，**从不调 `protovalidate`**，而且没开 `ErrorUnused`：

- 缺块 → 不报错，protobuf 的 getter 是 nil-safe 的，功能被静默关掉
- 多余的块 → 不报错，直接忽略

于是 `(buf.validate.field).required = true` 一个都没生效过。behavior 那条
`Recommend recommend = 6 [(buf.validate.field).required = true]` 写得清清楚楚，
但缺了它服务照样启动、照样注册、照样健康。

## 该怎么做

**编辑入口固定在 Consul KV**，改完用 `go run ./tools/config-seed -write` 同步到配置中心。
仓库副本只当本地工作文件，且它是 gitignore 的（含密码，AGENTS.md 硬规则 4）——
所以**任何自动化都不能拿仓库副本当输入**，`config-seed` 的源是 KV 就是这个原因。

**改配置前先对着 `conf.proto` 的 `Bootstrap` 数一遍段**。判断某个段该不该有，
唯一依据是那个服务自己的 proto，不是「隔壁服务有」。跨服务复制配置是这些错误的共同来源。

**验证方式**：用该服务真实的 `Bootstrap` 类型 + 与 `decodeConfig` 完全相同的解码链路解一遍，
再列出实际被填充的顶层字段。只看 YAML 语法合法说明不了任何问题——上面每一份都是合法 YAML。

## 陷阱

- **第一直觉是「以仓库为准同步到 KV」**，那会把 behavior 之外的几个服务改坏：
  合并方向逐服务都不一样，得三方比对（仓库 / KV / proto）而不是单向覆盖。
- **`.gitignore` 里的 `per.yml` 是 `pre.yml` 的笔误**（`4a3eb70b`），加上四个服务压根没有这个文件，
  结果 11 份带明文凭据的配置一直被 git 跟踪。配了 ignore 不等于 ignore 生效，
  用 `git check-ignore -v <文件>` 逐份验，没有输出就是没拦住。
- **`prod.yml` 在 KV 里一个都不存在**，但 `deploy/prod` 的 `CONSUL_PATH` 全指向它。

## 相关

- 哪些段改了会立刻生效：[`config-hot-reload-boundaries.md`](config-hot-reload-boundaries.md)
- 缺块导致 gorse 静默关闭的原始记录：[`../../behavior/experience/consul-kv-missing-key-silent-disable.md`](../../behavior/experience/consul-kv-missing-key-silent-disable.md)
- 心跳参数本身的坑：[`../../registry/experience/consul-ttl-first-ping-blind-window.md`](../../registry/experience/consul-ttl-first-ping-blind-window.md)
