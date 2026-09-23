package data

import (
	"context"
	"errors"
	"fmt"
	"net"
	"testing"
)

// Casdoor 不可达必须保持为依赖故障；只有 Casdoor 回了响应、明确拒绝时才算认证失败。
// 否则 Casdoor 宕机会被 service 层映射成 unauthenticated，伪装成「用户授权码无效」。
func TestIsTransportError(t *testing.T) {
	dialErr := &net.OpError{Op: "dial", Net: "tcp", Err: errors.New("connection refused")}
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"连接被拒", fmt.Errorf("Post token: %w", dialErr), true},
		{"超时", fmt.Errorf("exchange: %w", context.DeadlineExceeded), true},
		{"取消", context.Canceled, true},
		{"invalid_grant 拒绝", errors.New(`oauth2: "invalid_grant" "authorization code is invalid"`), false},
		{"Casdoor 在 token 中返回错误", errors.New("invalid code"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isTransportError(tt.err); got != tt.want {
				t.Fatalf("isTransportError(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}
