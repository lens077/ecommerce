import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { SearchService } from '@/gen/api/search/v1/search_pb'
import { errorInterceptor } from "@/api/interceptors/error.ts";
import { loggerInterceptor } from "@/api/interceptors/logger.ts";

const transport = createConnectTransport({
    baseUrl: `${import.meta.env.VITE_BASE_URL}/search`,
    // baseUrl: `/api/search`,
    interceptors: [errorInterceptor, loggerInterceptor],
})

const client = createClient(SearchService, transport)

export const searchApi = {
    search: (index: string, name: string, signal: AbortSignal) => {
        return client.search({
            index,
            name,
        }, {signal})
    }
}
