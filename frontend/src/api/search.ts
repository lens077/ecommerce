import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { SearchService } from '@/gen/api/search/v1/search_pb.ts'

const transport = createConnectTransport({
    baseUrl: import.meta.env.VITE_BASE_URL,
    // 可以在这里添加 Interceptors 来自动处理后续请求的 Authorization header
    // interceptors: [authInterceptor],
})

const client = createClient(SearchService, transport)

export const search = (index: string, name: string) => {
    return client.search({
        index,
        name
    })
}
