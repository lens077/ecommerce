import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const requireFromConsumer = createRequire(new URL("../../consumer/package.json", import.meta.url));
const { chromium } = requireFromConsumer("playwright");
const appOrigin = "http://127.0.0.1:3004";
const gatewayOrigin = "http://127.0.0.1:4010";
const children = [];
const logs = [];

try {
  children.push(start(process.execPath, ["scripts/mock-gateway.mjs"], "gateway"));
  await waitFor(`${gatewayOrigin}/__stats`);
  children.push(
    start("pnpm", ["start"], "next", {
      CONSUMER_NEXT_GATEWAY_URL: gatewayOrigin,
      CONSUMER_NEXT_PUBLIC_URL: appOrigin,
      NEXT_TELEMETRY_DISABLED: "1",
    }),
  );
  await waitFor(`${appOrigin}/`);
  await fetch(`${gatewayOrigin}/__reset`, { method: "POST" });

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies([{ name: "poc", value: "CLIENT_ONLY", url: appOrigin }]);
    const page = await context.newPage();
    const rpcScopes = [];
    const pageErrors = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/product.v1.ProductService/GetProductDetail")) {
        rpcScopes.push(request.headers()["x-consumer-next-scope"] ?? "unscoped");
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const spuCode = `poc-personalized-${process.pid}`;
    await page.goto(`${appOrigin}/zh/product/${spuCode}`, { waitUntil: "networkidle" });
    await page.waitForSelector("html[data-consumer-next-hydrated=true]");
    await page.waitForSelector("[data-personalized-state=success]");

    const result = {
      browserRpcScopes: rpcScopes,
      hydrated: await page.locator("html").getAttribute("data-consumer-next-hydrated"),
      pageErrors,
      personalizedText: await page.locator(".personalized").textContent(),
      publicHeading: await page.locator("h1").textContent(),
    };
    const stats = await readStats();

    assert.deepEqual(result.browserRpcScopes, ["personalized-client"]);
    assert.equal(result.hydrated, "true");
    assert.deepEqual(result.pageErrors, []);
    assert.match(result.publicHeading ?? "", /POC cookie none/);
    assert.match(result.personalizedText ?? "", /POC cookie CLIENT_ONLY/);
    assert.deepEqual(
      stats.requests.map(({ marker, scope }) => ({ marker, scope })),
      [
        { marker: "none", scope: "public-ssr" },
        { marker: "CLIENT_ONLY", scope: "personalized-client" },
      ],
    );

    console.log(JSON.stringify({ ...result, gatewayRequests: stats.requests }, null, 2));
  } finally {
    await browser.close();
  }
} catch (error) {
  console.error(error);
  console.error(logs.slice(-40).join("\n"));
  process.exitCode = 1;
} finally {
  for (const child of children.reverse()) {
    stop(child);
  }
}

function start(command, args, label, extraEnvironment = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnvironment },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      for (const line of chunk.trim().split("\n")) {
        if (line) logs.push(`[${label}] ${line}`);
      }
    });
  }
  return child;
}

function stop(child) {
  if (!child.pid || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") {
      child.kill("SIGTERM");
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

async function waitFor(url) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function readStats() {
  const response = await fetch(`${gatewayOrigin}/__stats`);
  assert.equal(response.status, 200);
  return response.json();
}
