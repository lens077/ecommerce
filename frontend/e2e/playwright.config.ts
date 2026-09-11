/**
 * 智能助手（@ecommerce/copilot）的端到端测试。
 *
 * 为什么是 e2e 而不是 jsdom：助手的价值全在「真浏览器里的真事件」——受控 input 的原型 setter、
 * MUI Select 的 mousedown、TanStack 路由切换后的锚点等待、蒙层/指针的布局。jsdom 没有布局，
 * 单测只能证明事件派发链路，证明不了用户看到的东西。
 *
 * 三个 dev server 由本配置拉起（已在跑就复用）。后端不需要：网关代理指向一个必然拒绝的端口，
 * 业务 RPC 在测试里用 page.route 桩掉；登录态按匿名处理（fetchIdentity 网络失败即匿名）。
 *
 * 用法（frontend/ 目录）：
 *   pnpm e2e:copilot            # 无头
 *   pnpm e2e:copilot --headed   # 看着跑
 */
import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 让 vite 的 /api 代理立刻失败而不是等 DNS/超时：端口 9 是 discard，没人监听
const env = { ...process.env, GATEWAY_PROXY_TARGET: "http://127.0.0.1:9" };

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.e2e\.ts$/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  outputDir: path.join(root, "e2e", ".artifacts"),
  use: {
    ...devices["Desktop Chrome"],
    // 下载不到与 Playwright 版本配套的 Chromium 时，用 E2E_CHROMIUM 指到本机已有的可执行文件
    ...(process.env.E2E_CHROMIUM
      ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM } }
      : {}),
    locale: "zh-CN",
    trace: "retain-on-failure",
    video: process.env.E2E_VIDEO ? "on" : "off",
  },
  webServer: [
    {
      command: "pnpm --filter @ecommerce/consumer dev",
      url: "http://localhost:3000",
      cwd: root,
      env,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @ecommerce/merchant dev",
      url: "http://localhost:3002",
      cwd: root,
      env,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @ecommerce/admin dev",
      url: "http://localhost:3003",
      cwd: root,
      env,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
