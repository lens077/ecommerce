package biz

import "github.com/lens077/go-connect-kit/errinfo"

var (
	ErrProductNotFound = errinfo.New("PRODUCT_NOT_FOUND", "[Product] 商品不存在")
)
