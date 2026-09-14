// 由 control-tower 的 TestServiceHealthFirefoxContract 调用；仅连接测试内的本地网关。
// 不拦截健康响应：Firefox -> admin Vite /api 代理 -> BFF session -> h2c /healthz。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { firefox, expect } from "@playwright/test";

const gateway = process.env.HEALTH_E2E_GATEWAY;
const session = process.env.HEALTH_E2E_SESSION;
assert.ok(gateway && session, "Run through the control-tower Go contract test");
assert.equal(new URL(gateway).hostname, "127.0.0.1", "Test gateway must be local");

const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise((resolve, reject) =>
  reservation.close((error) => (error ? reject(error) : resolve())),
);
const baseURL = `http://127.0.0.1:${port}`;
const server = spawn(
  "pnpm",
  [
    "--filter",
    "@ecommerce/admin",
    "exec",
    "vp",
    "dev",
    "--mode",
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    cwd: process.cwd(),
    env: { ...process.env, GATEWAY_PROXY_TARGET: gateway, VITE_GATEWAY_URL: "/api" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  },
);
let serverLog = "";
for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", (chunk) => {
    serverLog = (serverLog + chunk.toString()).slice(-12000);
  });
}
let spawnError;
server.on("error", (error) => {
  spawnError = error;
});
let browser;
let closing;
function cleanup() {
  closing ??= (async () => {
    try {
      await browser?.close();
    } finally {
      if (server.pid) {
        try {
          if (process.platform === "win32") server.kill("SIGTERM");
          else process.kill(-server.pid, "SIGTERM");
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      }
    }
  })();
  return closing;
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(130));
  });
}
try {
  const deadline = Date.now() + 30000;
  while (true) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error(`Vite exited (${server.exitCode})`);
    if (Date.now() > deadline) throw new Error("Vite did not become ready");
    try {
      const response = await fetch(baseURL, { signal: AbortSignal.timeout(1000) });
      if (response.ok) break;
    } catch {
      /* server is still starting */
    }
    await delay(200);
  }
  browser = await firefox.launch();
  const context = await browser.newContext({
    locale: "zh-CN",
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies([
    { name: "ct-test-session", value: session, url: baseURL, httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  const pending = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/admin/health/services" && r.status() === 200,
  );
  await page.goto(`${baseURL}/monitor`, { waitUntil: "domcontentloaded" });
  const response = await pending;
  const snapshot = await response.json();
  assert.deepEqual(
    snapshot.services.map((item) => [item.name, item.status]),
    [
      ["order", "healthy"],
      ["payment", "degraded"],
    ],
  );
  assert.ok(!JSON.stringify(snapshot).includes("private dependency"));
  const cards = page.locator('[data-copilot="monitor.health-card"]');
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: "order" }).locator('[data-monitor="status"]')).toHaveText(
    "健康",
  );
  await expect(cards.filter({ hasText: "payment" }).locator('[data-monitor="status"]')).toHaveText(
    "降级",
  );
  await expect(page.locator("body")).not.toContainText("未接入");
  console.log(
    "PASS Firefox -> admin same-origin proxy -> authenticated gateway -> h2c probes (healthy + degraded)",
  );
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  await cleanup();
}
