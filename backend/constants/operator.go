package constants

// OperatorTypeEnum 操作者类型枚举
type OperatorTypeEnum string

const (
	OperatorTypeUser     OperatorTypeEnum = "user"     // 用户操作
	OperatorTypeMerchant OperatorTypeEnum = "merchant" // 商家操作
	OperatorTypeAdmin    OperatorTypeEnum = "admin"    // 管理员操作
	OperatorTypeSystem   OperatorTypeEnum = "system"   // 系统操作
)
