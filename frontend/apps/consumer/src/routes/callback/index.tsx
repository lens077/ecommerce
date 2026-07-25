import CheckIcon from "@mui/icons-material/Check";
import { CircularProgress } from "@mui/material";
import Alert from "@mui/material/Alert";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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

                if (response.state !== "ok" || !response.data) {
                    throw new Error("登录响应异常");
                }

                setToken(response.data);

                // ✨ 关键修复：使用 flushSync 强制同步刷新 React 状态，
                // 确保 setIsAuthenticated 在 navigate 之前传播到 Router context，
                // 否则受保护路由的 beforeLoad 仍会读到 isAuthenticated=false 从而重新跳转登录
                flushSync(() => {
                    setIsAuthenticated(true);
                });

                setStatus("success");

                if (isTokenExpired(response.data)) {
                    console.warn("Token已过期，请重新登录或尝试刷新。");
                    setAccount({});
                    return;
                }

                const payload = decodeJwtPayload(response.data);
                if (payload) {
                    setAccount({
                        id: payload.id,
                        displayName: payload.displayName,
                        name: payload.name,
                        email: payload.email,
                        avatar: payload.avatar,
                    });
                }

                addNotification({
                    message: "登录成功",
                    severity: "success",
                });

                // 检查是否有之前存过的锚点 URL（必须在登录成功分支内）
                const originTarget = localStorage.getItem("redirect_after_login");
                localStorage.removeItem("redirect_after_login"); // 阅后即焚

                if (originTarget && originTarget.startsWith(window.location.origin)) {
                    const targetPath = originTarget.replace(window.location.origin, "");
                    await navigate({ to: targetPath });
                } else {
                    await navigate({ to: "/" });
                }
            } catch (err) {
                setStatus("error");
                console.error("RPC 调用错误:", err);
                addNotification({
                    message: "登录失败，请重试",
                    severity: "error",
                });
                await navigate({to: "/"});
            }
        };

        handleLogin();
    }, [code, state, navigate, setIsAuthenticated]);

    const render = () => {
        switch (status) {
            case "success":
                return (
                    <Alert icon={<CheckIcon fontSize="inherit"/>} severity="success">
                        登录成功，正在跳转...
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
