import CheckIcon from "@mui/icons-material/Check";
import { CircularProgress } from "@mui/material";
import Alert from "@mui/material/Alert";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { userApi } from "@/api";
import type { Status } from "@ecommerce/constants";
import { setAccount } from "@/store/users";
import { addNotification, setToken } from "@ecommerce/utils";
import { decodeJwtPayload, isTokenExpired } from "@ecommerce/utils";
import { useAuthActions } from "@/providers/AuthProvider";

const CallbackSearchSchema = z.object({
    code: z.string().min(1, "缺少 code 参数"),
    state: z.string().min(1, "缺少 state 参数"),
});

export const Route = createFileRoute("/callback/")({
    component: RouteComponent,
    validateSearch: CallbackSearchSchema,
});

function RouteComponent() {
    const [status, setStatus] = useState<Status>("loading");
    // 使用 useRef 防止 React.StrictMode 下 useEffect 执行两次导致 code 失效
    const processedRef = useRef(false);
    const {code, state} = Route.useSearch();
    const navigate = useNavigate();
    const {setIsAuthenticated} = useAuthActions();

    useEffect(() => {
        // 防止重复提交
        if (processedRef.current) return;
        processedRef.current = true;

        const handleLogin = async () => {
            try {
                const response = await userApi.signIn(code, state);

                if (response.state === "ok" && response.data) {
                    setToken(response.data);

                    // ✨ 核心修复：在这里立刻拨动全局状态，同步通知路由守卫此用户已登录成功
                    setIsAuthenticated(true);

                    setStatus("success");
                    if (isTokenExpired(response.data)) {
                        console.warn("Token已过期，请重新登录或尝试刷新。");
                        setAccount({});
                        return;
                    }
                    const payload = decodeJwtPayload(response.data);
                    console.log("payload", payload);
                    if (payload) {
                        setAccount({
                            id: payload.id,
                            displayName: payload.displayName,
                            name: payload.name,
                            email: payload.email,
                            avatar: payload.avatar,
                        });
                    }

                    // 添加登录成功通知
                    addNotification({
                        message: "登录成功",
                        severity: "success",
                    });
                    // 重定向到首页
                    await navigate({to: "/"});
                }
                // 检查是否有之前存过的锚点 URL
                const originTarget = localStorage.getItem("redirect_after_login");
                localStorage.removeItem("redirect_after_login"); // 阅后即焚，防止污染下一次登录

                if (originTarget && originTarget.startsWith(window.location.origin)) {
                    // 如果是本站内的合法路径，直接提取出路由部分跳过去
                    const targetPath = originTarget.replace(window.location.origin, "");
                    await navigate({ to: targetPath });
                } else {
                    // 否则降级回首页
                    await navigate({ to: "/" });
                }
            } catch (err) {
                setStatus("error");
                console.error("RPC 调用错误:", err);
                // 添加登录失败通知
                addNotification({
                    message: "登录失败，请重试",
                    severity: "error",
                });
                // 重定向到首页
                await navigate({to: "/"});
            }
        };

        handleLogin();
        // 将 setIsAuthenticated 补充进依赖项中，保持 Hooks 的规范性
    }, [code, state, navigate, setIsAuthenticated]);

    const render = () => {
        switch (status) {
            case "success":
                return (
                    <Alert icon={<CheckIcon fontSize="inherit"/>} severity="success">
                        登录成功，正在跳转到首页...
                    </Alert>
                );
            case "error":
                return <Alert severity="error">登录失败，正在跳转到首页...</Alert>;
            case "loading":
                return <CircularProgress/>;
        }
    };

    return <>{render()}</>;
}
