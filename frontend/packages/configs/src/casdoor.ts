import SDK from "casdoor-js-sdk";
export const CASDOOR_CONF = {
  // Casdoor 服务端地址。
  // ⚠️ 曾经写的是 `http://114.132.233.129:8000` —— 明文 HTTP + 裸 IP，而且那个端口
  //    在 casdoor 改由 Pangolin 以 HTTPS 暴露之后就关掉了（实测 connect timeout），
  //    等于前端登录跳转整条是坏的。走域名 + HTTPS，与后端/网关口径一致。
  serverUrl: "https://casdoor.apikv.com",
  // signinPath 已删除：它只被 SDK 的 signin() 消费，而本仓从未调用它；
  // 真要调还会拼出打向 Casdoor 主机的错误 URL。换 token 现在走 PKCE 直连
  // （见 ./auth/pkce.ts），不再经网关调 user 服务。
  // 客户端ID, 在第三方或自有的Casdoor服务端生成
  clientId: "a36e6718e392099b7915",
  // 组织名, 在第三方或自有的Casdoor服务端生成
  organizationName: "lens",
  // 应用名, 在第三方或自有的Casdoor服务端生成
  appName: "ecommerce",
  // 重新向到哪个路由, 需要在casdoor的 应用中配置
  redirectPath: "/callback",
};

// 读取配置
export const CASDOOR_SDK = new SDK(CASDOOR_CONF);

/**
 * 判断是否登录。**当前全仓无人调用，保留只为兼容外部引用。**
 *
 * @deprecated React 组件里一律用 `useAuthState()`，不要用本函数。
 *
 * 它是普通函数，不是订阅：令牌只存内存（防 XSS，见 `packages/utils/src/tokenStore.ts`）
 * 之后，登录成功不再产生任何能触发重渲染的信号，读到什么就永远是什么 ——
 * 顶栏就这么坏过一次（登录成功了却一直显示"未登录"），而且**不报任何错**。
 * 它此前"碰巧能用"，只是因为读的是同步可读的 localStorage。
 *
 * 非组件环境（如路由 `beforeLoad`）需要判断时，先 `await restoreSession()`
 * 等冷启动的静默续期跑完，再看结果——直接调本函数会在刷新后误判成未登录。
 */

// setToken 已移除：请用 @ecommerce/utils 的 setTokens()（能一并记录 refresh token
// 与过期时刻，无感续期依赖它）。原实现写 localStorage，是 XSS 长效令牌泄露的源头。

// TODO 跳转到指定链接, 这里写的不好, 结合react router等路由库来跳转
export const goToLink = (link: string) => {
  window.location.href = link;
};
// 获取登录接口的URL
export const getSigninUrl = () => {
  return CASDOOR_SDK.getSigninUrl();
};

/**
 * 各 app 桌面端登录使用的回调地址。
 *
 * Casdoor 只会把浏览器重定向到已在应用里白名单的 http 地址，而桌面端主窗口的源是
 * `tauri://localhost` —— 所以这里复用各 app web 端已经白名单的 dev 地址。这些地址
 * 不会被真正访问：Tauri 在登录子窗口导航到它的瞬间就把 code/state 截下来了。
 */
export const DESKTOP_REDIRECT_URI = {
  consumer: "http://localhost:3000/callback",
  config: "http://localhost:3005/callback",
} as const;

// 桌面端授权地址已移到 ./auth/pkce.ts 的 buildDesktopLoginUrl()。
//
// 原先这里手工拼 URL，有两个问题：①state 写死成 appName("ecommerce")，固定值
// 等于没有 CSRF 防护；②不带 PKCE。现在与 Web 端共用同一个 buildAuthorizeUrl，
// 随机 state、code_challenge、redirect_uri 暂存三件事一次性对齐，
// 回调侧 exchangeCode() 会统一校验 —— 少一处"两端各拼一遍"的漂移来源。
