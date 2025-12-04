// 设置token
export const setToken = (token: string) => {
    localStorage.setItem("token", token);
};
// TODO 显示消息 应使用第三方alert库来实现
export const showMessage = (message: string) => {
    console.log(message);
};
