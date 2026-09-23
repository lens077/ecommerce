package constants

// 使用常量名称作为映射
const (
	EnvServiceName    = "SERVICE_NAME"
	EnvServiceVersion = "SERVICE_VERSION"
	EnvDeploymentMode = "DEPLOYMENT_MODE"
)

// Consul
const (
	EnvConsulEnabled            = "CONSUL_ENABLED"
	EnvConsulAddr               = "CONSUL_ADDR"
	EnvConsulScheme             = "CONSUL_SCHEME"
	EnvConsulToken              = "CONSUL_TOKEN"
	EnvConsulInsecureSkipVerify = "CONSUL_INSECURE_SKIP_VERIFY"
	EnvConsulCaFile             = "CONSUL_CA_FILE"
	EnvConsulCertFile           = "CONSUL_CERT_FILE"
	EnvConsulKeyFile            = "CONSUL_KEY_FILE"
)

const (
	EnvConfigSource     = "CONFIG_SOURCE"
	EnvConfigFile       = "CONFIG_FILE"
	EnvConfigSourceFile = "CONFIG_SOURCE_FILE"
)

const (
	EnvConfigCenterAddr         = "CONFIG_CENTER_ADDR"
	EnvConfigCenterNamespace    = "CONFIG_CENTER_NAMESPACE"
	EnvConfigCenterEnv          = "CONFIG_CENTER_ENV"
	EnvConfigCenterKey          = "CONFIG_CENTER_KEY"
	EnvConfigCenterServiceToken = "CONFIG_CENTER_SERVICE_TOKEN"
)
