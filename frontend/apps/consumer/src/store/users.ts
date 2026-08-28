// 当前登录用户的资料（展示用：头像、昵称、邮箱；以及下单/收货地址要用的 userId）。
//
// ⚠️ **不落 localStorage**。原实现在模块加载时读 `localStorage.user`、并订阅
// 变更写回去，那是令牌还存 localStorage 时代的产物：既然令牌都在那儿了，
// 顺手把资料也放进去不额外增加风险。令牌改为内存态之后（见
// `packages/utils/src/tokenStore.ts`），继续留着这份就变成纯负债 ——
//   1. 它是**用户 PII**（id / 邮箱 / 昵称 / 头像 URL），无限期留在磁盘上，
//      任何能跑 JS 的脚本或扩展都能遍历到，而且登出也带不走（见下）；
//   2. 它是**未经验证的输入**：磁盘上的 JSON 谁都能改，改完 `userStore.account.id`
//      就是攻击者说了算，而 `hooks/useAddresses.ts` 直接拿它当 `userId` 发请求。
//      真正的权限判定在网关（按令牌里的身份），所以改它越不过权限，
//      但让前端拿一份可被篡改的身份去拼请求本身就是错的位置。
//
// 那删掉之后刷新页面资料从哪来？**从令牌本身来**。Casdoor 签发的 JWT 里就带
// id/name/displayName/email/avatar（`callback` 原本也正是这么填的），
// 而冷启动的静默续期一定会产生一次令牌写入。所以这里直接订阅令牌变化，
// 令牌在就解出资料、令牌没了就清空 —— 一处派生，覆盖登录/续期/冷启动/登出四条路径。
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { Account } from "@/api/users/types";

export interface UserState {
  account: Account;
}

/** 未登录时的空账户。登出、令牌失效都回到这个形状。 */
export const EMPTY_ACCOUNT: Account = {
  id: "",
  displayName: "",
  createdTime: "",
  organization: "",
  username: "",
  type: "",
  name: "",
  avatar: "",
  email: "",
  phone: "",
  affiliation: "",
  tag: "",
  language: "",
  score: 0,
  isAdmin: false,
  accessToken: "",
};

/** zustand vanilla store：React 内用 `useUserStore(selector)` 订阅，
 *  非渲染代码（回调/守卫/Provider）用 `userStore.getState()` 即时读、
 *  用下面的模块级 action 写。禁止在 React 渲染里直接 `userStore.getState()` —— 不会触发重渲染。 */
export const userStore = createStore<UserState>()(() => ({
  account: { ...EMPTY_ACCOUNT },
}));

/** React 组件订阅入口：`const name = useUserStore((s) => s.account.name)`。 */
export const useUserStore = <T>(selector: (state: UserState) => T): T =>
  useStore(userStore, selector);

export const setAccount = (account: Partial<Account>) => {
  userStore.setState((state) => ({ account: { ...state.account, ...account } }));
};

/** 清空账户。
 *  ⚠️ 不要用 `setAccount({})` 代替 —— 它是 `{...旧值, ...{}}`，**什么都不会清掉**。
 *  原先登出与两处 `beforeLoad` 守卫都写的是 `setAccount({})`，等于登出后顶栏
 *  还挂着上一个人的头像和昵称。 */
export const clearAccount = () => {
  userStore.setState({ account: { ...EMPTY_ACCOUNT } });
};

// P4：原先这里订阅令牌变化、从 JWT 载荷填资料。BFF 化后浏览器不再持有令牌，
// 该订阅永远不会触发（静默失效），故删除。现在：
//   - 登录/登出时由 AuthProvider 调 setAccount()/clearAccount()；
//   - 完整资料（头像、邮箱等）由 UserProfile RPC 提供。
