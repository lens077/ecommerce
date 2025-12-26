import { ConnectError, type Interceptor } from "@connectrpc/connect";

export const loggerInterceptor: Interceptor = (next) => async (req) => {
    const start = Date.now();
    const method = req.method.name;
    const service = req.service.typeName;

    console.log(`%c[RPC Request] %c${service}/${method}`, "color: #007bff; font-weight: bold", "color: inherit");
    console.log("Payload:", req.message);

    try {
        const res = await next(req);
        const duration = Date.now() - start;

        console.log(`%c[RPC Response] %c${service}/${method} (%c${duration}ms%c)`,
            "color: #28a745; font-weight: bold",
            "color: inherit",
            "color: #6c757d",
            "color: inherit"
        );
        console.log("Data:", res.message);

        return res;
    } catch (err) {
        const duration = Date.now() - start;

        if (err instanceof ConnectError) {
            console.error(
                `%c[RPC Error] %c${service}/${method} (%c${duration}ms%c)\n` +
                `Code: ${err.code}\n` +
                `Message: ${err.rawMessage}`,
                "color: #dc3545; font-weight: bold",
                "color: inherit",
                "color: #6c757d",
                "color: inherit"
            );
        } else {
            console.error(`[RPC Unknown Error] ${service}/${method}`, err);
        }
        throw err;
    }
};
