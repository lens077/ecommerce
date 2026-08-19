package constants

// 环境变量
const (
	// UserOwner 用户组织
	UserOwner = "OWNER"

	// ConsulAddr Consul 服务发现地址
	ConsulAddr = "CONSUL_ADDR"
	// ConsulScheme Consul服务器的连接协议(http/https)
	ConsulScheme = "CONSUL_SCHEME"
	// ConsulInsecureSkipVerify 是否跳过 TLS 证书验证
	ConsulInsecureSkipVerify = "CONSUL_INSECURE_SKIP_VERIFY"
	// ConsulToken Consul ACL Token
	ConsulToken = "CONSUL_TOKEN"
	// ConsulDatacenter Consul 数据中心
	ConsulDatacenter = "CONSUL_DATACENTER"

	// EnvConfigSourceFile 指向本地 SourceConfig selector。正常启动只接受 config_center。
	EnvConfigSourceFile = "CONFIG_SOURCE_FILE"
	// EnvConfigSource/EnvConfigFile 只用于显式本地文件模式。
	EnvConfigSource = "CONFIG_SOURCE"
	EnvConfigFile   = "CONFIG_FILE"

	// PriorityConfigDir 优先级配置目录
	PriorityConfigDir = "PRIORITY_CONFIG"

	// JwtPubkeyPath JWT公钥路径
	JwtPubkeyPath = "JWT_PUBKEY_PATH"

	// UseTLS TLS 配置
	UseTLS    = "USE_TLS"    // 是否使用TLS
	UseHttp3  = "USE_HTTP3"  // 是否使用HTTP/3
	HTTPPort  = "HTTP_PORT"  // TCP for HTTP/1.1 & HTTP/2
	HTTP3Port = "HTTP3_PORT" // UDP for HTTP/3
	TlsDir    = "TLS_DIR"
	CrtFile   = "CRT_FILE_PATH"
	KeyFile   = "KEY_FILE_PATH"

	PoliciesfilePath = "POLICIES_FILE_PATH"
	ModelFilePath    = "MODEL_FILE_PATH"

	CasdoorUrl = "CASDOOR_URL"

	// RBAC 角色缓存的 Redis（L2）。
	// ⚠️ 它必须部署在**网关这一侧**：网关跑在局域网集群里，而 Casdoor 在公网 VPS，
	// 缓存的全部意义就是省掉那一跳跨公网调用。把 Redis 放到 Casdoor 同机等于
	// 读缓存也要跨公网，一点都不省，还要多暴露一个 6379 端口。
	// 留空 = 不启用 L2，只用进程内 L1（单副本时完全够用）。
	RedisAddr     = "REDIS_ADDR"
	RedisPassword = "REDIS_PASSWORD"
	RedisDB       = "REDIS_DB"
	// RedisTLSCAFile 集群内 Redis 开了原生 TLS（service 端口 6379 → 容器 6380 的 TLS 口），
	// 留空则不启用 TLS。
	RedisTLSCAFile = "REDIS_TLS_CA_FILE"
	// RbacRoleCacheTTL 角色缓存有效期，如 "5m"。留空取默认 5 分钟。
	// 权衡：调大省 Casdoor 调用，但 Casdoor 侧改了角色要等这么久才生效。
	RbacRoleCacheTTL = "RBAC_ROLE_CACHE_TTL"

	Debug = "Debug"

	// ServiceName 服务名
	ServiceName = "SERVICE_NAME"
	// ServiceAddr 服务地址
	ServiceAddr = "SERVICE_ADDR"
	// ServicePort 服务端口
	ServicePort = "SERVICE_PORT"
	// ServiceWeight 服务权重
	ServiceWeight = "SERVICE_WEIGHT"

	// ServiceTags 服务标签
	ServiceTags            = "SERVICE_TAGS"
	ProxyReadHeaderTimeout = "PROXY_READ_HEADER_TIMEOUT"
	ProxyReadTimeout       = "PROXY_READ_TIMEOUT"
	ProxyWriteTimeout      = "PROXY_WRITE_TIMEOUTT"
	ProxyIdleTimeout       = "PROXY_IDLE_TIMEOUT"
)

const (
	ConfigSourceFile         = "file"
	ConfigSourceConfigCenter = "config_center"
)

// 默认值
const (
	// ConfigDir 配置目录
	ConfigDir = "configs"

	// SecretsDirName 密钥目录, jwt公钥
	SecretsDirName    = "secrets"
	JwtPublicFileName = "public.pem"

	UserOwnerMetadataKey = "x-md-global-owner"
	UserNameMetadataKey  = "x-md-global-name"
	UserRoleMetadataKey  = "x-md-global-role"
	UserIdMetadataKey    = "x-md-global-user-id"

	// PoliciesDirName 权限策略目录
	PoliciesDirName   = "policies"
	PoliciesfileName  = "policies.csv"
	ModelFileFileName = "model.conf"

	TlsDirName       = "tls"
	DefaultHTTPPort  = ":8080" // TCP for HTTP/1.1 & HTTP/2
	DefaultHTTP3Port = ":443"  // UDP for HTTP/3
	CrtFileName      = "gateway.crt"
	KeyFileName      = "gateway.key"
)
