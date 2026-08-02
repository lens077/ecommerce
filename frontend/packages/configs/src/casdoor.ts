import SDK from "casdoor-js-sdk";
export const CASDOOR_CONF = {
  // 第三方或自有的Casdoor服务端的URL
  serverUrl: "http://114.132.233.129:8000",
  // 注册登录的接口, 默认为/api/signin
  // signinPath:'/api/signin',
  signinPath: "/user.v1.UserService/SignIn",
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

// 判断是否登录
export const isLoggedIn = () => {
  const token = localStorage.getItem("token");
  return token !== null && token.length > 0;
};

// 设置token
export const setToken = (token: string) => {
  localStorage.setItem("token", token);
};

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

/**
 * 桌面端用的 Casdoor authorize 地址。
 *
 * 不能用 `CASDOOR_SDK.getSigninUrl()` —— 它内部拿 `window.location.origin` 拼
 * redirect_uri，在 Tauri 下会拼出 `tauri://localhost/callback`。
 */
export const getDesktopSigninUrl = (redirectUri: string) => {
  const params = new URLSearchParams({
    client_id: CASDOOR_CONF.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "read",
    state: CASDOOR_CONF.appName,
  });
  return `${CASDOOR_CONF.serverUrl.trim()}/login/oauth/authorize?${params.toString()}`;
};
