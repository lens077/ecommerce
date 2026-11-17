import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { cleanup, render, screen } from "@testing-library/react";
import AppBar from "./AppBar";

const auth = vi.hoisted(() => ({ isAuthenticated: false, loading: true }));
vi.mock("@/providers/AuthProvider", () => ({
  useAuthState: () => auth,
  useAuthActions: () => ({ login: vi.fn(), logout: vi.fn() }),
}));
vi.mock("@/hooks/useCart", () => ({ useCartBadge: () => 0 }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@ecommerce/ui", () => ({ LocaleSwitcher: () => null }));
vi.mock("@ecommerce/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  useFormat: () => ({ formatCurrency: String }),
}));

afterEach(cleanup);

describe("AppBar auth loading", () => {
  it.each([false, true])(
    "hides both auth controls until identity is known (authenticated=%s)",
    (authenticated) => {
      auth.isAuthenticated = authenticated;
      auth.loading = true;
      const view = render(<AppBar />);

      // 用 hidden: true 断言「DOM 里有没有」，而不是「此刻看不看得见」。
      // AppBar 的桌面/移动两套控件靠 CSS 媒体查询互斥显示（display: {xs, md}），
      // jsdom 不做布局，可见性判定取决于 matchMedia 补丁的具体返回（见 src/test-setup.ts）：
      // 补丁返回 false 时 MUI 输出 display:none 隐藏其中一套，默认查询会把它过滤掉。
      // 本用例要验的是「身份未知时不渲染任何认证入口」，与当前视口宽度无关，故按存在性断言。
      const q = { hidden: true } as const;
      expect(screen.queryAllByRole("button", { name: "common:action.signIn", ...q })).toHaveLength(
        0,
      );
      expect(screen.queryByRole("button", { name: "account of current user", ...q })).toBeNull();
      expect(screen.queryByRole("button", { name: "show more", ...q })).toBeNull();

      auth.loading = false;
      view.rerender(<AppBar />);
      if (authenticated) {
        expect(screen.getByRole("button", { name: "account of current user", ...q })).toBeTruthy();
        expect(screen.getByRole("button", { name: "show more", ...q })).toBeTruthy();
      } else {
        expect(screen.getAllByRole("button", { name: "common:action.signIn", ...q })).toHaveLength(
          2,
        );
      }
    },
  );
});
