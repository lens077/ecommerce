import { createClient } from "@connectrpc/connect"
import { createConnectTransport } from "@connectrpc/connect-web"
import { SearchService } from "@/gen/api";
import { errorInterceptor, loggerInterceptor } from "@ecommerce/api";

const transport = createConnectTransport({
    // baseUrl:`${gatewayUrl}/search`,
    baseUrl: `http://localhost:8080`,
    interceptors: [loggerInterceptor,errorInterceptor]
})
const client = createClient(SearchService, transport)

export const searchApi = {
  search: (index: string, name: string, signal: AbortSignal) => {
    return client.search(
      {
        index,
        name,
      },
      { signal },
    );
  },
};
