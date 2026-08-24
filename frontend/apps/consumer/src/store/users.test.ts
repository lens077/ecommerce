/**
 * 锁住「用户资料只在内存、绝不落 localStorage」这条不变量。
 *
 * 背景演进：
 *   - 最早资料存 `localStorage.user`（PII 长期留盘 + `userId` 可被本地篡改），已删；
 *   - 中间一版改为**订阅令牌变化、从 JWT 解出资料**；
 *   - P4（BFF 化）后浏览器不再持有任何令牌，那条订阅永远不会触发，故删除。
 *     现在资料由 AuthProvider（登录态）与 UserProfile RPC（完整资料）写入。
 *
 * 最容易悄悄弄坏的地方是**登出**：只要 `clearAccount()` 漏了或被写成
 * `setAccount({})`（它是 `{...旧值, ...{}}`，什么都不清），顶栏就会继续挂着
 * 上一个人的头像和昵称，而 tsc 与 lint 都看不见 —— 所以在这里钉死。
 */
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { EMPTY_ACCOUNT, clearAccount, setAccount, userStore } from "./users";

const ACCOUNT = {
  id: "u-42",
  name: "alice",
  displayName: "Alice",
  email: "alice@example.com",
  avatar: "https://cdn.casbin.org/img/alice.png",
};

describe("用户资料 store", () => {
  beforeEach(() => {
    clearAccount();
    localStorage.clear();
  });

  it("setAccount 写入后可读", () => {
    setAccount(ACCOUNT);
    expect(userStore.account.name).toBe("alice");
    expect(userStore.account.displayName).toBe("Alice");
  });

  it("clearAccount 必须真的清空（不能残留上一个人的资料）", () => {
    setAccount(ACCOUNT);
    clearAccount();
    expect(userStore.account).toEqual(EMPTY_ACCOUNT);
    expect(userStore.account.name).toBeFalsy();
    expect(userStore.account.avatar).toBeFalsy();
  });

  it("资料绝不落 localStorage", () => {
    setAccount(ACCOUNT);
    const dumped = JSON.stringify(localStorage);
    expect(dumped).not.toContain("alice");
    expect(dumped).not.toContain("u-42");
  });
});
