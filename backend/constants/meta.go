package constants

const (
	Host = "localhost"
	Port = "8080"
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
	ConsulPath               = "/consul/"
	ConsulFileFormat         = "yaml"
	ConsulScheme             = "http"
	ConsulTlsScheme          = "https"
	ConsulInsecureSkipVerify = false
	ConsulToken              = ""
)

// 配置数据源取值(CONFIG_SOURCE)
const (
	ConfigSourceConsul       = "consul"       // 从 Consul KV 的 CONSUL_PATH 读整份 Bootstrap
	ConfigSourceConfigCenter = "configcenter" // 从 config-service 按 namespace/environment/key 拉取

	// DefaultConfigSource 默认沿用 Consul KV:现有部署清单不改一行也能继续启动,
	// 迁移到配置中心是显式的 opt-in。
	DefaultConfigSource = ConfigSourceConsul

	// ConfigFileFormat 两个数据源存的都是 YAML 文本,解析时统一按此格式。
	ConfigFileFormat = "yaml"
)

// Config Center 默认值
const (
	ConfigCenterAddr = "http://127.0.0.1:30010"
	ConfigCenterKey  = "bootstrap.yaml"
)

// Consul service tags
const (
	ConsulTagFx  = "fx"
	ConsulTagTtl = "ttl"
)
