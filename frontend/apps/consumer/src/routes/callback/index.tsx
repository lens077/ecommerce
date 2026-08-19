import CheckIcon from "@mui/icons-material/Check";
import { CircularProgress } from "@mui/material";
import Alert from "@mui/material/Alert";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { z } from "zod";
import { i18next, useTranslation } from "@ecommerce/i18n";
import type { Status } from "@ecommerce/constants";
import { addNotification, setTokens } from "@ecommerce/utils";
import { exchangeCode, scheduleRenew } from "@ecommerce/configs";
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
  const { code, state } = Route.useSearch();
  const navigate = useNavigate();
  const { setIsAuthenticated } = useAuthActions();
  const { t } = useTranslation();

  useEffect(() => {
    // 防止重复提交
    if (processedRef.current) return;
    processedRef.current = true;

    const handleLogin = async () => {
      try {
        // 静默续期的场景：本页被 renew 用的隐藏 iframe 加载。此时不能自己兑换
        // （verifier 在顶层窗口的 sessionStorage 里，iframe 同源但兑换后令牌
        // 只会落在 iframe 的内存里，顶层拿不到），把 code 抛回顶层由它兑换。
        if (window.parent !== window) {
          window.parent.postMessage(
            { type: "oauth_silent_result", code, state },
            window.location.origin,
          );
          return;
        }

        // 直接向 Casdoor 兑换（PKCE），不再经网关调 user 服务 ——
        // 那一跳的唯一作用是替前端保管 client_secret，而 PKCE 不需要密钥。
        // 顺带解掉「前端起来必须先起 user 服务」这个开发期依赖。
        const tokens = await exchangeCode(code, state);

        setTokens({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          // 登出要拿它当 id_token_hint，缺了 Casdoor 不结束会话
          idToken: tokens.idToken,
        });
        scheduleRenew(); // 到期前 60s 自动续，用户无感

        // ✨ 关键修复：使用 flushSync 强制同步刷新 React 状态，
        // 确保 setIsAuthenticated 在 navigate 之前传播到 Router context，
        // 否则受保护路由的 beforeLoad 仍会读到 isAuthenticated=false 从而重新跳转登录
        flushSync(() => {
          setIsAuthenticated(true);
        });

        setStatus("success");

        // 用户资料不在这里填了：`setTokens()` 会同步触发令牌订阅，
        // 由 `store/users.ts` 从 JWT 统一解出来。放在那儿才能同时覆盖
        // 刷新页面的冷启动恢复与后台续期 —— 只在这里填的话，一刷新就空了。

        addNotification({
          message: i18next.t("consumer:callback.loginSuccess"),
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
          message: i18next.t("consumer:callback.loginFailed"),
          severity: "error",
        });
        await navigate({ to: "/" });
      }
    };

    void handleLogin();
  }, [code, state, navigate, setIsAuthenticated]);

  const render = () => {
    switch (status) {
      case "success":
        return (
          <Alert icon={<CheckIcon fontSize="inherit" />} severity="success">
            {t("callback.successRedirect")}
          </Alert>
        );
      case "error":
        return <Alert severity="error">{t("callback.errorRedirect")}</Alert>;
      case "loading":
        return <CircularProgress />;
    }
  };

  return <>{render()}</>;
}
