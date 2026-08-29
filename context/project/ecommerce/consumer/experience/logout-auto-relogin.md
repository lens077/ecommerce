---
name: logout-auto-relogin
module: consumer
description: 登出后过一会儿自动恢复登录态——续期定时器没停 + setAccount({}) 浅合并清不掉，不是 token 没清
---

# 登出后过一会儿自己又登回去

> 2026-08-26 由 session 反传（flywheel-audit「session 反传」节）补沉淀：教训在 08-19
> 会话里讲过、代码注释与 TODO 都留了痕，但 context/ 一直没有检索入口。

**症状**

点登出，提示成功、回到未登录态；不刷新页面，过一会儿（续期周期到点）登录态
自动恢复，头像昵称回来了。全程无报错。

**关键陷阱**

第一直觉是「token 没清干净」或「Casdoor 会话没退」，于是去查存储和退登接口——
但检查会发现 token 确实清掉了，方向全错。真正的残留有两个，都不在「存储」里：

1. **续期定时器还在跑**：到点后它用 Casdoor 的会话 Cookie 静默换一份新令牌，
   登录态凭空回来。
2. **`setAccount({})` 什么都清不掉**：它的语义是 `{...旧值, ...{}}` 浅合并，
   登出与两处路由守卫全写的这个，看起来在清、实际是空操作。

**根因**

登出存在第二条并行路径：`AppBar` 手工调 `clearToken()` + 拍空 store，
漏了 `stopRenew()`；叠加浅合并语义的 `setAccount({})`。

**修复**

- 登出统一走 `AuthProvider` 的 `logout()`（清 store、停续期、跳首页都在里面），
  `AppBar.tsx` 的 `handleMenuClose` 处留有告警注释，**不要在组件里自己清**。
- 用户资料改为 store 订阅令牌变化、从 JWT 派生，一处覆盖登录/续期/冷启动/登出
  四条路径；`store/users.test.ts` 以 6 条单测锁不变量（含反证：注掉订阅后 3 条转红）。

普适规则：**凡有后台令牌续期，登出必须同时停掉续期器**；清状态不要用
浅合并的 `set({})`，要逐字段置空或换整对象。
（本条教训成立于 valtio 时期；2026-08-28 已迁 Zustand，`set` 的浅合并语义同样适用，规则不变。）

**后续决策覆盖（2026-08-28）**：本条结论已被 docs/TECH.md 覆盖：现行鉴权采用 Casdoor 有状态 Session（Dragonfly Session Store）+ OpenFGA，完全废弃 JWT；历史登出清理与停续期教训仍适用于 Session 生命周期。
