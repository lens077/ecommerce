/**
 * 锁住「401 是否该跳登录」这条判断。
 *
 * 回归的 bug：匿名访问首页被强制拉去登录。链路是顶栏的 GetCart 匿名发出 → 网关
 * 401 → errorInterceptor emitAuthError → AuthProvider 无条件 startBffLogin。
 * 根因是「401 = 会话失效」这个前提只在**用户曾经登录过**时成立；匿名用户的 401
 * 只意味着「这个接口需要登录」。
 *
 * 两个方向都必须测：只测「匿名不跳」的话，把整个跳转逻辑删掉也能绿——那是把功能
 * 关了，不是修好了。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Code, ConnectError } from "@connectrpc/connect";
import { emitAuthError, toAppError } from "@ecommerce/api";

import { AuthProvider, useAuthState } from "./AuthProvider";

const startBffLogin = vi.fn();
let identity: { authenticated: boolean; roles?: string[]; name?: string } = {
  authenticated: false,
};

vi.mock("@ecommerce/configs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchIdentity: async () => identity,
  startBffLogin: (...args: unknown[]) => startBffLogin(...args),
}));
// 桌面端走开子窗口分支，这里固定为 Web 端整页跳转分支
vi.mock("@ecommerce/tauri", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isTauri: () => false,
}));

/** AuthProvider 只用到 router.state.location.href */
const router = { state: { location: { href: "/" } } } as never;

function Probe() {
  const { isAuthenticated } = useAuthState();
  return <div data-testid="auth">{String(isAuthenticated)}</div>;
}

/** 网关 401 的等价错误对象 */
function unauthenticated() {
  return toAppError(new ConnectError("未登录", Code.Unauthenticated));
}

beforeEach(() => {
  startBffLogin.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("AuthProvider 对 401 的处理", () => {
  it("匿名用户收到 401 不跳登录（匿名逛商城不该被拉走）", async () => {
    identity = { authenticated: false };
    render(
      <AuthProvider router={router}>
        <Probe />
      </AuthProvider>,
    );
    // 等冷启动的身份查询落地，确保读到的是「未登录」而不是初始值
    await waitFor(() => expect(screen.getByTestId("auth").textContent).toBe("false"));

    emitAuthError(unauthenticated());

    expect(startBffLogin).not.toHaveBeenCalled();
  });

  it("已登录用户收到 401 仍然跳登录（会话真失效的场景不能被误伤）", async () => {
    identity = { authenticated: true, name: "张三" };
    render(
      <AuthProvider router={router}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("auth").textContent).toBe("true"));

    emitAuthError(unauthenticated());

    await waitFor(() => expect(startBffLogin).toHaveBeenCalledTimes(1));
  });
});
