/**
 * 三条演示链路（docs/design/copilot/copilot.md §五）+ 未命中 + Esc 中断。
 * 断言的是用户能看到的东西：输入框里的字、筛选器上的文案、URL、卡片数量、面板回复。
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const CONSUMER = "http://localhost:3000";
const MERCHANT = "http://localhost:3002";
const ADMIN = "http://localhost:3003";

const ui = (name: string) => `[data-copilot-ui="${name}"]`;
const anchor = (name: string) => `[data-copilot="${name}"]`;
const lastReply = (page: Page) => page.locator(`${ui("message")}[data-from="assistant"]`).last();

/** 打开面板并发送一句话 */
async function ask(page: Page, text: string) {
  // 面板关着就先打开；isVisible 不等待，所以用 or() 让 Playwright 等到二者之一出现
  const fabOrInput = page.locator(ui("fab")).or(page.locator(ui("input")));
  await fabOrInput.first().waitFor();
  const fab = page.locator(ui("fab"));
  if (await fab.isVisible()) await fab.click();
  await page.locator(ui("input")).fill(text);
  await page.locator(ui("send")).click();
}

/**
 * 网关不可达：网关请求快速失败成 Connect 错误，页面按空数据/匿名渲染。
 * consumer 走同源 /api 代理；merchant/admin 直连 VITE_API_URL（localhost:8080）。
 * ⚠️ 不能用「双星 api 双星」这种 glob：它也会命中 vite 给 `@ecommerce/api` 源码的 URL，把应用本身打挂。
 */
async function stubGateway(page: Page) {
  await page.route(
    (url) => url.pathname.startsWith("/api/") || url.port === "8080",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "unavailable", message: "e2e: gateway stubbed" }),
      }),
  );
}

const PRODUCTS = [
  {
    id: 1,
    spuCode: "SPU-THERMOS-1",
    price: 99,
    status: "online",
    mainMediaUrl: "https://example.com/1.png",
    quantity: 12,
    name: "保温杯 500ml 竹纹",
  },
  {
    id: 2,
    spuCode: "SPU-THERMOS-2",
    price: 129,
    status: "online",
    mainMediaUrl: "https://example.com/2.png",
    quantity: 3,
    name: "保温杯 750ml 朱砂",
  },
];

test.describe("用户：帮我查某某商品", () => {
  test("在搜索框逐字输入、回车搜索，面板列出结果", async ({ page }) => {
    await stubGateway(page);
    const seen: string[] = [];
    await page.route("**/search.v1.SearchService/Search", (route: Route) => {
      seen.push((route.request().postDataJSON() as { name: string }).name);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ products: PRODUCTS }),
      });
    });
    await page.goto(CONSUMER);
    await ask(page, "帮我查保温杯");

    // 视觉层：蒙层 + 渐变描边 + 大指针都在
    await expect(page.locator(ui("overlay"))).toBeVisible();
    await expect(page.locator(ui("frame"))).toBeVisible();
    await expect(page.locator(ui("cursor"))).toBeVisible();

    await expect(page.locator(anchor("appbar.search-input"))).toHaveValue("保温杯");
    await expect(page.locator(anchor("appbar.search-result-item"))).toHaveCount(2);
    await expect(page.locator(ui("ring"))).toBeVisible();
    await expect(lastReply(page)).toContainText("找到 2 件商品");
    await expect(lastReply(page)).toContainText("保温杯 500ml 竹纹");
    expect(seen).toEqual(["保温杯"]);
  });

  test("匿名访客也能看到面板并使用", async ({ page }) => {
    await stubGateway(page);
    await page.goto(CONSUMER);
    await expect(page.locator(ui("fab"))).toBeVisible();
    await page.locator(ui("fab")).click();
    await expect(page.locator(ui("panel"))).toBeVisible();
    // 未命中：列出可点的示例
    await ask(page, "你好");
    await expect(lastReply(page)).toContainText("我还不会这个");
    await expect(lastReply(page).locator(ui("example"))).toHaveCount(3);
  });

  test("界面模式关闭时只回复计划，不动页面", async ({ page }) => {
    await stubGateway(page);
    await page.goto(CONSUMER);
    await page.locator(ui("fab")).click();
    await page.locator(ui("ui-mode")).click();
    await ask(page, "帮我查保温杯");
    await expect(lastReply(page)).toContainText("界面模式已关闭");
    await expect(page.locator(anchor("appbar.search-input"))).toHaveValue("");
    await expect(page.locator(ui("overlay"))).toHaveCount(0);
  });
});

test.describe("商家：帮我查看没有发货的订单", () => {
  test("跳到订单页、切换筛选到待发货、报条数", async ({ page }) => {
    await stubGateway(page);
    await page.goto(MERCHANT);
    await ask(page, "帮我查看没有发货的订单");

    await expect(page).toHaveURL(/\/orders\/?$/);
    await expect(page.locator(anchor("orders.status-filter"))).toHaveText("待发货");
    await expect(page.locator(anchor("orders.row"))).toHaveCount(2);
    await expect(lastReply(page)).toContainText("共 2 笔待发货订单");
  });

  test("Esc 能在步骤之间停下", async ({ page }) => {
    await stubGateway(page);
    await page.goto(MERCHANT);
    await ask(page, "看看未发货订单");
    await expect(page.locator(ui("overlay"))).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(lastReply(page)).toHaveText("已停止。");
    await expect(page.locator(ui("overlay"))).toHaveCount(0);
    await expect(page.locator(ui("send"))).toBeVisible();
  });
});

test.describe("管理员：帮我查看监控", () => {
  test("跳到监控页并聚焦健康卡片", async ({ page }) => {
    await stubGateway(page);
    await page.goto(ADMIN);
    await ask(page, "帮我查看监控");

    await expect(page).toHaveURL(/\/monitor\/?$/);
    await expect(page.locator(anchor("monitor.health-card"))).toHaveCount(10);
    await expect(page.locator(ui("ring"))).toBeVisible();
    await expect(page.locator(ui("label"))).toHaveText("这里是各服务的健康状态");
    await expect(lastReply(page)).toContainText("共 10 个服务");
  });
});
