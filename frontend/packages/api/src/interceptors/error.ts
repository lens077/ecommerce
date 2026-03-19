import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { emitAuthError } from "./events";

export const errorInterceptor: Interceptor = (next) => async (req) => {
  try {
    return await next(req);
  } catch (err) {
    const connectErr = ConnectError.from(err);

    // 处理未登录
    if (connectErr.code === Code.Unauthenticated) {
      emitAuthError(connectErr); // 广播信号，不处理具体逻辑
    }

    throw connectErr;
  }
};
