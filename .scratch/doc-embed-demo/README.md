# 从源生成演示

本页不手抄 `optionsFromBootstrap`。下方代码块由 `scripts/doc-embed.py` 从 Go 源文件生成。

<!-- embed: backend/services/cart/internal/pkg/registry/consul.go go:func optionsFromBootstrap -->
```go
// optionsFromBootstrap maps the cart service configuration to shared registry options.
func optionsFromBootstrap(conf *confv1.Bootstrap) sharedregistry.Options {
	consul := conf.GetDiscovery().GetConsul()
	check := consul.GetCheck()
	ttl := check.GetTtl()

	return sharedregistry.Options{
		Enabled:       consul.GetAddr() != "",
		Address:       consul.GetAddr(),
		ServerAddress: conf.GetServer().GetAddr(),
		TLS: sharedregistry.TLSOptions{
			Enabled:            consul.GetTls().GetEnable(),
			InsecureSkipVerify: consul.GetTls().GetInsecureSkipVerify(),
			CAPEM:              consul.GetTls().GetCaPem(),
		},
		Check: sharedregistry.CheckOptions{
			TTL: sharedregistry.TTLCheckOptions{
				Enabled:      ttl != nil,
				Duration:     ttl.GetDuration(),
				PingInterval: ttl.GetPingInterval().AsDuration(),
			},
			GRPC: &sharedregistry.GRPCCheckOptions{
				Interval: ttl.GetPingInterval().AsDuration(),
			},
			DeregisterCriticalServiceAfter: check.GetDeregisterCriticalServiceAfter(),
		},
	}
}
```
<!-- /embed -->
