import { fetchIdentity } from "@ecommerce/configs";
import { i18next } from "@ecommerce/i18n";
import { addNotification } from "@ecommerce/utils";

/** BFF 身份由 /auth/me 确认，不以本地令牌或缓存账号代替。 */
export function requireLogin(
  messageKey: "consumer:profile.loginRequired" | "consumer:addresses.loginRequired",
) {
  return async ({ context }: { context: { auth?: { login?: () => void } } }) => {
    const identity = await fetchIdentity();
    if (!identity.authenticated) {
      addNotification({ message: i18next.t(messageKey), severity: "warning" });
      context.auth?.login?.();
    }
  };
}
