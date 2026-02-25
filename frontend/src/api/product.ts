import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { ProductService } from '@/gen/api/product/v1/product_pb.ts'
import { errorInterceptor } from "@/api/interceptors/error.ts";
import { loggerInterceptor } from "@/api/interceptors/logger.ts";

const transport = createConnectTransport({
    baseUrl: `${import.meta.env.VITE_BASE_URL}/product`,
    // baseUrl: '/api/product',
    interceptors: [errorInterceptor, loggerInterceptor],
})

const client = createClient(ProductService, transport)

export const productApi = {
    getProductDetail: (spuCode: string, signal?: AbortSignal) => {
        return client.getProductDetail({spuCode}, {signal})
    },
}
