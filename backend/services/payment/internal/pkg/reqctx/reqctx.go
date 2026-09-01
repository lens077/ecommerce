package reqctx

import (
	"context"
	"net/http"

	"github.com/lens077/ecommerce/backend/constants"
)

// HTTPRequest returns the original HTTP request stored by the server middleware.
func HTTPRequest(ctx context.Context) *http.Request {
	request, _ := ctx.Value(constants.HttpRequestKey).(*http.Request)
	return request
}
