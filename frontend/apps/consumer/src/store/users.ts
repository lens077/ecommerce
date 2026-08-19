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
import { proxy } from "valtio";
import { decodeJwtPayload, subscribeToken } from "@ecommerce/utils";
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

export const userStore = proxy<UserState>({
  account: { ...EMPTY_ACCOUNT },
});

export const setAccount = (account: Partial<Account>) => {
  // 使用 Object.assign 或扩展运算符来合并新数据
  userStore.account = { ...userStore.account, ...account };
};

/** 清空账户。
 *  ⚠️ 不要用 `setAccount({})` 代替 —— 它是 `{...旧值, ...{}}`，**什么都不会清掉**。
 *  原先登出与两处 `beforeLoad` 守卫都写的是 `setAccount({})`，等于登出后顶栏
 *  还挂着上一个人的头像和昵称。 */
export const clearAccount = () => {
  userStore.account = { ...EMPTY_ACCOUNT };
};

// 资料随令牌走。注册在模块顶层（替换掉原先那个写 localStorage 的 subscribe），
// 不放 React 组件里：路由的 `beforeLoad` 会在组件挂载之前就调 `clearTokens()`，
// 挂在组件里会漏掉那一路。
subscribeToken((token) => {
  if (!token) {
    clearAccount();
    return;
  }
  const payload = decodeJwtPayload(token);
  if (!payload) return;
  setAccount({
    id: payload.id,
    name: payload.name,
    displayName: payload.displayName,
    email: payload.email,
    avatar: payload.avatar,
  });
});
