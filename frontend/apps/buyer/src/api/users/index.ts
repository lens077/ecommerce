import { createClient } from "@connectrpc/connect"
import { createConnectTransport } from "@connectrpc/connect-web"
import { UserService } from "@/gen/api";
import { errorInterceptor, loggerInterceptor } from "@ecommerce/api";

const transport = createConnectTransport({
  // baseUrl: `${gatewayUrl}/users`,
  baseUrl: `http://localhost:8080`,
  interceptors: [loggerInterceptor,errorInterceptor]
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
