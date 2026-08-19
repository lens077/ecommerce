// 登录链路的线上冒烟测试（对着**真实部署**跑，默认 shop.apikv.com）。
//
// 为什么值得有这么一个测试：本轮修掉的 5 个问题（CSP 缺 font-src/img-src、
// frame-src 少 'self'、X-Frame-Options: DENY 挡死静默续期、顶栏用非订阅式的
// isLoggedIn）**没有一个是单测能发现的** —— 它们要么在响应头里，要么只在
// 「真浏览器 + 真 Casdoor + 真跨源」的组合下才显形。单测全绿、页面看着也正常，
// 但登录态是坏的。所以这条链路的回归只能靠端到端。
//
// 为什么用 Playwright 而不是 WebBridge/Kitesurf：它发的是 CDP 层的**可信输入**
// （isTrusted=true），React 的 onClick 才会真正触发；那两个工具的合成事件在这个站点
// 上点不动登录按钮，也换不动 Casdoor 的 tab。
//
// 用法：
//   CASDOOR_USER=xxx CASDOOR_PASS=yyy node apps/consumer/e2e/login.smoke.mjs [--headed]
//   SHOP_URL / CASDOOR_URL 可覆盖目标环境。
//
// ⚠️ 判据一律用 **origin** 比较，不要拿正则去匹配整个 URL。
//    授权 URL 里带 `redirect_uri=https%3A%2F%2Fshop.apikv.com%2Fcallback`，
//    `waitForURL(/shop\.apikv\.com/)` 会被这个查询参数骗过去，于是"还停在 Casdoor"
//    被误报成"已回跳成功"，后面所有断言跟着变成假绿（第一版实测踩过）。
import { chromium } from "playwright";

const USER = process.env.CASDOOR_USER;
const PASS = process.env.CASDOOR_PASS;
const HEADED = process.argv.includes("--headed");
const SHOP = (process.env.SHOP_URL || "https://shop.apikv.com").replace(/\/$/, "");
const CASDOOR = (process.env.CASDOOR_URL || "https://casdoor.apikv.com").replace(/\/$/, "");
const ARTIFACT_DIR = process.env.E2E_ARTIFACT_DIR || "/tmp";

if (!USER || !PASS) {
  console.error("需要 CASDOOR_USER / CASDOOR_PASS 环境变量");
  process.exit(2);
}

const originOf = (u) => new URL(u).origin;

const results = [];
const ok = (m) => {
  results.push(["✓", m]);
  console.log("✓", m);
};
const bad = (m) => {
  results.push(["✗", m]);
  console.error("✗", m);
  process.exitCode = 1;
};
const assert = (cond, good, fail) => (cond ? ok(good) : bad(fail));
const info = (m) => console.log("·", m);

/** 顶栏是否还在显示登录入口。是判定登录态最贴近用户的信号。 */
const readsAsLoggedOut = (page) =>
  page.evaluate(() =>
    /SIGN ?IN|登录/i.test(
      (document.querySelector("header,nav,[role=banner]") || document.body).innerText,
    ),
  );

/** 顶栏里有没有渲染出头像 <img>。用户没设头像时本来就没有，所以只做**前后对比**，
 *  不做绝对断言 —— 否则没头像的账号会误报。 */
const headerAvatarSrc = (page) =>
  page.evaluate(() => document.querySelector("header img, [role=banner] img")?.src || "");

const browser = await chromium.launch({ headless: !HEADED });
const context = await browser.newContext();
const page = await context.newPage();

const cspViolations = [];
const consoleErrors = [];
const netCalls = [];
page.on("console", (m) => {
  const t = m.text();
  if (/violates the following Content Security Policy/i.test(t)) {
    // 只留指令名，base64 字体能把整屏刷爆
    const matched = t.match(/directive: "([^"]+)"/);
    cspViolations.push(matched ? matched[1] : t.slice(0, 80));
    if (/frame-src|img-src/.test(t)) console.log("  ⚠ CSP:", t.slice(0, 220));
  } else if (m.type() === "error") {
    consoleErrors.push(t.slice(0, 160));
  }
});
// 抓 token 端点的响应体 —— 兑换失败时这是唯一能看到原因的地方
page.on("response", async (r) => {
  if (r.url().includes("/api/login/oauth/access_token")) {
    const body = await r.text().catch(() => "(读不到)");
    console.log(`\n>>> token 端点 HTTP ${r.status()}: ${body.slice(0, 400)}\n`);
  }
});
page.on("request", (r) => {
  const u = r.url();
  if (u.startsWith(CASDOOR) || u.includes("gateway.apikv.com")) {
    netCalls.push(`${r.method()} ${u.replace(/\?.*/, "")}`);
  }
});

try {
  // 1) 首页
  await page.goto(`${SHOP}/`, { waitUntil: "networkidle", timeout: 45000 });
  info(`首页: ${await page.title()}`);

  // 2) 点登录 → 应整页跳到 Casdoor
  await page
    .getByRole("button", { name: /登录|登陆|SIGN ?IN|Sign ?in/i })
    .or(page.getByRole("link", { name: /登录|登陆|SIGN ?IN|Sign ?in/i }))
    .first()
    .click({ timeout: 15000 });
  await page.waitForFunction((c) => location.origin === c, CASDOOR, { timeout: 30000 });
  ok("点登录后跳到了 Casdoor");

  // 3) PKCE 参数断言
  const q = new URL(page.url()).searchParams;
  assert(
    q.get("code_challenge_method") === "S256",
    `PKCE: S256 + ${(q.get("code_challenge") || "").slice(0, 10)}…`,
    `code_challenge_method=${q.get("code_challenge_method")}，期望 S256`,
  );
  assert(
    !q.get("client_secret"),
    "授权 URL 无 client_secret",
    "授权 URL 里出现 client_secret（公开客户端绝不该有）",
  );
  assert(
    (q.get("redirect_uri") || "").startsWith(`${SHOP}/callback`),
    `redirect_uri = ${q.get("redirect_uri")}`,
    `redirect_uri = ${q.get("redirect_uri")}`,
  );

  // 4) 填表登录。Casdoor 的表单是 antd 渲染的，用 id 最稳。
  await page.waitForSelector("#input, input#username, input[name='username']", { timeout: 20000 });
  await page.locator("#input, input#username, input[name='username']").first().fill(USER);
  await page
    .locator("#normal_login_password, input#password, input[type='password']")
    .first()
    .fill(PASS);
  await page
    .getByRole("button", { name: /登录|Sign ?In|Login/i })
    .first()
    .click();

  // 5) 回跳到 shop（用 origin 判断！）
  await page.waitForFunction((s) => location.origin === s, SHOP, { timeout: 45000 });
  ok(`回跳到 shop: ${page.url().replace(/\?.*/, "")}`);

  // 6) 等 callback 兑换完成
  await page.waitForTimeout(4000);

  // 7) 核心断言：令牌与用户资料都不落盘
  const stored = await page.evaluate(() => ({
    lsKeys: Object.keys(localStorage),
    ssKeys: Object.keys(sessionStorage),
    lsToken: localStorage.getItem("token"),
    lsUser: localStorage.getItem("user"),
    body: document.body.innerText.slice(0, 100).replace(/\n+/g, " | "),
  }));
  info(`localStorage keys: ${JSON.stringify(stored.lsKeys)}`);
  info(`sessionStorage keys: ${JSON.stringify(stored.ssKeys)}`);
  info(`页面: ${stored.body}`);
  assert(
    !stored.lsToken,
    "localStorage 无 token",
    `token 落进 localStorage: ${(stored.lsToken || "").slice(0, 16)}…`,
  );
  // 资料改为从 JWT 派生（见 src/store/users.ts）。它曾是 PII 长期留盘 +
  // 可被本地篡改的 userId 来源，删掉之后这里必须保持为空。
  assert(
    !stored.lsUser,
    "localStorage 无 user（资料改从 JWT 派生）",
    `用户资料回落到 localStorage: ${(stored.lsUser || "").slice(0, 80)}…`,
  );

  // 8) UI 判据：顶栏不再是登录按钮
  const avatarBefore = await headerAvatarSrc(page);
  assert(!(await readsAsLoggedOut(page)), "UI 显示已登录（顶栏不再是登录按钮）", "UI 仍显示未登录");
  info(`顶栏头像: ${avatarBefore || "（该账号没有头像，跳过刷新后对比）"}`);

  // 9) 刷新 → 静默续期应保住登录态，且资料要能从新令牌重新解出来
  const renewCalls = [];
  page.on("framenavigated", (f) => {
    if (f !== page.mainFrame()) renewCalls.push(f.url().slice(0, 110));
  });
  await page.reload({ waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(6000);
  console.log(
    "  iframe 导航过:",
    renewCalls.length ? renewCalls : "（一个都没有 —— 静默续期根本没发起）",
  );

  assert(
    originOf(page.url()) === SHOP,
    "刷新后仍在站内（没被踢去 Casdoor）",
    `刷新后到了 ${page.url()}`,
  );
  assert(
    !(await readsAsLoggedOut(page)),
    "刷新后登录态保住了 —— 静默续期生效",
    "刷新后回到未登录 —— 静默续期没生效",
  );
  // 资料不再落盘之后，刷新后头像还在 == 续期产生的新令牌被正确解成了资料。
  // 这一条正是删 localStorage.user 时最容易悄悄弄坏的地方。
  if (avatarBefore) {
    assert(
      (await headerAvatarSrc(page)) === avatarBefore,
      "刷新后用户资料仍在（已从新令牌重新派生）",
      "刷新后头像没了 —— 资料没能从令牌重新派生",
    );
  }
  assert(
    !(await page.evaluate(() => localStorage.getItem("user"))),
    "刷新后 localStorage 仍无 user",
    "刷新后用户资料被写回了 localStorage",
  );

  // 10) CSP 必须干净。前面 5 个问题里有 3 个就是靠这一条抓出来的。
  assert(cspViolations.length === 0, "全程无 CSP 违规", `出现 ${cspViolations.length} 条 CSP 违规`);
} catch (e) {
  bad(`流程中断: ${e.message.split("\n")[0]}`);
  const shot = `${ARTIFACT_DIR}/e2e-fail.png`;
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  console.error("  截图:", shot, " 当前 URL:", page.url().slice(0, 120));
} finally {
  console.log("\n--- 汇总 ---");
  console.log(
    `${results.filter((r) => r[0] === "✓").length} 过 / ${results.filter((r) => r[0] === "✗").length} 挂`,
  );
  const cspCount = cspViolations.reduce((a, d) => ((a[d] = (a[d] || 0) + 1), a), {});
  console.log("CSP 违规:", Object.keys(cspCount).length ? cspCount : "无");
  console.log("控制台错误:", consoleErrors.length ? consoleErrors.slice(0, 6) : "无");
  console.log("Casdoor/网关调用:", [...new Set(netCalls)].slice(0, 14));
  await browser.close();
}
