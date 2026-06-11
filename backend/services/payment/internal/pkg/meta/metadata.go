package meta

import (
	"context"
	"net/http"

	"github.com/lens077/ecommerce/backend/constants"
)

// GetHTTPRequest 从 context 中安全地获取原始 *http.Request
func GetHTTPRequest(ctx context.Context) *http.Request {
	if req, ok := ctx.Value(constants.HttpRequestKey).(*http.Request); ok {
		return req
	}
	return nil
}
