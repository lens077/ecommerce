package constants

import (
	"os"
	"strconv"
)

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

// GetEnvString 如果环境变量存在且不为空，则返回环境变量值，否则返回默认值
func GetEnvString(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists && value != "" {
		return value
	}
	return defaultValue
}

// GetEnvBool 处理布尔类型
func GetEnvBool(key string, defaultValue bool) bool {
	s, exists := os.LookupEnv(key)
	if !exists || s == "" {
		return defaultValue
	}
	v, err := strconv.ParseBool(s)
	if err != nil {
		return defaultValue
	}
	return v
}
