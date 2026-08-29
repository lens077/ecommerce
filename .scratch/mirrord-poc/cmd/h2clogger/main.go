// h2clogger：绑定 cart 的容器端口 30006，把收到的每个请求打一行日志。
// 用途：
//   - mirror 模式下作为「本地接收镜像流量」的观察器（本地响应会被 mirrord 丢弃）；
//   - steal 模式下作为本地接管方，返回可辨识的 "poc-local-reply" 响应体。
// 通过 Go 1.24+ 的 http.Protocols 同时受理 HTTP/1.1 与 H2C（明文 HTTP/2），
// 与 cart 真身的 h2c 行为一致，可验证 ConnectRPC H2C 流量镜像。
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("RECV proto=%s method=%s path=%s remote=%s poc-header=%q ua=%q",
			r.Proto, r.Method, r.URL.Path, r.RemoteAddr,
			r.Header.Get("x-mirrord-poc"), r.Header.Get("User-Agent"))
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		fmt.Fprintf(w, "poc-local-reply %s %s\n", r.Proto, r.URL.Path)
	})

	srv := &http.Server{Addr: ":30006", Handler: handler}
	protocols := new(http.Protocols)
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true) // H2C
	srv.Protocols = protocols

	log.Printf("h2clogger listening on :30006 (HTTP/1.1 + H2C) pid=%d", os.Getpid())
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("listen failed: %v", err)
	}
}
