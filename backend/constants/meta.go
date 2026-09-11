package constants

import "time"

const (
	Host = "localhost"
	Port = "8080"
)

// 基础设施超时兜底值。配置里没写对应字段时用这些,
// 不能留零值:context.WithTimeout(0) 会立刻超时,连接本身没问题也起不来。
//
// 与 go-connect-template/constants 对齐:monorepo 下模板生成的服务不再各带一份
// constants 副本(manifest v3 root_packages),直接 import 本包,这两个名字必须在。
const (
	// DefaultDBPingTimeout 建池后的首次探活超时
	DefaultDBPingTimeout = 5 * time.Second

	// DefaultHealthCheckTimeout /healthz 里每个依赖的单项检查超时。
	// 要明显小于 Consul 的 check.ttl,否则健康检查还没返回就被判 critical。
	DefaultHealthCheckTimeout = 2 * time.Second
)

// RPC metadata
const (
	UserOwnerMetadataKey = "x-md-global-owner"
	UserNameMetadataKey  = "x-md-global-name"
	UserRoleMetadataKey  = "x-md-global-role"
	UserIdMetadataKey    = "x-md-global-user-id"
)

// Log options
const (
	FormatConsole = "console"
	FormatJson    = "json"
)

// Postgres ssl mode options
const (
	SslModeDisable    = "disable"
	SslModeAllow      = "allow"
	SslModePrefer     = "prefer"
	SslModeVerifyCa   = "verify-ca"
	SslModeVerifyFull = "verify-full"
)

// Consul configs default values
const (
	ConsulAddr               = "127.0.0.1:8500"
	ConsulFileFormat         = "yaml"
	ConsulScheme             = "http"
	ConsulTlsScheme          = "https"
	ConsulInsecureSkipVerify = false
	ConsulToken              = ""
)

const (
	ConfigSourceFile         = "file"
	ConfigSourceConfigCenter = "configcenter"
	ConfigFileFormat         = "yaml"
)

const (
	ConfigCenterAddr = "http://127.0.0.1:30010"
	ConfigCenterKey  = "bootstrap.yaml"
)

// Consul service tags
const (
	ConsulTagFx  = "fx"
	ConsulTagTtl = "ttl"
)
