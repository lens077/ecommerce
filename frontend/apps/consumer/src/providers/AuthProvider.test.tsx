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
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Code, ConnectError } from "@connectrpc/connect";
import { emitAuthError, toAppError } from "@ecommerce/api";

import { getSessionId, setSessionId, clearSessionId } from "@ecommerce/utils";
import { clearAccount, EMPTY_ACCOUNT, setAccount, userStore } from "@/store/users";
import { AuthProvider, useAuthActions, useAuthState } from "./AuthProvider";

type Identity = { authenticated: boolean; roles?: string[]; name?: string };
const startBffLogin = vi.fn();
const fetchIdentity = vi.fn<() => Promise<Identity>>();
const bffLogout = vi.fn<() => Promise<void>>();
const resetIdentity = vi.fn();
const openCasdoorLogin = vi.fn<() => Promise<{ code: string }>>();
let desktop = false;
let identity: Identity = { authenticated: false };

vi.mock("@ecommerce/configs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchIdentity: () => fetchIdentity(),
  bffLogout: () => bffLogout(),
  startBffLogin: (...args: unknown[]) => startBffLogin(...args),
}));
vi.mock("@ecommerce/tauri", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isTauri: () => desktop,
}));
vi.mock("@ecommerce/tauri/auth", () => ({
  openCasdoorLogin: () => openCasdoorLogin(),
  OauthCancelledError: class extends Error {},
}));
vi.mock("@ecommerce/tracker", () => ({
  tracker: () => ({ resetIdentity }),
}));

const router = { state: { location: { href: "/" } }, navigate: vi.fn() };

function Probe() {
  const state = useAuthState();
  const { login, logout } = useAuthActions();
  return (
    <>
      <div data-testid="auth">{String(state.isAuthenticated)}</div>
      <div data-testid="loading">{String(state.loading)}</div>
      <div data-testid="name">{state.name}</div>
      <div data-testid="roles">{state.roles.join(",")}</div>
      <button onClick={login}>Login</button>
      <button onClick={logout}>Logout</button>
    </>
  );
}

function renderAuth() {
  return render(
    <AuthProvider router={router}>
      <Probe />
    </AuthProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function settle<T>(pending: ReturnType<typeof deferred<T>>, value: T) {
  await act(async () => {
    pending.resolve(value);
    await pending.promise;
  });
}

/** 网关 401 的等价错误对象 */
function unauthenticated() {
  return toAppError(new ConnectError("未登录", Code.Unauthenticated));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  desktop = false;
  identity = { authenticated: false };
  fetchIdentity.mockImplementation(async () => identity);
  bffLogout.mockResolvedValue();
  clearAccount();
  clearSessionId();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    act(() => emitAuthError(unauthenticated()));

    expect(screen.getByTestId("auth").textContent).toBe("false");
    expect(startBffLogin).not.toHaveBeenCalled();
    expect(resetIdentity).not.toHaveBeenCalled();
  });

  it("已登录用户收到 401 仍然跳登录（会话真失效的场景不能被误伤）", async () => {
    identity = { authenticated: true, name: "张三" };
    render(
      <AuthProvider router={router}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("auth").textContent).toBe("true"));

    act(() => emitAuthError(unauthenticated()));

    await waitFor(() => expect(startBffLogin).toHaveBeenCalledTimes(1));
  });

  it.each([false, true])("连续 401 只清理和重新登录一次（desktop=%s）", async (isDesktop) => {
    desktop = isDesktop;
    identity = { authenticated: true, name: "张三", roles: ["customer"] };
    openCasdoorLogin.mockReturnValue(new Promise(() => {}));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("auth").textContent).toBe("true"));
    setAccount({ avatar: "old-avatar", email: "old@example.test" });
    setSessionId("expired-session");

    act(() => {
      emitAuthError(unauthenticated());
      emitAuthError(unauthenticated());
      emitAuthError(unauthenticated());
    });

    expect(userStore.getState().account).toEqual(EMPTY_ACCOUNT);
    expect(getSessionId()).toBeNull();
    expect(screen.getByTestId("auth").textContent).toBe("false");
    expect(screen.getByTestId("name").textContent).toBe("");
    expect(screen.getByTestId("roles").textContent).toBe("");
    expect(resetIdentity).toHaveBeenCalledExactlyOnceWith({ discardQueuedEvents: true });
    await waitFor(() =>
      expect(isDesktop ? openCasdoorLogin : startBffLogin).toHaveBeenCalledTimes(1),
    );
  });
});

describe("AuthProvider 身份生命周期", () => {
  it("首次身份查询完成前保持 loading，匿名冷启动不轮换埋点身份", async () => {
    const pending = deferred<Identity>();
    fetchIdentity.mockReturnValue(pending.promise);
    setAccount({ name: "stale-display" });
    renderAuth();
    expect(screen.getByTestId("loading").textContent).toBe("true");

    await settle(pending, { authenticated: false, name: "must-not-survive", roles: ["stale"] });

    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(userStore.getState().account).toEqual(EMPTY_ACCOUNT);
    expect(screen.getByTestId("name").textContent).toBe("");
    expect(screen.getByTestId("roles").textContent).toBe("");
    expect(resetIdentity).not.toHaveBeenCalled();
  });

  it("桌面 /auth/me 拒绝已有会话时清空会话并丢弃旧身份队列", async () => {
    desktop = true;
    setSessionId("expired-session");
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(getSessionId()).toBeNull();
    expect(resetIdentity).toHaveBeenCalledExactlyOnceWith({ discardQueuedEvents: true });
    expect(openCasdoorLogin).not.toHaveBeenCalled();
  });

  it("主动登出先处理旧队列再删会话，迟到的冷启动身份不能恢复登录", async () => {
    desktop = true;
    const pending = deferred<Identity>();
    const logout = deferred<void>();
    fetchIdentity.mockReturnValue(pending.promise);
    bffLogout.mockImplementation(() => {
      expect(resetIdentity).toHaveBeenCalledExactlyOnceWith();
      expect(getSessionId()).toBe("old-session");
      return logout.promise;
    });
    setSessionId("old-session");
    renderAuth();
    fireEvent.click(screen.getByText("Logout"));
    await settle(pending, { authenticated: true, name: "old-user" });
    expect(screen.getByTestId("auth").textContent).toBe("false");
    expect(userStore.getState().account).toEqual(EMPTY_ACCOUNT);
    await settle(logout, undefined);
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/" });
  });

  it("重新登录覆盖冷启动请求，旧响应不能覆盖新用户", async () => {
    desktop = true;
    const oldIdentity = deferred<Identity>();
    fetchIdentity
      .mockReturnValueOnce(oldIdentity.promise)
      .mockResolvedValueOnce({ authenticated: true, name: "new-user" });
    openCasdoorLogin.mockResolvedValue({ code: "new-session" });
    renderAuth();
    fireEvent.click(screen.getByText("Login"));
    await waitFor(() => expect(screen.getByTestId("name").textContent).toBe("new-user"));
    await settle(oldIdentity, { authenticated: true, name: "old-user" });
    expect(screen.getByTestId("name").textContent).toBe("new-user");
    expect(getSessionId()).toBe("new-session");
    expect(userStore.getState().account.name).toBe("new-user");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("登出后到达的原生登录回调不能写回旧会话", async () => {
    desktop = true;
    const nativeLogin = deferred<{ code: string }>();
    openCasdoorLogin.mockReturnValue(nativeLogin.promise);
    renderAuth();
    fireEvent.click(screen.getByText("Login"));
    await waitFor(() => expect(openCasdoorLogin).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("Logout"));
    await waitFor(() => expect(router.navigate).toHaveBeenCalledTimes(1));
    await settle(nativeLogin, { code: "stale-session" });
    expect(getSessionId()).toBeNull();
    expect(fetchIdentity).toHaveBeenCalledTimes(1);
  });

  it("原生身份查询在登出后返回不能恢复旧用户", async () => {
    desktop = true;
    const nativeIdentity = deferred<Identity>();
    fetchIdentity
      .mockResolvedValueOnce({ authenticated: false })
      .mockReturnValueOnce(nativeIdentity.promise);
    openCasdoorLogin.mockResolvedValue({ code: "old-session" });
    renderAuth();
    fireEvent.click(screen.getByText("Login"));
    await waitFor(() => expect(fetchIdentity).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByText("Logout"));
    await waitFor(() => expect(router.navigate).toHaveBeenCalledTimes(1));
    await settle(nativeIdentity, { authenticated: true, name: "old-user" });
    expect(screen.getByTestId("auth").textContent).toBe("false");
    expect(userStore.getState().account).toEqual(EMPTY_ACCOUNT);
  });

  it("旧登出请求完成时不清理新登录会话或导航", async () => {
    desktop = true;
    const logout = deferred<void>();
    bffLogout.mockReturnValue(logout.promise);
    identity = { authenticated: true, name: "old-user" };
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("auth").textContent).toBe("true"));
    fireEvent.click(screen.getByText("Logout"));
    identity = { authenticated: true, name: "new-user" };
    openCasdoorLogin.mockResolvedValue({ code: "new-session" });
    fireEvent.click(screen.getByText("Login"));
    await waitFor(() => expect(screen.getByTestId("name").textContent).toBe("new-user"));
    await settle(logout, undefined);
    expect(getSessionId()).toBe("new-session");
    expect(userStore.getState().account.name).toBe("new-user");
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
