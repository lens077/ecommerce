import { createClient } from "@connectrpc/connect"
import { createConnectTransport } from "@connectrpc/connect-web"
import { ProductService } from "@/gen/api";
import { errorInterceptor, loggerInterceptor } from "@ecommerce/api";

const transport = createConnectTransport({
    // baseUrl: `${gatewayUrl}/product`,
    baseUrl: `http://localhost:8080`,
    interceptors: [loggerInterceptor,errorInterceptor]
})
const client = createClient(ProductService, transport)

export const productApi = {
    getProductDetail: (spuCode: string, signal?: AbortSignal) => {
        return client.getProductDetail({ spuCode }, { signal });
    },
};
