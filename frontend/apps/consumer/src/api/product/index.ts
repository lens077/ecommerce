import { createClient } from "@connectrpc/connect"
import { ProductService } from "@/gen/api";
import { createAppTransport, errorInterceptor, loggerInterceptor } from "@ecommerce/api";

// 商品浏览是公开接口，不带 auth 拦截器
const transport = createAppTransport({
    interceptors: [loggerInterceptor,errorInterceptor]
})
const client = createClient(ProductService, transport)

export const productApi = {
    getProductDetail: (spuCode: string, signal?: AbortSignal) => {
        return client.getProductDetail({ spuCode }, { signal });
    },
};
