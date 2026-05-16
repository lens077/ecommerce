package constants

type CartStatusEnum string

const (
	CartStatusActive  CartStatusEnum = "active"
	CartStatusExpired CartStatusEnum = "expired"
	CartStatusDeleted CartStatusEnum = "deleted"
)
