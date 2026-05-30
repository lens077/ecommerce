package constants

type ApplicationStatus string

const (
	ApplicationStatusPendingReview ApplicationStatus = "pending_review" // 待审核
	ApplicationStatusApproved      ApplicationStatus = "approved"       // 已通过
	ApplicationStatusRejected      ApplicationStatus = "rejected"       // 已驳回
	ApplicationStatusActivated     ApplicationStatus = "activated"      // 已激活（商家完成首次设置并激活店铺）
)
