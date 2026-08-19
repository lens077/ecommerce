/**
 * 锁住「用户资料从令牌派生、且不落 localStorage」这条不变量。
 *
 * 背景：资料原先存在 `localStorage.user`，模块加载时读、变更时写回。令牌改为内存态
 * 之后那份就成了纯负债（PII 长期留盘 + `userId` 可被本地篡改），已删除，改为订阅
 * 令牌变化、从 JWT 里解出来。
 *
 * 这个改动**最容易悄悄弄坏的地方是刷新之后**：令牌只在内存，刷新时靠静默续期重新
 * 拿一份，如果派生这一步漏了，页面不会报任何错 —— 只是头像和昵称变空、
 * `useAddresses` 拿着空 userId 去发请求。tsc 与 lint 都看不见，所以在这里钉死。
 */
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { clearTokens, setTokens } from "@ecommerce/utils";

import { EMPTY_ACCOUNT, clearAccount, setAccount, userStore } from "./users";

/** 造一个只有 payload 有意义的 JWT —— 前端只做 decode 不验签，签名段随便填。 */
const makeJwt = (payload: Record<string, unknown>) => {
  const b64 = (o: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64({ alg: "RS256", typ: "JWT" })}.${b64(payload)}.sig`;
};

const CASDOOR_CLAIMS = {
  id: "u-42",
  name: "alice",
  displayName: "Alice",
  email: "alice@example.com",
  avatar: "https://cdn.casbin.org/img/alice.png",
  exp: Math.floor(Date.now() / 1000) + 3600,
};

describe("用户资料 store", () => {
  beforeEach(() => {
    clearTokens();
    clearAccount();
    localStorage.clear();
  });

  it("令牌写入时从 JWT 解出资料", () => {
    setTokens({ accessToken: makeJwt(CASDOOR_CLAIMS) });

    expect(userStore.account.id).toBe("u-42");
    expect(userStore.account.name).toBe("alice");
    expect(userStore.account.displayName).toBe("Alice");
    expect(userStore.account.email).toBe("alice@example.com");
    expect(userStore.account.avatar).toBe("https://cdn.casbin.org/img/alice.png");
  });

  it("换一份新令牌（模拟静默续期）后资料仍在", () => {
    setTokens({ accessToken: makeJwt(CASDOOR_CLAIMS) });
    // 续期拿到的是一份**新的** JWT，claims 相同。这一步等价于刷新页面后的冷启动恢复。
    setTokens({ accessToken: makeJwt({ ...CASDOOR_CLAIMS, exp: CASDOOR_CLAIMS.exp + 3600 }) });

    expect(userStore.account.id).toBe("u-42");
    expect(userStore.account.avatar).toBe("https://cdn.casbin.org/img/alice.png");
  });

  it("清空令牌时资料一并清干净", () => {
    setTokens({ accessToken: makeJwt(CASDOOR_CLAIMS) });
    clearTokens();

    expect(userStore.account).toEqual(EMPTY_ACCOUNT);
  });

  it("setAccount({}) 清不掉任何东西 —— 所以登出必须用 clearAccount()", () => {
    // 这不是在测一个"特性"，是把当初的 bug 钉在这儿：登出、两处路由守卫原先都写的是
    // setAccount({})，而它是 {...旧值, ...{}}，于是登出后顶栏还挂着上一个人的头像。
    setTokens({ accessToken: makeJwt(CASDOOR_CLAIMS) });

    setAccount({});
    expect(userStore.account.id).toBe("u-42");

    clearAccount();
    expect(userStore.account.id).toBe("");
  });

  it("全程不往 localStorage 写用户资料", () => {
    setTokens({ accessToken: makeJwt(CASDOOR_CLAIMS) });
    setAccount({ phone: "13800000000" });
    clearTokens();

    expect(localStorage.getItem("user")).toBeNull();
  });

  it("令牌不是合法 JWT 时保持原样，不炸也不写脏数据", () => {
    setTokens({ accessToken: "not-a-jwt" });

    expect(userStore.account).toEqual(EMPTY_ACCOUNT);
  });
});
