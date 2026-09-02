/**
 * §四.2 关键页 axe 无障碍断言（docs/frontend/accessibility.md）。
 *
 * 形态：jsdom + 真路由（routeTree.gen + 内存 history）+ createRouterTransport
 * 内存服务桩。整页渲染（含 __root 的 AppBar/Footer 全局镶边）后对 document.body
 * 跑 axe-core，断言零违规——portal（Dialog/Snackbar）也在 body 上，一并覆盖。
 *
 * 刻意取舍：
 *  - runOnly 限 WCAG A/AA 标签：landmark/region 这类 best-practice 规则不进门禁，
 *    与手册目标（WCAG 2.2 AA）对齐，避免开局告警海；
 *  - color-contrast 显式关闭：jsdom 无布局绘制，该规则测不了，对比度归
 *    Lighthouse（§四.3）；
 *  - 「axe 探测器自检」是常驻 canary：若断言链路静默失效（matcher 配错/axe 空跑），
 *    已知违规样本会立刻暴露——同 Vector VRL 脱敏「故意未脱敏样本必须被拦截」的纪律。
 *    canary 的违规 DOM 用 createElement 搭而不是 JSX，否则会撞上 §四.1 的
 *    jsx-a11y 静态门禁（两层门禁互不拆台，恰好证明它们抓的是不同层）。
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { createRouterTransport, type Transport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { initI18n } from "@ecommerce/i18n";

import { AddressService, CartService, CartStatus, ProductService, UserService } from "@/gen/api";
import { AuthProvider } from "@/providers/AuthProvider";
import { routeTree } from "@/routeTree.gen";
import consumerZh from "@/locales/zh-CN/consumer.json";
import consumerEn from "@/locales/en/consumer.json";

expect.extend(matchers);

// vitest 4 起自定义 matcher 的类型通过 `Matchers` 接口合并（官方文档做法）；
// vitest-axe 0.1.0 只增强旧版 Assertion 接口，类型跟不上运行时，这里本地补齐。
// 运行时实现由上面的 expect.extend(matchers) 提供。
declare module "vitest" {
  // 类型参数必须与 vitest 自身的 `Matchers<T = any>` 完全一致（TS2428），
  // 接口合并不允许缺省值不同。
  // oxlint-disable-next-line typescript/no-explicit-any
  interface Matchers<T = any> {
    toHaveNoViolations(): T;
  }
}

// —— 环境隔离 mock ——————————————————————————————————————————————
// devtools 只该在浏览器 DEV 挂载；jsdom 里是轴外噪音，掐掉。
vi.mock("@tanstack/react-devtools", () => ({ TanStackDevtools: () => null }));
vi.mock("@tanstack/react-router-devtools", () => ({
  TanStackRouterDevtoolsPanel: () => null,
}));
// AuthProvider 冷启动会 fetch /auth/me；jsdom 没有网关。默认判未登录；
// 个人中心/地址簿的 beforeLoad 靠它放行，那两页的用例把开关拨到 true。
// vi.mock 会被提升到文件顶部，所以开关必须用 vi.hoisted 声明才能在工厂里引用。
const authState = vi.hoisted(() => ({ authenticated: false }));
vi.mock("@ecommerce/configs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchIdentity: async () => ({ authenticated: authState.authenticated }),
}));
// useProductDetail 显式走 getPublicTransport()（公开接口免鉴权），不经
// TransportProvider——把两个出口都接到本文件的内存桩上。
vi.mock("@ecommerce/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPublicTransport: () => transport,
  getSharedTransport: () => transport,
}));
// t3-oss env 在 import 时校验；测试进程没有 VITE_ 环境变量。
vi.mock("@/env", () => ({ env: { VITE_GATEWAY_URL: "/api" } }));

// —— 服务桩数据 ——————————————————————————————————————————————————
const CART_ITEMS = [
  {
    cartItemId: 1n,
    spuId: 10n,
    skuId: 100n,
    merchantId: "m-1",
    shopName: "店铺一",
    spuName: "商品一",
    skuName: "规格一",
    unitPriceCents: 199000n,
    quantity: 2,
    selected: true,
    skuThumbnailUrl: "http://example.com/a.png",
    status: CartStatus.ACTIVE,
  },
];

const PRODUCT_DETAIL = {
  productDetail: {
    spuId: 10n,
    spuCode: "SPU-1",
    spuName: "纸灯一号",
    skus: [
      {
        skuId: 100n,
        merchantId: "m-1",
        skuName: "标准款",
        // attributes 必须给：详情页只有在 selectedAttrs 匹配到 SKU 时才渲染价格区
        // （见 $spuCode.tsx 的 currentPrice），缺了它价格分支永远走不到，
        // 这块区域会静默逃出 axe 与标题层级两道断言。
        attributes: { 规格: "标准款" },
        price: { units: 199n, nanos: 0 },
        thumbnailUrl: "http://example.com/a.png",
      },
    ],
  },
};

const ADDRESSES = {
  addresses: [
    {
      addressId: "addr-1",
      recipientName: "张三",
      isDefault: true,
      detail: { province: "广东省", city: "深圳市", district: "南山区", detail: "科技园 1 号" },
    },
  ],
};

let transport: Transport;

function makeTransport() {
  return createRouterTransport(({ service }) => {
    service(CartService, { getCart: () => ({ items: CART_ITEMS }) });
    service(ProductService, { getProductDetail: () => PRODUCT_DETAIL });
    service(AddressService, { listAddresses: () => ADDRESSES });
    // 个人中心没有 UserProfile 就只渲染一个 CircularProgress，页面主体根本不出现。
    service(UserService, {
      userProfile: () => ({ user: { name: "zhangsan", displayName: "张三", email: "z@x.com" } }),
    });
  });
}

// —— 脚手架 ————————————————————————————————————————————————————————
/** 与手册目标对齐的扫描配置；color-contrast 关闭原因见文件头注释。 */
function runAxe(node: Element) {
  return axe(node, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
    },
    rules: { "color-contrast": { enabled: false } },
  });
}

/** 整页挂载：真 routeTree + 内存 history，provider 层次照抄 bootstrap.tsx。 */
async function renderPage(path: string, ready: () => Promise<unknown>) {
  transport = makeTransport();
  // retry 关掉，失败立刻暴露而不是拖到超时
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: {
      auth: {
        isAuthenticated: authState.authenticated,
        setIsAuthenticated: () => {},
        login: () => {},
        logout: () => {},
      },
    },
    // jsdom 未实现 window.scrollTo，关掉滚动恢复防噪音
    scrollRestoration: false,
  });
  render(
    <TransportProvider transport={transport}>
      <QueryClientProvider client={client}>
        <AuthProvider router={router}>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </TransportProvider>,
  );
  // 等页面主内容真的渲染出来（服务桩数据已回）再扫，避免扫到骨架屏
  await ready();
  return runAxe(document.body);
}

beforeAll(async () => {
  await initI18n({ ns: "consumer", resources: { "zh-CN": consumerZh, en: consumerEn } });
});

afterEach(() => {
  authState.authenticated = false;
  cleanup();
  document.body.innerHTML = "";
});

// —— canary：axe 探测器自检 ————————————————————————————————————————
describe("axe 探测器自检（常驻 canary）", () => {
  it("已知违规样本必须被检出", async () => {
    // 用 createElement 搭违规 DOM：无 alt 的 img + 无标签的 input。
    // 不用 JSX 是为了不撞 jsx-a11y 静态门禁（见文件头注释）。
    const host = document.createElement("div");
    const input = document.createElement("input");
    input.type = "text";
    const img = document.createElement("img");
    img.src = "http://example.com/x.png";
    host.append(input, img);
    document.body.append(host);

    const results = await runAxe(host);
    const ids = results.violations.map((v) => v.id);
    expect(ids).toContain("image-alt");
    expect(ids).toContain("label");
  });
});

// —— 四个关键页 ————————————————————————————————————————————————————
describe("关键页 axe 零违规（WCAG A/AA，jsdom）", () => {
  it("首页 /", async () => {
    // 语言无关的就绪信号：首页 h1（i18n 默认语言可能是 en）。
    // hidden: true 必须给——PrivacyConsent 对话框默认打开，MUI Modal 会把应用
    // 根容器标成 aria-hidden，role 查询默认会排除整棵树。
    // 内层等待超时 < 用例超时：失败时 testing-library 会打印实际 DOM，可诊断。
    const results = await renderPage("/", () =>
      screen.findByRole("heading", { level: 1, hidden: true }, { timeout: 4000 }),
    );
    expect(results).toHaveNoViolations();
  }, 15000);

  it("商品详情 /product/$spuCode", async () => {
    const results = await renderPage("/product/SPU-1", () =>
      screen.findByText("纸灯一号", undefined, { timeout: 5000 }),
    );
    expect(results).toHaveNoViolations();
  });

  it("购物车 /cart", async () => {
    const results = await renderPage("/cart", () =>
      screen.findByText("店铺一", undefined, { timeout: 5000 }),
    );
    expect(results).toHaveNoViolations();
  });

  it("结算 /checkout", async () => {
    const results = await renderPage("/checkout", () =>
      screen.findByText("张三", undefined, { timeout: 5000 }),
    );
    expect(results).toHaveNoViolations();
  });
});

// —— 标题层级回归（docs/frontend/semantic-html.md §四.2）————————————————
//
// 为什么 axe 挡不住这个：`heading-order` 只查「相邻标题不跳级」，
// `page-has-heading-one` 属 best-practice 标签、不在本文件的 WCAG A/AA
// runOnly 范围内。而本轮修的两类真实缺陷恰好都能骗过 axe：
//   ①价格用 variant="h3" 渲染成 <h3>——它紧跟 <h1> 且自身是数值不是标题，
//     但因为 h1→h3 之间没有别的标题，axe 不判跳级；
//   ②页脚品牌字样渲染成 <h6> 出现在每一页，是与内容无关的噪音标题。
// 所以这里断言的是**大纲本身**（唯一 h1 + 不跳级），不是 axe 结果。
function outline(): number[] {
  return Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) =>
    Number(h.tagName[1]),
  );
}

describe("标题层级（唯一 h1 + 不跳级）", () => {
  it("canary：探测器能识破跳级与多 h1", () => {
    // 与 axe canary 同理：断言链路自身必须先被证明有效。
    document.body.innerHTML = "<h1>a</h1><h3>b</h3>";
    const levels = outline();
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    // h1→h3 跳级必须被下面这条规则判出来
    expect(levels.some((l, i) => i > 0 && l - levels[i - 1] > 1)).toBe(true);
  });

  const pages: Array<[string, string, () => Promise<unknown>]> = [
    [
      "首页",
      "/",
      () => screen.findByRole("heading", { level: 1, hidden: true }, { timeout: 4000 }),
    ],
    [
      "商品详情",
      "/product/SPU-1",
      () => screen.findByText("纸灯一号", undefined, { timeout: 5000 }),
    ],
    ["购物车", "/cart", () => screen.findByText("店铺一", undefined, { timeout: 5000 })],
    ["结算", "/checkout", () => screen.findByText("张三", undefined, { timeout: 5000 })],
  ];

  for (const [name, path, ready] of pages) {
    it(`${name} 恰好一个 h1 且层级不跳级`, async () => {
      await renderPage(path, ready);
      expectSaneOutline();
    }, 15000);
  }

  // 价格区要选中规格后才渲染（selectedAttrs 初始为空），不点这一下就测不到——
  // 价格此前是 variant="h3" 直接渲染成 <h3> 紧跟 <h1>，本轮红测正是靠它才变红。
  it("商品详情选中规格后：价格不进入标题树", async () => {
    await renderPage("/product/SPU-1", () =>
      screen.findByText("纸灯一号", undefined, { timeout: 5000 }),
    );
    // 规格选择器是 MUI Chip（渲染成 div 而非 button），按文本点。
    await userEvent.click(await screen.findByText("标准款"));
    await screen.findByText(/199/);
    expectSaneOutline();
  }, 15000);

  // 登录态页面：beforeLoad 靠 fetchIdentity 放行，主体靠 UserService 桩渲染。
  // 之前这两页没进断言，结果恰好是遗漏最多的地方——收件人姓名/电话曾渲染成 h6。
  it("个人中心 /profile（登录态）恰好一个 h1 且层级不跳级", async () => {
    authState.authenticated = true;
    await renderPage("/profile", () => screen.findByText("张三", undefined, { timeout: 5000 }));
    expectSaneOutline();
  }, 15000);

  it("地址簿 /profile/addresses（登录态）恰好一个 h1 且层级不跳级", async () => {
    authState.authenticated = true;
    await renderPage("/profile/addresses", () =>
      screen.findByText("张三", undefined, { timeout: 5000 }),
    );
    expectSaneOutline();
    // 收件人姓名是列表内容，不得出现在任何标题标签里
    const headingTexts = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) =>
      h.textContent?.trim(),
    );
    expect(headingTexts).not.toContain("张三");
  }, 15000);
});

function expectSaneOutline() {
  const levels = outline();
  expect(levels.filter((level) => level === 1)).toHaveLength(1);
  const jump = levels.findIndex((l, i) => i > 0 && l - levels[i - 1] > 1);
  expect(jump, `层级跳跃于 index ${jump}：${levels.join("→")}`).toBe(-1);
}
