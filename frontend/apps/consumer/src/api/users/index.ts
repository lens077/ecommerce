import { createClient } from "@connectrpc/connect"
import { createConnectTransport } from "@connectrpc/connect-web"
import { UserService } from "@/gen/api";
import { errorInterceptor, loggerInterceptor,authInterceptor } from "@ecommerce/api";
import { env } from "@/env";

const transport = createConnectTransport({
  baseUrl: env.VITE_GATEWAY_URL ?? "http://localhost:8080",
  interceptors: [authInterceptor,loggerInterceptor,errorInterceptor],
})
const client = createClient(UserService, transport)

export const userApi = {
  getUserProfile: (signal?: AbortSignal) => {
    return client.userProfile({}, { signal });
  },
  signIn: (code: string, state: string, signal?: AbortSignal) => {
    return client.signIn(
      {
        code: code,
        state: state,
      },
      { signal },
    );
  },
};
