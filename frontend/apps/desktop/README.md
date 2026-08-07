# @ecommerce/desktop

consumer / merchant 等前端应用共用的 Tauri 2 桌面外壳。

这里**不放前端代码** —— 窗口加载的是 `apps/{consumer,merchant}` 的 dev server 或 `dist` 产物。
一份 Rust crate（`src-tauri/`）+ 三份配置覆盖层，产出三个独立的桌面 App：

| 命令                                   | 加载的应用            | dev 端口 | bundle identifier        |
| -------------------------------------- | --------------------- | -------- | ------------------------ |
| `pnpm dev:consumer` / `build:consumer` | `@ecommerce/consumer` | 3000     | `com.ecommerce.consumer` |
| `pnpm dev:merchant` / `build:merchant` | `@ecommerce/merchant` | 3002     | `com.ecommerce.merchant` |

`src-tauri/tauri.conf.json` 是公共层，`tauri.<product>.conf.json` 只覆盖
`productName / identifier / build / 窗口`。

## 前置条件

Rust 工具链需要在 PATH 上。非交互 shell 默认读不到 `~/.cargo/bin`：

```bash
source "$HOME/.cargo/env"
```

## 常用操作

```bash
# 起桌面端（会自动拉起对应 app 的 vite dev server）
pnpm --filter @ecommerce/desktop dev:consumer

# 出包，产物在 src-tauri/target/release/bundle/
pnpm --filter @ecommerce/desktop build:consumer

# 按项目 logo 重新生成整套图标
pnpm --filter @ecommerce/desktop icon path/to/logo.png
```

## 桌面端特有行为

- **网关地址运行时可配**：默认 `http://localhost:8080`，存在 plugin-store 的 `settings.json`，
  在应用内按 `Cmd/Ctrl + ,` 打开设置修改，重启窗口生效。见 `packages/tauri`。
- **HTTP 请求走 Rust 侧**（`@tauri-apps/plugin-http`），不经过 webview 的 fetch，
  因此不受网关 CORS 白名单限制。
- **Casdoor 登录**走独立子窗口（label `auth`），`src-tauri/src/lib.rs` 的
  `open_login_window` 拦截到回调地址后把 `code/state` 广播给主窗口。

## CSP

`tauri.conf.json` 的 `app.security` 里两条策略，生产收紧、dev 放宽：

- `csp` —— 只在 `tauri build` 的产物里生效。
- `devCsp` —— 只在 `tauri dev` 生效；没配的话会回落到 `csp`（见 `tauri::manager::AppManager::csp`）。

生产策略的几个要点：

- `script-src 'self'`，**不开 `unsafe-inline` / `unsafe-eval`**。三个 app 的 `dist/index.html`
  里没有任何内联 `<script>`，chunk 全是同源的 `/assets/*.js`，所以够用。
  改动 index.html 时别塞内联脚本，塞了就得改这里。
- `style-src` 必须留 `'unsafe-inline'`：emotion 运行时往 `<head>` 插 `<style>`，
  MUI 的 Popper/Modal 和 React 的 `style={{}}` 又都走行内 style 属性，两者都归它管。
- `connect-src` **不需要写网关地址** —— 业务请求走 plugin-http，在 Rust 侧发出去，
  webview 这边只剩 Tauri 自己的 IPC（macOS/Linux 是 `ipc://localhost`，Windows 是
  `http://ipc.localhost`，两个都列上以便跨平台）。
- `font-src` 里那条 `https://cos.ap-guangzhou.myqcloud.com` 是 `apps/consumer/index.html`
  遗留的 FiraCodeNF 预加载（连同一整段 "edu-system" 的 meta 都是从别的项目抄来的）。
  哪天把那段清掉，这条也能一起删。
- `img-src` 放开了 `http:` / `https:`：商品图和 Casdoor 头像的域名不可控。
  图片不是脚本执行面，在 `script-src 'self'` 已经堵死注入的前提下，这个放宽是划算的。

登录子窗口加载的是 Casdoor 的远程页面，走对方服务器自己的响应头，不受这里影响
（Tauri 只在 asset 协议返回自带资源时注入 CSP）。

### 怎么验

`tauri dev` 默认用 `devUrl` 指向 vite，页面由 vite 直接提供，Tauri 根本没机会注入 CSP。
要在 debug 下验生产策略，得让它走内嵌资源：临时写一份覆盖层把 `devUrl` /
`beforeDevCommand` 置 `null`、`frontendDist` 指向 `dist`、`devCsp` 填成生产的 `csp`，
然后

```bash
pnpm exec tauri dev --no-dev-server --no-watch --config src-tauri/<临时配置>.json
```

页面里挂一个 `document.addEventListener("securitypolicyviolation", ...)` 就能把违规项全捞出来。

## 排查

- **请求返回 502，但网关明明没起 / 起在本机**：plugin-http 底层的 reqwest 会读 macOS 系统代理，
  且不理会「绕过 localhost」的例外表。开着 Clash 之类的代理时，发往 `localhost:8080` 的请求
  会先进代理，代理连不上就回 502。webview 自己的 fetch 遵守例外表，所以浏览器里看不到这个现象。
