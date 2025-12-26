// 负责控制台调试日志 (开发模式)
import { authInterceptor } from "./auth";
import { errorInterceptor } from "./error";
import { loggerInterceptor } from "./logger";

const interceptors = [errorInterceptor, authInterceptor];

// 只有在开发环境下才加入日志拦截器
if (import.meta.env.DEV) {
    interceptors.push(loggerInterceptor);
}

export const allInterceptors = interceptors;
