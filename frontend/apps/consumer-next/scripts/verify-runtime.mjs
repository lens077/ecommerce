import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const appOrigin = "http://127.0.0.1:3004";
const gatewayOrigin = "http://127.0.0.1:4010";
const children = [];
const logs = [];

try {
  const gateway = start(process.execPath, ["scripts/mock-gateway.mjs"], "gateway");
  children.push(gateway);
  await waitFor(`${gatewayOrigin}/__stats`);

  const next = start("pnpm", ["dev"], "next", {
    CONSUMER_NEXT_GATEWAY_URL: gatewayOrigin,
    CONSUMER_NEXT_PUBLIC_URL: appOrigin,
    NEXT_TELEMETRY_DISABLED: "1",
  });
  children.push(next);
  await waitFor(`${appOrigin}/`);

  // 2026-08-28 转正：POC 的 /product-cookie 对照路由已删除（结论已存档于
  // docs/reports/2026-08-28-nextjs-poc.md Q1/Q3a），本脚本只保留公开路由与 i18n 验证。
  await fetch(`${gatewayOrigin}/__reset`, { method: "POST" });
  const [zhHtml, enHtml] = await Promise.all([
    fetch(`${appOrigin}/zh/product/poc-i18n`).then((response) => response.text()),
    fetch(`${appOrigin}/en/product/poc-i18n`).then((response) => response.text()),
  ]);
  assert.match(zhHtml, /<html lang="zh"/);
  assert.match(enHtml, /<html lang="en"/);
  for (const html of [zhHtml, enHtml]) {
    assert.match(html, /hreflang="zh"/i);
    assert.match(html, /hreflang="en"/i);
    assert.match(html, /\/zh\/product\/poc-i18n/);
    assert.match(html, /\/en\/product\/poc-i18n/);
  }

  const publicStats = await readStats();
  console.log(
    JSON.stringify(
      {
        i18n: "pass",
        publicRpcScopes: [...new Set(publicStats.requests.map(({ scope }) => scope))],
        routes: ["/zh/product/poc-i18n", "/en/product/poc-i18n"],
      },
      null,
      2,
    ),
  );
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
