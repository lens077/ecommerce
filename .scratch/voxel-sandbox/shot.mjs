// 沙盘截图脚本：无头 Chromium + SwiftShader 软件 WebGL。
// 用法：cd frontend && node ../.scratch/voxel-sandbox/shot.mjs ../docs/design/platform/voxel-construction-site-demo.html /tmp/voxel
import { chromium } from 'playwright';
import path from 'node:path';

const html = path.resolve(process.argv[2]);
const out = process.argv[3] || '/tmp/voxel';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
await page.goto('file://' + html, { waitUntil: 'load' });
await page.waitForTimeout(5000);
await page.screenshot({ path: `${out}-1-overview.png` });

// 场景：下单（C 级，已登录）→ 停在 order（inventory 为 planned）
await page.evaluate(() => window.__voxel.runScenario(window.__voxel.SCENARIOS[4]));
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}-2-order-scenario.png` });

// 剧本：node103 离线 + Dragonfly Session 不可达 → 网关 readyz 转红
await page.evaluate(() => { window.__voxel.PRESETS[1].apply(); window.__voxel.PRESETS[2].apply(); window.__voxel.refresh(); });
await page.keyboard.press('3');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}-3-faults-cluster.png` });

console.log(JSON.stringify({ errors, fps: await page.textContent('#fps') }, null, 2));
await browser.close();
