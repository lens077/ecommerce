import { createClient } from "@connectrpc/connect"
import { createConnectTransport } from "@connectrpc/connect-web"
import { UserService } from "@/gen/api/user/user_pb.ts"
import { SearchService } from "@/gen/api/search/v1/search_pb.ts"

const transport = createConnectTransport({
    baseUrl: import.meta.env.VITE_BASE_URL,
    // 可以在这里添加 Interceptors 来自动处理后续请求的 Authorization header
    // interceptors: [authInterceptor],
})

export const userClient = createClient(UserService, transport)
export const searchService = createClient(SearchService, transport)
