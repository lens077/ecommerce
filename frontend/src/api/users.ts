import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { allInterceptors } from "@/api/interceptors";
import { UserService } from '@/gen/api/user/v1/user_pb.ts'

const transport = createConnectTransport({
	baseUrl: `${import.meta.env.VITE_BASE_URL}/user`,
	interceptors: allInterceptors,
})

const client = createClient(UserService, transport)

export const signIn = (code: string, state: string) => {
	return client.signIn({
		code: code,
		state: state,
	})
}

export const getUserProfile = () => {
	return client.userProfile({})
}
