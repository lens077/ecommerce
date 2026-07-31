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
	EnvConsulPath               = "CONSUL_PATH"
	EnvConsulScheme             = "CONSUL_SCHEME"
	EnvConsulToken              = "CONSUL_TOKEN"
	EnvConsulInsecureSkipVerify = "CONSUL_INSECURE_SKIP_VERIFY"
	EnvConsulCaFile             = "CONSUL_CA_FILE"
	EnvConsulCertFile           = "CONSUL_CERT_FILE"
	EnvConsulKeyFile            = "CONSUL_KEY_FILE"
)

// Config Center 配置中心(替代 Consul KV 作为配置数据源;Consul 仅保留服务发现/注册)
// 服务启动时经 ConnectRPC GetKey 从配置中心拉取整份 Bootstrap 配置(YAML)。
const (
	EnvConfigCenterAddr      = "CONFIG_CENTER_ADDR"      // config-service 地址,如 http://127.0.0.1:30010
	EnvConfigCenterNamespace = "CONFIG_CENTER_NAMESPACE" // 命名空间,如 cart
	EnvConfigCenterEnv       = "CONFIG_CENTER_ENV"       // 环境,如 dev/pre/prod
	EnvConfigCenterKey       = "CONFIG_CENTER_KEY"       // 配置键,如 bootstrap.yaml
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
