import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { addNotification } from "@/store/notifications";

export const errorInterceptor: Interceptor = (next) => async (req) => {
    try {
        return await next(req);
    } catch (err) {
        if (err instanceof ConnectError) {
            // 处理网关返回的 401
            if (err.code === Code.Unauthenticated) {
                localStorage.removeItem("token");
                addNotification({ message: "登录过期，请重新登录", severity: "error" });
                // 也可以选择 window.location.href = "/"
            }

            // 处理网关返回的 403 (RBAC 无权限)
            if (err.code === Code.PermissionDenied) {
                addNotification({ message: "你没有权限执行此操作", severity: "warning" });
            }
        }
        throw err; // 继续抛出，让 React Query 能捕获到
    }
};
