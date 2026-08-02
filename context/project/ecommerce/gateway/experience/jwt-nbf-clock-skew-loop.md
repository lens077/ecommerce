---
name: jwt-nbf-clock-skew-loop
module: gateway
description: 前端登录后立刻 401 死循环，多半是网关 JWT nbf 零容差 + 时钟偏移，不是验签/证书/RBAC
---

# 登录后立刻 401 → 无限跳登录页

**症状**

前端 Casdoor 登录成功（`SignIn` 200，拿到 token），但登录后**毫秒级**发出的第一个受保护请求
被网关判 401 `TOKEN_PARSE_FAILED`。前端 `error.ts` 当作未认证 → 清 token → 跳 Casdoor →
（Casdoor 会话还在）自动跳回 → **无限死循环**。

网关日志原文：

```
token has invalid claims: token is not valid yet
```

**关键陷阱**

用 `curl` 拿**同一枚 token** 打网关**会通过**。

因为从复制 token 到执行 curl 已经过了几秒，`nbf` 已经变成过去时间。
于是极易误判为「令牌没问题、网关没问题」，然后一路往验签、证书、RBAC 方向白查。

**根因**

- Casdoor 签发的令牌 `nbf` / `iat` ≈ `now`
- golang-jwt v5 对 `nbf` / `exp` **默认零容差**
- 网关机器与 Casdoor（114.132.233.129）存在**亚秒级时钟偏移**

→ 刚签发的 token，其 `nbf` 比网关本地时钟大一点点 → 判定「尚未生效」→ 拒绝。

**修复**

`gateway/middleware/jwt/jwt.go` 的 `jwt.ParseWithClaims` 加：

```go
jwt.WithLeeway(60 * time.Second)
```

其它自己验 JWT 的服务需同样处理。

**排查捷径**

遇到「登录就死循环」，**先看网关 JWT 日志区分两种错误**：

| 日志 | 方向 |
|---|---|
| `signature is invalid` | 证书/公钥不匹配（Casdoor kid=lens / public.pem，见 [`context/team/local-env.md`](../../../../team/local-env.md)） |
| `token is not valid yet` | **nbf 时钟偏移，就是本条** |

前端已加死循环保护：登录后 < 15s 仍认证失败会停在登录页，而不是无限跳转。
