import { createClient } from "@connectrpc/connect";
import { UserService } from "@/gen/api";
import { createAppTransport } from "@ecommerce/api";

const transport = createAppTransport();
const client = createClient(UserService, transport);

export const userApi = {
  signIn: (code: string, state: string, signal?: AbortSignal) =>
    client.signIn({ code, state }, { signal }),
  getUserProfile: (signal?: AbortSignal) => client.userProfile({}, { signal }),
};
