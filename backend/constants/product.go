package constants

type ProductSpuStatus string

var (
	ProductSpuStatusDraft   ProductSpuStatus = "draft"
	ProductSpuStatusOnline  ProductSpuStatus = "online"
	ProductSpuStatusOffline ProductSpuStatus = "offline"
	ProductSpuStatusDeleted ProductSpuStatus = "deleted"
)
