package biz

import "github.com/lens077/go-connect-kit/errinfo"

var (
	// ErrAddressNotFound 表示地址不存在或不属于当前用户，service 层映射为 not_found。
	ErrAddressNotFound = errinfo.New("ADDRESS_NOT_FOUND", "[address] address not found")
	// ErrInvalidAddressID 表示地址 ID 非法，service 层映射为 invalid_argument。
	ErrInvalidAddressID = errinfo.New("INVALID_ADDRESS_ID", "[address] invalid address id")
)
