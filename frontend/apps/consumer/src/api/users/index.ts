import { createClient } from "@connectrpc/connect";
import { UserService } from "@/gen/api";
import { createAppTransport } from "@ecommerce/api";

const transport = createAppTransport();
const client = createClient(UserService, transport);

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
