// 本地 UI 回归：只允许 loopback，RPC/auth 全部由内存 fixture 拦截，不访问共享后端。
// 先以 GATEWAY_PROXY_TARGET=http://127.0.0.1:9 VITE_GATEWAY_URL=/api 启动 consumer dev。
// node e2e/hotspots.smoke.mjs；截图存 E2E_ARTIFACT_DIR（默认 /tmp/consumer-hotspots）。
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.SHOP_URL || "http://127.0.0.1:3000";
assert.equal(
  new URL(base).hostname,
  "127.0.0.1",
  "only explicitly owned loopback preview is allowed",
);
const artifacts = process.env.E2E_ARTIFACT_DIR || "/tmp/consumer-hotspots";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [320, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "zh-CN" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    let failSave = true;
    let created = 0;
    let addresses = [
      {
        addressId: "00000000-0000-4000-8000-000000000001",
        recipientName: "张三",
        recipientPhone: "123456",
        isDefault: true,
        detail: { province: "海南省", city: "琼海市", district: "", detail: "一号街" },
      },
    ];
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin) return route.abort();
      const json = (body, status = 200) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname.startsWith("/auth/"))
        return json({ authenticated: true, name: "fixture-user", roles: [] });
      if (!url.pathname.startsWith("/api/")) return route.continue();
      const method = url.pathname.split("/").at(-1);
      const input = request.postDataJSON() || {};
      if (method === "GetCart")
        return json({
          items: [
            {
              cartItemId: "1",
              spuId: "1",
              skuId: "1",
              merchantId: "m-1",
              shopName: "测试店",
              spuName: "纸灯",
              skuName: "小号",
              unitPriceCents: "1200",
              quantity: 1,
              selected: true,
            },
          ],
        });
      if (method === "UserProfile")
        return json({ user: { id: "fixture-user", name: "fixture-user", displayName: "张三" } });
      if (method === "ListAddresses") return json({ addresses });
      if (method === "ListRegions")
        return json({
          regions: !input.parentId
            ? [{ id: 1, name: "海南省" }]
            : input.parentId === 1
              ? [{ id: 2, name: "琼海市" }]
              : [],
        });
      if (method === "CreateAddress" || method === "UpdateAddress") {
        if (failSave) return json({ code: "unavailable", message: "测试保存失败" }, 503);
        if (method === "UpdateAddress") return json({});
        assert.equal(input.detail.district || "", "");
        assert.equal("userId" in input, false);
        const addressId = "00000000-0000-4000-8000-000000000002";
        created++;
        addresses = [...addresses, { ...input, addressId }];
        return json({ addressId });
      }
      if (method === "DeleteAddress") {
        addresses = addresses.filter((a) => a.addressId !== input.addressId);
        return json({});
      }
      if (method === "SetDefaultAddress") return json({});
      if (method === "CreateOrder") throw new Error("browser fixture must not submit an order");
      return json({});
    });
    await page.goto(`${base}/checkout`);
    const reject = page.getByRole("button", { name: "拒绝所有" });
    await reject.waitFor({ state: "visible" });
    await reject.click();
    await page.getByRole("heading", { name: "确认订单" }).waitFor();
    await page.getByRole("button", { name: /张三/ }).click();
    await page.getByRole("radio", { name: /张三/ }).waitFor();
    await page.getByRole("button", { name: "添加新地址" }).click();
    await page.getByRole("textbox", { name: "收件人", exact: true }).fill("李四");
    await page.getByRole("textbox", { name: "手机号码", exact: true }).fill("123456");
    await page.getByRole("combobox", { name: "省份" }).click();
    await page.getByRole("option", { name: "海南省" }).click();
    await page.getByRole("combobox", { name: "城市" }).click();
    await page.getByRole("option", { name: "琼海市" }).click();
    await page.getByText("该市下无区/县").waitFor();
    await page.getByRole("textbox", { name: "详细地址" }).fill("二号街");
    await page.getByRole("button", { name: "保存地址" }).click();
    await page.getByText(/测试保存失败/).waitFor();
    assert.equal(
      await page.getByRole("textbox", { name: "收件人", exact: true }).inputValue(),
      "李四",
    );
    assert.equal(
      await page.getByRole("button", { name: "保存地址" }).evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return target === button || button.contains(target);
      }),
      true,
      "save button must not be obscured by a floating assistant",
    );
    await page.screenshot({ path: `${artifacts}/checkout-failure-${width}.png`, fullPage: true });
    failSave = false;
    await page.getByRole("button", { name: "保存地址" }).click();
    await page.getByRole("button", { name: /李四/ }).waitFor();
    assert.equal(created, 1);
    assert.equal(
      await page.getByRole("button", { name: "提交订单", exact: true }).isEnabled(),
      true,
    );
    await page.screenshot({ path: `${artifacts}/checkout-${width}.png`, fullPage: true });
    await page.goto(`${base}/profile/addresses`);
    await page.getByRole("heading", { name: /地址管理/ }).waitFor();
    await page.getByRole("button", { name: "编辑地址", exact: true }).first().click();
    const editor = page.getByRole("dialog", { name: "编辑地址" });
    await editor.getByText("该市下无区/县").waitFor();
    await editor.getByRole("textbox", { name: "详细地址" }).fill("修改后门牌");
    failSave = true;
    await editor.getByRole("button", { name: "保存", exact: true }).click();
    await editor.getByText(/测试保存失败/).waitFor();
    assert.equal(
      await editor.getByRole("textbox", { name: "详细地址" }).inputValue(),
      "修改后门牌",
    );
    await page.screenshot({
      path: `${artifacts}/addresses-edit-failure-${width}.png`,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await editor.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "删除", exact: true }).first().click();
    const confirmation = page.getByRole("dialog", { name: "删除地址" });
    await confirmation.waitFor();
    assert.equal(addresses.length, 2, "opening confirmation must not delete");
    await confirmation.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(addresses.length, 2);
    await page.getByRole("button", { name: "删除", exact: true }).first().click();
    await confirmation.getByRole("button", { name: "删除", exact: true }).click();
    await confirmation.waitFor({ state: "hidden" });
    assert.equal(addresses.length, 1);
    await page.screenshot({ path: `${artifacts}/addresses-${width}.png`, fullPage: true });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      "no horizontal overflow",
    );
    // loggerInterceptor 把 StrictMode 请求取消也记为 error；只排除明确的取消和注入拒绝。
    const expectedLog = (message) =>
      message.includes("503") ||
      (message.includes("[RPC Error]") &&
        ((message.includes("Code: 1\n") && message.includes("signal is aborted without reason")) ||
          (message.includes("Code: 14\n") && message.includes("测试保存失败"))));
    assert.deepEqual(
      errors.filter((message) => !expectedLog(message)),
      [],
    );
    console.log(
      `PASS ${width}px: real dialog, terminal-city create, failed-input preservation, automatic selection, address page`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
