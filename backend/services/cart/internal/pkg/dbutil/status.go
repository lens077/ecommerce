package dbutil

import (
	"fmt"

	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/cart/internal/biz"
)

func ToCartStatusEnum(v interface{}) (constants.CartStatusEnum, error) {
	if v == nil {
		return "", fmt.Errorf("cart status cannot be nil")
	}
	s, ok := v.(string)
	if !ok {
		return "", fmt.Errorf("expected string, got %T", v)
	}
	return parseCartStatus(s)
}

func parseCartStatus(s string) (constants.CartStatusEnum, error) {
	switch constants.CartStatusEnum(s) {
	case constants.CartStatusActive, constants.CartStatusExpired, constants.CartStatusDeleted:
		return constants.CartStatusEnum(s), nil
	default:
		return "", fmt.Errorf("%w: %s", biz.ErrInvalidCartStatus, s)
	}
}
