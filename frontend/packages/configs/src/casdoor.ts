import SDK from "casdoor-js-sdk";
export const CASDOOR_CONF = {
  // 第三方或自有的Casdoor服务端的URL
  serverUrl: "http://apikv.com:8000",
  // 注册登录的接口, 默认为/api/signin
  // signinPath:'/api/signin',
  signinPath: "/user.v1.UserService/SignIn",
  // 客户端ID, 在第三方或自有的Casdoor服务端生成
  clientId: "42c7d8cf13f021cb2af2",
  // 组织名, 在第三方或自有的Casdoor服务端生成
  organizationName: "org-ecommerce",
  // 应用名, 在第三方或自有的Casdoor服务端生成
  appName: "app-mall-web",
  // 重新向到哪个路由, 需要在casdoor的 应用中配置
  redirectPath: "/callback",
};

// 服务端的URL, 非casdoor的地址
export const serverUrl = "http://localhost:4000";

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
