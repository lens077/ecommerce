import { expect, test } from "@playwright/test";
import {
  EMPTY_HEALTH_FIXTURE,
  HEALTH_FIXTURE,
  RECOVERY_HEALTH_FIXTURE,
  SERVICE_HEALTH_403,
  SERVICE_HEALTH_503,
  stubMonitorHealth,
} from "./fixtures/monitor";

const ADMIN = "http://localhost:3003";
const cards = '[data-monitor="health-card"]';
const refresh = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: /刷新|Refresh/ });

test.describe("管理员：健康端点响应夹具验收（非线上探测）", () => {
  test("动态服务、部分失败与空结果", async ({ page }, testInfo) => {
    const update = await stubMonitorHealth(page, { status: 200, body: HEALTH_FIXTURE });
    await page.goto(`${ADMIN}/monitor`);
    await expect(page.locator(cards)).toHaveCount(3);
    await expect(page.locator(cards).filter({ hasText: "user" })).toContainText("健康");
    await expect(page.locator(cards).filter({ hasText: "order" })).toContainText("降级");
    await expect(page.locator(cards).filter({ hasText: "payment" })).toContainText("不可用");
    await expect(page.locator('[data-monitor="checked-at"]').first()).toContainText("2026");
    await expect(page.locator(cards).first()).toHaveAccessibleName(/user.*健康/);
    if (process.env.E2E_SCREENSHOTS) {
      await page.screenshot({ path: testInfo.outputPath("monitor-desktop.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: testInfo.outputPath("monitor-mobile.png"), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    update({ status: 200, body: EMPTY_HEALTH_FIXTURE });
    await refresh(page).click();
    await expect(page.locator(cards)).toHaveCount(0);
    await expect(page.locator('[data-monitor="empty"]')).toBeVisible();
  });

  test("刷新失败保留原采样时间，恢复后展示新结果", async ({ page }) => {
    const update = await stubMonitorHealth(page, { status: 200, body: HEALTH_FIXTURE });
    await page.goto(`${ADMIN}/monitor`);
    await expect(page.locator(cards)).toHaveCount(3);
    const checkedAt = await page.locator('[data-monitor="checked-at"]').first().textContent();
    update(SERVICE_HEALTH_503);
    await refresh(page).click();
    await expect(page.locator('[data-monitor="stale"]')).toBeVisible();
    await expect(page.locator(cards)).toHaveCount(3);
    await expect(page.locator('[data-monitor="checked-at"]').first()).toHaveText(checkedAt ?? "");
    await expect(page.locator('[data-monitor="error"]')).toContainText("刷新失败");
    update({ status: 200, body: RECOVERY_HEALTH_FIXTURE });
    await refresh(page).click();
    await expect(page.locator(cards)).toHaveCount(1);
    await expect(page.locator(cards)).toContainText("catalog");
    await expect(page.locator('[data-monitor="stale"]')).toHaveCount(0);
  });

  test("403 清除旧快照，权限提示在重访后仍保留", async ({ page }) => {
    const update = await stubMonitorHealth(page, { status: 200, body: HEALTH_FIXTURE });
    await page.goto(`${ADMIN}/monitor`);
    await expect(page.locator(cards)).toHaveCount(3);
    update(SERVICE_HEALTH_403);
    await refresh(page).click();
    await expect(page.locator('[data-monitor="permission"]')).toBeVisible();
    await expect(page.locator(cards)).toHaveCount(0);
    await expect(page).toHaveURL(/\/monitor\/?$/);
    await page.reload();
    await expect(page.locator('[data-monitor="permission"]')).toBeVisible();
    await expect(refresh(page)).toBeEnabled();
    await expect(page.locator(cards)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("payment");
  });

  test("未登录与网关未升级不显示假健康", async ({ page }) => {
    const update = await stubMonitorHealth(page, { status: 401 });
    await page.goto(`${ADMIN}/monitor`);
    await expect(page.locator('[data-monitor="permission"]')).toBeVisible();
    await expect(page.locator(cards)).toHaveCount(0);
    update({ status: 404 });
    await refresh(page).click();
    await expect(page.locator('[data-monitor="permission"]')).toHaveCount(0);
    await expect(page.locator('[data-monitor="error"]')).toBeVisible();
    await expect(page.locator(cards)).toHaveCount(0);
  });

  test("窄屏监控不横向溢出且保留可用导航", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubMonitorHealth(page, { status: 200, body: HEALTH_FIXTURE });
    await page.goto(`${ADMIN}/monitor`);
    await expect(page.locator(cards)).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.getByRole("button", { name: "打开导航" }).click();
    await page.getByRole("button", { name: "监控", exact: true }).click();
    await expect(page.getByRole("button", { name: "打开导航" })).toBeVisible();
    await expect(page.getByRole("button", { name: "关闭导航" })).toHaveCount(0);
  });

  test("健康请求挂起时有客户端截止并允许重试", async ({ page }) => {
    await page.route(
      (url) => url.pathname === "/api/admin/health/services",
      async () => {
        await page.waitForEvent("close");
      },
    );
    await page.goto(`${ADMIN}/monitor`);
    await expect(page.locator('[data-monitor="loading"]')).toBeVisible();
    await expect(page.locator('[data-monitor="error"]')).toContainText("超时", { timeout: 12000 });
    await expect(refresh(page)).toBeEnabled();
    await expect(page.locator(cards)).toHaveCount(0);
  });
});
