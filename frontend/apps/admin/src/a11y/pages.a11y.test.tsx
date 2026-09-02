/**
 * admin 关键页 a11y 断言：axe（WCAG A/AA）+ 标题大纲（唯一 h1 + 不跳级）。
 *
 * 形态照抄 consumer 的 `apps/consumer/src/a11y/pages.a11y.test.tsx`：jsdom + 真路由
 * （routeTree.gen + 内存 history）+ 整页渲染（含 __root 的侧栏）。两点不同：
 *  - 这里的页面全是静态假数据，没有 RPC，所以不需要 createRouterTransport 服务桩；
 *  - BffAuthProvider 靠 fetchIdentity 判登录态，mock 成已登录即可。
 *
 * 为什么要自己断言大纲而不只靠 axe：见 docs/frontend/semantic-html.md §四.2——
 * `page-has-heading-one` 属 best-practice 标签，不在 WCAG A/AA runOnly 内；
 * 「整页无 h1」「数值/品牌字样混进标题树」在 axe 下全绿。
 *
 * admin 的 /reports 没挂 ECharts（与 merchant 不同），可以一并纳入。
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { cleanup, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { createRouterTransport, type Transport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { BffAuthProvider } from "@ecommerce/ui";
import { initI18n } from "@ecommerce/i18n";

import { routeTree } from "@/routeTree.gen";
import adminZh from "@/locales/zh-CN/admin.json";
import adminEn from "@/locales/en/admin.json";

expect.extend(matchers);

// vitest 4 的 matcher 类型走 Matchers 接口合并；vitest-axe 0.1.0 只增强旧 Assertion，本地补齐。
declare module "vitest" {
  // oxlint-disable-next-line typescript/no-explicit-any
  interface Matchers<T = any> {
    toHaveNoViolations(): T;
  }
}

vi.mock("@ecommerce/configs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchIdentity: async () => ({ authenticated: true, roles: ["admin"], name: "测试管理员" }),
}));
vi.mock("@/env", () => ({ env: { VITE_GATEWAY_URL: "/api" } }));

const transport: Transport = createRouterTransport(() => {});

function runAxe(node: Element) {
  return axe(node, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    // jsdom 无布局绘制，对比度测不了，归 Lighthouse
    rules: { "color-contrast": { enabled: false } },
  });
}

async function renderPage(path: string, ready: () => Promise<unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    scrollRestoration: false,
  });
  render(
    <TransportProvider transport={transport}>
      <QueryClientProvider client={client}>
        <BffAuthProvider>
          <RouterProvider router={router} />
        </BffAuthProvider>
      </QueryClientProvider>
    </TransportProvider>,
  );
  await ready();
}

function outline(): number[] {
  return Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) =>
    Number(h.tagName[1]),
  );
}

function expectSaneOutline() {
  const levels = outline();
  expect(levels.filter((level) => level === 1)).toHaveLength(1);
  const jump = levels.findIndex((l, i) => i > 0 && l - levels[i - 1] > 1);
  expect(jump, `层级跳跃于 index ${jump}：${levels.join("→")}`).toBe(-1);
}

beforeAll(async () => {
  await initI18n({ ns: "admin", resources: { "zh-CN": adminZh, en: adminEn } });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("探测器自检（常驻 canary）", () => {
  it("axe：已知违规样本必须被检出", async () => {
    const host = document.createElement("div");
    const img = document.createElement("img");
    img.src = "http://example.com/x.png";
    host.append(img);
    document.body.append(host);
    const ids = (await runAxe(host)).violations.map((v) => v.id);
    expect(ids).toContain("image-alt");
  });

  it("大纲：跳级样本必须被判出", () => {
    document.body.innerHTML = "<h1>a</h1><h3>b</h3>";
    const levels = outline();
    expect(levels.some((l, i) => i > 0 && l - levels[i - 1] > 1)).toBe(true);
  });
});

// 就绪信号统一等 h1：i18n 默认语言可能是 en，不按中文文案等。
const readyByH1 = () => screen.findByRole("heading", { level: 1 }, { timeout: 5000 });

const PAGES: Array<[string, string]> = [
  ["工作台", "/"],
  ["商品", "/products"],
  ["订单", "/orders"],
  ["商家", "/merchants"],
  ["用户", "/users"],
  ["分类", "/categories"],
  ["报表", "/reports"],
  ["设置", "/settings"],
];

describe("关键页：axe 零违规 + 唯一 h1 + 不跳级", () => {
  for (const [name, path] of PAGES) {
    it(`${name} ${path}`, async () => {
      await renderPage(path, readyByH1);
      expect(await runAxe(document.body)).toHaveNoViolations();
      expectSaneOutline();
    }, 15000);
  }
});
