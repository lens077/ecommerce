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
