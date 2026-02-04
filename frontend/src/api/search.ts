import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { SearchService } from '@/gen/api/search/v1/search_pb'

const transport = createConnectTransport({
	baseUrl: `${import.meta.env.VITE_BASE_URL}/search`,
	// baseUrl: `/api/search`,
})

const client = createClient(SearchService, transport)

export const search = (index: string, name: string) => {
	return client.search({
		index,
		name,
	})
}
