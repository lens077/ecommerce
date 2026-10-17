import { ConnectError, type Interceptor } from "@connectrpc/connect";

export const loggerInterceptor: Interceptor = (next) => async (req) => {
  const start = Date.now();
  const method = req.method.name;
  const service = req.service.typeName;

  console.log(
    `%c[RPC Request] %c${service}/${method}`,
    "color: #007bff; font-weight: bold",
    "color: inherit",
  );
  // 请求体含用户 PII（手机号/邮箱/地址），仅开发环境打印；
  // import.meta.env.DEV 在生产构建时被静态替换为 false，整个 if 块会被摇掉
  if (import.meta.env.DEV) console.log("Payload:", req.message);

  try {
    const res = await next(req);
    const duration = Date.now() - start;

    console.log(
      `%c[RPC Response] %c${service}/${method} (%c${duration}ms%c)`,
      "color: #28a745; font-weight: bold",
      "color: inherit",
      "color: #6c757d",
      "color: inherit",
    );
    // 响应体同样含 PII，仅开发环境打印
    if (import.meta.env.DEV) console.log("Data:", res.message);

    return res;
  } catch (err) {
    const duration = Date.now() - start;

    // 生产只保留 service/method/耗时与 Connect code，足够定位是哪个接口报错；
    // rawMessage 与错误对象可能带内部细节，仅开发环境打印
    if (err instanceof ConnectError) {
      console.error(
        `%c[RPC Error] %c${service}/${method} (%c${duration}ms%c) Code: ${err.code}`,
        "color: #dc3545; font-weight: bold",
        "color: inherit",
        "color: #6c757d",
        "color: inherit",
      );
      if (import.meta.env.DEV) console.error("Message:", err.rawMessage);
    } else {
      console.error(`[RPC Unknown Error] ${service}/${method} (${duration}ms)`);
      if (import.meta.env.DEV) console.error(err);
    }
    throw err;
  }
};
