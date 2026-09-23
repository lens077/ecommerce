package biz

import "errors"

var (
	// ErrAddressNotFound 表示地址不存在或不属于当前用户，service 层映射为 not_found。
	ErrAddressNotFound = errors.New("[address] address not found")
	// ErrInvalidAddressID 表示地址 ID 非法，service 层映射为 invalid_argument。
	ErrInvalidAddressID = errors.New("[address] invalid address id")
)
