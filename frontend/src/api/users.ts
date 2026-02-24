import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { allInterceptors } from "@/api/interceptors";
import { UserService } from '@/gen/api/user/v1/user_pb.ts'

const transport = createConnectTransport({
    baseUrl: `${import.meta.env.VITE_BASE_URL}/user`,
    // baseUrl: '/api/user',
    interceptors: allInterceptors,
})

const client = createClient(UserService, transport)

export const userApi = {
    getUserProfile: (signal?: AbortSignal) => {
        return client.userProfile({}, {signal})
    },
    signIn: (code: string, state: string, signal?: AbortSignal) => {
        return client.signIn({
            code: code,
            state: state,
        }, {signal})
    }
}
