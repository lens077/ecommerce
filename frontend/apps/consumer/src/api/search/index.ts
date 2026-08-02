import { createClient } from "@connectrpc/connect"
import { SearchService } from "@/gen/api";
import { createAppTransport, errorInterceptor, loggerInterceptor } from "@ecommerce/api";

// 搜索是公开接口，不带 auth 拦截器
const transport = createAppTransport({
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
