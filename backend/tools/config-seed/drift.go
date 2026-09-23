package main

// drift.go: -drift 模式，把 Config Center 里各服务实际配置的外部端点与 .service-matrix.yaml 对比。
//
// 触发事故(2026-09-23):Config Center product/dev 的 recommend.gorse.endpoint 还是 gorse
// 退役前的公网 IP 直连端口(node2 早已只绑回环),api_key 为空;服务照常启动,商品同步每轮
// connection refused,behavior 侧同样空 key 报 401。matrix 的 product 条目早就用一句备注写着
// 这条漂移,但备注不会让任何检查变红。本模式把「端点应该是什么」变成可执行的比对。
//
// 只检查服务在 matrix services.<svc>.external 里**已声明**的依赖:未声明的(如所有服务都带着
// 但 CONSUL_ENABLED=false 的 discovery.consul)不在 matrix 的接线语义里,比了只有噪音。
// 输出只含服务、配置路径、依赖名、主机与判定;IP 字面量打码,任何配置值都不输出。

import (
	"fmt"
	"net"
	"net/url"
	"sort"
	"strconv"
	"strings"
)

type driftMatrix struct {
	Services map[string]struct {
		External []string `yaml:"external"`
	} `yaml:"services"`
	Externals map[string]struct {
		Host      string `yaml:"host"`
		RemoteDev string `yaml:"remote_dev"`
	} `yaml:"externals"`
	RetiredExternals map[string]struct {
		FormerHost string `yaml:"former_host"`
	} `yaml:"retired_externals"`
}

// endpointRule: 某个外部依赖在 Bootstrap 里的位置,以及启用时必须非空的凭据。
type endpointRule struct {
	external  string
	path      []string // 端点所在的映射路径
	field     string   // endpoint/addr 为 URL 或 host:port;空表示 host+port 两个字段
	enabled   []string // 非空时:该布尔为 false 就整条跳过
	secretKey string   // 启用时必须非空的字段(与 path 同级)
}

var endpointRules = []endpointRule{
	{external: "postgres", path: []string{"data", "database", "postgres"}},
	{external: "redis", path: []string{"data", "cache", "redis"}},
	{
		external: "gorse", path: []string{"recommend", "gorse"}, field: "endpoint",
		enabled: []string{"recommend", "gorse", "enable"}, secretKey: "api_key",
	},
	{external: "elasticsearch", path: []string{"search", "catalog"}, field: "endpoint"},
	{external: "casdoor", path: []string{"auth", "casdoor"}, field: "endpoint"},
}

type driftFinding struct {
	service  string
	path     string
	external string
	kind     string // IP_LITERAL / NOT_IN_MATRIX / RETIRED / EMPTY_SECRET / UNPARSABLE
	got      string // 已打码
	allowed  string
}

func (f driftFinding) String() string {
	s := fmt.Sprintf("DRIFT   %-10s %-28s external=%s kind=%s", f.service, f.path, f.external, f.kind)
	if f.got != "" {
		s += " got=" + f.got
	}
	if f.allowed != "" {
		s += " allowed=" + f.allowed
	}
	return s
}

// auditDrift 对单个服务的 Bootstrap 做比对,返回漂移与已核对的检查项数。
func auditDrift(service string, doc map[string]any, m driftMatrix) (findings []driftFinding, checked int) {
	declared := map[string]bool{}
	for _, ext := range m.Services[service].External {
		declared[ext] = true
	}
	retired := map[string]bool{}
	for _, r := range m.RetiredExternals {
		if h, _, ok := parseEndpoint(r.FormerHost); ok {
			retired[h] = true
		}
	}

	for _, rule := range endpointRules {
		if !declared[rule.external] {
			continue
		}
		block, ok := lookup(doc, rule.path).(map[string]any)
		if !ok {
			continue // 服务没配这一段,由 conf.proto 的 required 负责,不在这里重复
		}
		if rule.enabled != nil {
			if on, _ := lookup(doc, rule.enabled).(bool); !on {
				continue
			}
		}
		checked++
		pathStr := strings.Join(rule.path, ".")
		if rule.field != "" {
			pathStr += "." + rule.field
		}

		raw := endpointOf(block, rule.field)
		host, port, ok := parseEndpoint(raw)
		ext := m.Externals[rule.external]
		allowedList := allowedEndpoints(ext.Host, ext.RemoteDev)
		base := driftFinding{service: service, path: pathStr, external: rule.external, allowed: formatAllowed(allowedList)}

		switch {
		case !ok:
			f := base
			f.kind = "UNPARSABLE"
			findings = append(findings, f)
		case retired[host]:
			f := base
			f.kind, f.got = "RETIRED", mask(host, port)
			findings = append(findings, f)
		case !matchesAny(host, port, allowedList):
			f := base
			f.kind, f.got = "NOT_IN_MATRIX", mask(host, port)
			if net.ParseIP(host) != nil {
				f.kind = "IP_LITERAL"
			}
			findings = append(findings, f)
		}

		if rule.secretKey != "" {
			if v, _ := block[rule.secretKey].(string); strings.TrimSpace(v) == "" {
				findings = append(findings, driftFinding{
					service: service, path: strings.Join(rule.path, ".") + "." + rule.secretKey,
					external: rule.external, kind: "EMPTY_SECRET",
				})
			}
		}
	}
	return findings, checked
}

type hostPort struct{ host, port string }

func allowedEndpoints(values ...string) []hostPort {
	var out []hostPort
	for _, v := range values {
		if h, p, ok := parseEndpoint(v); ok {
			out = append(out, hostPort{h, p})
		}
	}
	return out
}

// matchesAny: 主机必须相同;matrix 写了端口才比端口。
func matchesAny(host, port string, allowed []hostPort) bool {
	for _, a := range allowed {
		if a.host == host && (a.port == "" || a.port == port) {
			return true
		}
	}
	return false
}

// parseEndpoint 解析 URL、host:port 或裸 host。matrix 的 host 字段可能是
// 「http://x:9200（集群内…）」这种带说明的文本,只取第一个 token。
func parseEndpoint(raw string) (host, port string, ok bool) {
	s := strings.TrimSpace(raw)
	if i := strings.IndexAny(s, " \t（("); i >= 0 {
		s = s[:i]
	}
	if s == "" {
		return "", "", false
	}
	if strings.Contains(s, "://") {
		u, err := url.Parse(s)
		if err != nil || u.Hostname() == "" {
			return "", "", false
		}
		port = u.Port()
		if port == "" {
			switch u.Scheme {
			case "https":
				port = "443"
			case "http":
				port = "80"
			}
		}
		return strings.ToLower(u.Hostname()), port, true
	}
	if h, p, err := net.SplitHostPort(s); err == nil {
		return strings.ToLower(h), p, true
	}
	return strings.ToLower(s), "", true
}

func endpointOf(block map[string]any, field string) string {
	if field != "" {
		v, _ := block[field].(string)
		return v
	}
	host, _ := block["host"].(string)
	switch p := block["port"].(type) {
	case int:
		return net.JoinHostPort(host, strconv.Itoa(p))
	case string:
		if p != "" {
			return net.JoinHostPort(host, p)
		}
	}
	return host
}

func lookup(doc map[string]any, path []string) any {
	var cur any = doc
	for _, key := range path {
		m, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = m[key]
	}
	return cur
}

// mask 把 IP 字面量换成占位符:公网地址不进终端与工具日志(同 scripts/verify-public-ips.py 的纪律)。
func mask(host, port string) string {
	if net.ParseIP(host) != nil {
		host = "<ip-literal>"
	}
	if port == "" {
		return host
	}
	return host + ":" + port
}

func formatAllowed(list []hostPort) string {
	parts := make([]string, 0, len(list))
	for _, a := range list {
		parts = append(parts, mask(a.host, a.port))
	}
	sort.Strings(parts)
	return strings.Join(parts, ",")
}
