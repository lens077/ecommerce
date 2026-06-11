package constants

// 定义一个私有的 key 类型，防止上下文冲突
type contextKey string

const HttpRequestKey contextKey = "http-request"
