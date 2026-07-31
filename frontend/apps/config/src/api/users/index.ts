import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { UserService } from "@/gen/api";
import { authInterceptor, errorInterceptor, loggerInterceptor } from "@ecommerce/api";
import { env } from "@/env";

const transport = createConnectTransport({
  baseUrl: env.VITE_GATEWAY_URL ?? "http://localhost:8080",
  interceptors: [authInterceptor, loggerInterceptor, errorInterceptor],
});
const client = createClient(UserService, transport);

export const userApi = {
  signIn: (code: string, state: string, signal?: AbortSignal) =>
    client.signIn({ code, state }, { signal }),
  getUserProfile: (signal?: AbortSignal) => client.userProfile({}, { signal }),
};
