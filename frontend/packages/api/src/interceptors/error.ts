import type { Interceptor } from "@connectrpc/connect";
import { isPermissionDenied, isUnauthenticated, toAppError } from "../errors";
import { emitAuthError } from "./events";

/**
 * 统一错误拦截器。
 *
 * 网关现在输出符合 Connect 规范的错误体（gateway/errors/response.go），
 * connect-web 能正确解析出 code / message / details，
 * 所以这里不再需要从 err.message 里手工抠 JSON —— 全部交给 toAppError。
 */
export const errorInterceptor: Interceptor = (next) => {
  return async (req) => {
    try {
      return await next(req);
    } catch (err: unknown) {
      const appError = toAppError(err);

      console.warn(
        `[API Interceptor] 请求异常: ${appError.codeName}/${appError.reason} - ${appError.message}`,
        appError.raw,
      );

      if (isUnauthenticated(appError)) {
        console.error("认证失效，触发全局退登机制...");
        emitAuthError(appError);
      } else if (isPermissionDenied(appError)) {
        // 403 是“已登录但没权限”，绝不能触发退登：
        // 否则会出现登录进去又被立刻弹出的死循环
        console.warn("权限不足：用户已登录，但无权访问该资源（不执行退登跳转）");
      }

      // 原样抛出标准 ConnectError，保证调用方的 try-catch / ConnectError.from 行为不变
      throw appError.raw;
    }
  };
};
