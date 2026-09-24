# AuthProvider 登录态收敛

Status: ready-for-agent

依赖：无，可与 01–04 并行。

## 问题

`frontend/apps/consumer/src/providers/AuthProvider.tsx` 是 consumer 修 bug 最多的文件（近半年 6 次：`375faec5` `13be5e72` `9b040ecd` `7af0d799` `b99b2ef7` `9703be3a`）。根因是「回到未登录」散落在三处，每次修 bug 只改到其中一处：

| 路径 | `tracker().resetIdentity()` | `clearSessionId()` | `clearAccount()` | 三个 `setState` |
|---|---|---|---|---|
| `logout` | ✅ | ✅ | ✅ | ✅ |
| `onAuthError`（已登录收到 401） | ❌ | ✅ | ❌ | ✅ |
| `applyIdentity`（`/auth/me` 返回未登录） | ❌ | ❌ | ✅ | ✅ |

后果：
- 会话过期（401 路径）后没有 `resetIdentity()`：`375faec5` 修的正是「共享设备上下一个登录的人继承本人的匿名浏览记录」，但只修了主动登出，会话过期后换人登录同样会继承。
- 401 路径没有 `clearAccount()`：桌面端（Tauri）走 `login()` 打开子窗口、不整页跳转，顶栏在重新登录前仍显示上一个用户名。

另外三处：
- **没有 `loading`**：冷启动 `/auth/me` 返回前 `isAuthenticated=false`，已登录用户会先看到一帧「未登录」顶栏。共享包 `packages/ui/src/auth/BffAuthProvider.tsx` 已有 `loading`，consumer 没有跟上（文件头注释写明 consumer 因 Tauri 与自有 store 不复用它）。
- **`setIsAuthenticated` 暴露在 actions 里**：全仓只有 `src/bootstrap.tsx` 与 `src/a11y/pages.a11y.test.tsx` 传入 `() => {}`，`routes/__root.tsx` 的路由上下文类型里也声明了它。任何组件都能把登录态改成与 `/auth/me` 不一致，却没有真实使用方。
- `router: any`。

## 实现步骤

1. 在组件内新增唯一的复位函数，例如：
   ```ts
   const resetToAnonymous = useCallback((opts: { endSession: boolean }) => { ... }, []);
   ```
   包含：`tracker().resetIdentity()`、`clearAccount()`、三个 `setState`；`endSession` 为真时再 `clearSessionId()`。`logout`（`bffLogout().finally` 内）、`onAuthError`、`applyIdentity` 的未登录分支都只调用它。
   - **顺序约束**：`logout` 里 `tracker().resetIdentity()` 必须在 `bffLogout()` **之前**（注释写了原因：积压事件要在会话 cookie 还在时发出）。复位函数被 `logout` 调用时要保持这个顺序，可以让 `logout` 先单独调 `resetIdentity()`、复位函数用参数跳过，或把 tracker 重置拆成独立一步——选一种并在代码注释里写明。
   - `applyIdentity` 的未登录分支在冷启动时也会走到：此时没有旧身份，`resetIdentity()` 是否会生成新的匿名 ID、是否影响匿名用户的连续浏览记录，先读 `@ecommerce/tracker` 的实现再决定这个分支是否调用它，并把结论写进注释。
2. 增加 `loading`：初值 `true`，首次 `fetchIdentity()` 完成后置 `false`；加入 `AuthStateContext` 的值与类型。顶栏（`src/components/AppBar.tsx`）在 `loading` 时不渲染登录按钮也不渲染用户菜单（占位即可）。不要改动 401 处理对 `isAuthenticatedRef` 的依赖与 `useLayoutEffect`（`13be5e72` 修过的竞态，注释里有 GitLab pipeline #77 的实测）。
3. 从 `AuthActionsContextType` 删除 `setIsAuthenticated`，同步删除 `bootstrap.tsx`、`routes/__root.tsx`（路由上下文类型）、`src/a11y/pages.a11y.test.tsx` 中的对应项。
4. `router: any` 改为 TanStack Router 的路由实例类型（从 `routes/__root.tsx` 或 `routeTree` 推导，参照仓内既有写法）。
5. 回归测试，写在已有的 `src/providers/AuthProvider.test.tsx`（它已有「匿名用户收到 401 不跳登录」「已登录用户收到 401 仍然跳登录」两个用例），只加与本单修复对应的：
   - 已登录用户收到 401 后，`clearAccount` 与 `tracker().resetIdentity` 都被调用；
   - `/auth/me` 未返回前 `useAuthState().loading === true`，返回后为 `false`。

## 验收标准

1. `grep -n "setIsAuthenticated" -r frontend/apps/consumer/src` 只剩 `AuthProvider.tsx` 内部的 `useState` 解构（或完全无输出，若改名）。
2. `grep -c "clearAccount()" frontend/apps/consumer/src/providers/AuthProvider.tsx` 等于 1（只在复位函数里出现一次）。
3. `AuthProvider.test.tsx` 新增的两个用例存在且通过；原有两个 401 用例仍通过。
4. `grep -n "router: any" frontend/apps/consumer/src/providers/AuthProvider.tsx` 无输出。
5. `cd frontend && pnpm ready` 退出码 0。

## 不做

- 不迁移到共享 `BffAuthProvider`（文件头注释说明了 consumer 保留独立实现的原因：Tauri 原生登录 + 自有 store）。
- 不改 PKCE、Tauri 登录子窗口、`startBffLogin` 的回跳地址逻辑。

## Comments
