// 把两张概念图的 HTML 源渲染成 PNG。用法：node docs/architecture/concept/render.mjs
// 为什么手写 HTML 而不用图像模型：这两张图的错误全在文字（编造的服务名、错误的组件定位），
// 图像模型重画密集中文标注会引入新错字；HTML 的每条文字都能对应到仓库或集群的事实来源。
// 依赖前端 workspace 里已安装的 playwright 与本机 ms-playwright 缓存的 Chromium，不额外下载。
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const pnpmDir = path.join(repo, 'frontend/node_modules/.pnpm');
const pw = fs.readdirSync(pnpmDir).find((d) => /^playwright@\d/.test(d));
if (!pw) throw new Error('frontend/node_modules 里找不到 playwright，先在 frontend 执行 pnpm install');
const { chromium } = createRequire(import.meta.url)(path.join(pnpmDir, pw, 'node_modules/playwright'));

const jobs = [
  { src: 'backend-detail.html', out: 'docs/architecture/ecommerce-backend-detail-concept.png', w: 1700, h: 860 },
  { src: 'runtime-preview.html', out: 'docs/architecture/ecommerce-runtime-concept-preview.png', w: 1540, h: 1030 },
];

const browser = await chromium.launch();
try {
  for (const j of jobs) {
    const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(path.join(here, j.src)).href);
    await page.evaluate(() => document.fonts.ready);
    // 内容超出画布说明版式溢出，直接失败而不是静默截掉。
    const { sw, sh } = await page.evaluate(() => ({ sw: document.body.scrollWidth, sh: document.body.scrollHeight }));
    if (sw > j.w + 1 || sh > j.h + 1) throw new Error(`${j.src} 内容溢出：${sw}x${sh} > ${j.w}x${j.h}`);
    await page.screenshot({ path: path.join(repo, j.out), clip: { x: 0, y: 0, width: j.w, height: j.h } });
    console.log(`rendered ${j.out}`);
    await page.close();
  }
} finally {
  await browser.close();
}
