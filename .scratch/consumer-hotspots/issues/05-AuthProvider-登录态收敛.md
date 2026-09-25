# AuthProvider 登录态收敛

Status: done

## 实现

resetToAnonymous 统一清理内存会话、账号、roles/name/auth 状态。匿名冷启动保留匿名 ID；已观察到身份失效时丢弃旧身份待发队列再轮换 ID。主动 logout 仍先处理旧队列，再向 BFF 注销并立即清本地状态。

identityVersion 拦截冷启动查询、原生登录回调/查询、旧登出完成等过期结果；同步 ref 在 React commit 前拦住同批连续 401。保留 useLayoutEffect 快照，新增首次/原生登录 loading，并隐藏加载中的账号控件。公开 setter 已删除，router 使用窄类型。保留 Web cookie 与桌面 X-CT-Session BFF 路径，不复活 PKCE/JWT 逻辑。

## 验收标准

1. AuthProvider 既有匿名/已登录 401 测试及新增 loading、过期身份、延迟请求、重复 401 回归全部通过。
2. AppBar loading 下不显示登录/账号动作；tracker discardQueuedEvents 不发送旧队列，默认 reset 行为保留。
3. public actions 无 setIsAuthenticated、router 无 any，账号清理集中在复位函数。
4. consumer 类型检查、a11y、tracker 测试、完整 pnpm ready rc=0。

## 完成自检

- [x] 验收标准逐条通过 —— #1 provider 11 条通过，新增 9 条先红后绿；#2 AppBar 2 条、tracker 4 条通过；#3 类型/引用核对通过；#4 tsc、a11y 13 条和 verify-quick.O4ZnTT 前端链 rc=0。
- [x] 跑过的锚点 —— 九个文件 scoped lint/fmt 无警告，完整 workspace 前端链通过。
- [x] 规范回写 —— HANDOFF 的事件区别已落实到注释；清理步骤相同不等于匿名冷启动也轮换身份。
- [x] TODO.md 已更新 —— 推荐登录身份关联注明 401 清理与过期回写保护；behavior 关联部分仍未完成。
- [ ] 实际认证联调 —— 未运行真实 Web OAuth、Tauri Rust 登录窗口；浏览器验收使用隔离身份 fixture。

## 已知边界

首次 Web /auth/me 返回未登录时，无法区分不存在与过期的 httpOnly cookie，不能凭展示资料推断；保留匿名连续性。全局 auth-error 未携带请求身份版本，因此旧请求在成功重登之后才到达的 401 仍无法精准区分；本次覆盖同批失败与待登录竞态。已发网络请求和 tracker dwell/impression 定时器不在待发队列清理范围，未扩张 tracker 生命周期；桌面 tracker transport 的会话头接线未改变。

## Comments

没有调用实际网关、注销真实账号或执行部署。
