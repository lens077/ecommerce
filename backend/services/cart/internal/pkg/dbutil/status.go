package dbutil

import (
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/cart/internal/data/models"
)

func ToCartStatusEnum(status models.CartCartType) constants.CartStatusEnum {
	switch status {
	case models.CartCartTypeActive:
		return constants.CartStatusActive
	case models.CartCartTypeExpired:
		return constants.CartStatusExpired
	case models.CartCartTypeDeleted:
		return constants.CartStatusDeleted
	default:
		return constants.CartStatusUnknown
	}
}
