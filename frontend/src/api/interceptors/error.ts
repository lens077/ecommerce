import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { addNotification } from "@/store/notifications";

export const errorInterceptor: Interceptor = (next) => async (req) => {
    try {
        return await next(req);
    } catch (err) {
        const connectErr = ConnectError.from(err);

        // 统一错误处理逻辑
        switch (connectErr.code) {
            case Code.Unauthenticated:
                // 例如：跳转到 Casdoor 登录或刷新 Token
                console.error('用户未登录')
                addNotification({message: "未登录/登录过期", severity: "error"});
                break;
            case Code.PermissionDenied:
                console.error('用户没有权限')
                addNotification({message: "权限不足", severity: "error"});
                break;
            case Code.Unavailable:
                console.error('未知错误')
                addNotification({message: "服务不可用，正在尝试自动重试...", severity: "error"});
                break;
            default:
                console.error(`API 错误: ${connectErr.rawMessage}`);
                addNotification({message: "请求错误", severity: "error"});
        }

        // 继续抛出错误，让 React Query 捕获
        throw connectErr;
    }
};
