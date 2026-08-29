// dnsprobe：在 mirrord targetless 会话下验证「本地进程获得集群 DNS 与出站网络」。
// 直接 go run 时（不套 mirrord）应当全部 FAIL——这本身就是对照组。
package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"
)

func main() {
	names := []string{
		"kubernetes.default.svc.cluster.local",
		"ecommerce-cart-service.ecommerce.svc.cluster.local",
		"config-center.config-center.svc.cluster.local",
		"consul-server.consul.svc.cluster.local",
	}
	for _, name := range names {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		addrs, err := net.DefaultResolver.LookupHost(ctx, name)
		cancel()
		if err != nil {
			fmt.Printf("DNS  FAIL %-55s %v\n", name, err)
			continue
		}
		fmt.Printf("DNS  PASS %-55s %v\n", name, addrs)
	}

	// 出站 TCP：经 agent 直连 Config Center Service 端口
	dialer := net.Dialer{Timeout: 5 * time.Second}
	if conn, err := dialer.Dial("tcp", "config-center.config-center.svc.cluster.local:30010"); err != nil {
		fmt.Printf("TCP  FAIL config-center:30010 %v\n", err)
	} else {
		fmt.Printf("TCP  PASS config-center:30010 -> %s\n", conn.RemoteAddr())
		_ = conn.Close()
	}

	// 出站 HTTP：经 Service ClusterIP 名义访问 cart /healthz（出站路径，区别于入站拦截）
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get("http://ecommerce-cart-service.ecommerce.svc.cluster.local:30006/healthz")
	if err != nil {
		fmt.Printf("HTTP FAIL cart /healthz via ClusterIP svc %v\n", err)
		return
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 200))
	_ = resp.Body.Close()
	fmt.Printf("HTTP PASS cart /healthz via ClusterIP svc status=%d body=%.80s\n", resp.StatusCode, body)
}
