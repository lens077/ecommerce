import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { emitAuthError } from "./events";

// 1. 定义 Kratos 网关的标准错误结构
interface KratosErrorBody {
    code: string | number; // 例如 "forbidden_route" 或 403
    message: string;       // 错误提示文本
    details?: Array<{
        "@type": string;
        reason: string;    // 核心判定字段：例如 "FORBIDDEN_ROUTE"、"UNAUTHORIZED"
        metadata?: Record<string, string> | null;
    }>;
}

export const errorInterceptor: Interceptor = (next) => {
    return async (req) => {
        try {
            return await next(req);
        } catch (err: any) {
            // 先封装为标准的 Connect 错误以防万一
            const connectErr = ConnectError.from(err);

            console.warn("[API Interceptor] 捕获到请求异常:", connectErr);

            // 2. ✨ 核心提取：从底层错误对象中尝试挖掘 Kratos 抛出的底层 JSON
            let kratosReason = "";

            // ConnectRPC 发生网络/协议错误时，会将原始响应数据或解析失败的信息挂载在 err 上
            // 我们可以安全地尝试从 err.message 或底层 json 中匹配特征
            try {
                // 如果 ConnectRPC 将完整的 body 作为纯文本放进了 message
                if (err.message && err.message.includes("details")) {
                    const startIdx = err.message.indexOf("{");
                    if (startIdx !== -1) {
                        const jsonStr = err.message.substring(startIdx);
                        const parsed = JSON.parse(jsonStr) as KratosErrorBody;
                        kratosReason = parsed.details?.[0]?.reason || "";
                    }
                }
                // 或者：直接检查非标准响应附加的 json 属性（部分 client 适配器会挂载）
                else if (err.rawMessage && typeof err.rawMessage === "object") {
                    kratosReason = err.rawMessage.details?.[0]?.reason || "";
                }
            } catch (e) {
                console.error("解析 Kratos 错误体失败:", e);
            }

            // 3. ✨ 路由鉴权/权限拦截判定
            // 根据你的实际 Kratos 业务错误码（Reason）来决定是否要弹回登录
            const isUnauthenticated =
                connectErr.code === Code.Unauthenticated ||
                kratosReason === "UNAUTHORIZED" ||
                kratosReason === "TOKEN_EXPIRED";

            // 注意：FORBIDDEN_ROUTE 或者是 403 通常代表“已登录但没权限”，不应该弹回登录页！
            // 如果 403 触发了 emitAuthError，就会导致登录进去又被立马弹出来的死循环。
            if (isUnauthenticated) {
                console.error("认证失效，触发全局退登机制...");
                emitAuthError(connectErr);
            } else if (kratosReason === "FORBIDDEN_ROUTE" || connectErr.code === Code.PermissionDenied) {
                console.warn("权限不足：用户已登录，但无权访问该资源（不执行退登跳转）");
            }

            // 4. 🚨 必须：原样抛出标准错误，让前端 UI 层的 try-catch 流程不中断
            throw connectErr;
        }
    };
};
