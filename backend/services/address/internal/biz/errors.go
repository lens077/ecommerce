package biz

import "errors"

var (
	ErrAddressNotFound  = errors.New("[address] address not found")
	ErrInvalidAddressID = errors.New("[address] invalid address id")
)
