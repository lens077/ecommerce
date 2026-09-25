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

      expect(screen.queryAllByRole("button", { name: "common:action.signIn" })).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "account of current user" })).toBeNull();
      expect(screen.queryByRole("button", { name: "show more" })).toBeNull();

      auth.loading = false;
      view.rerender(<AppBar />);
      if (authenticated) {
        expect(screen.getByRole("button", { name: "account of current user" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "show more" })).toBeTruthy();
      } else {
        expect(screen.getAllByRole("button", { name: "common:action.signIn" })).toHaveLength(2);
      }
    },
  );
});
