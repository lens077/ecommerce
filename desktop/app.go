package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// AuthData 用于存储认证信息
type AuthData struct {
	Token     string    `json:"token"`
	Username  string    `json:"username"`
	ExpiresAt time.Time `json:"expires_at"`
}

// 全局变量存储认证信息
var authData *AuthData

// 验证挑战响应
func verifyChallengeResponse(challenge, username, response string) bool {
	// 计算当前时间窗口（30秒一个窗口）
	timeWindow := time.Now().Unix() / 30
	// 计算期望的挑战响应
	data := fmt.Sprintf("%s:%s:%d", challenge, username, timeWindow)
	hash := sha256.Sum256([]byte(data))
	expectedResponse := hex.EncodeToString(hash[:])

	// 使用恒定时间比较防止时序攻击
	return constantTimeCompare(response, expectedResponse)
}

// 恒定时间比较函数，防止时序攻击
func constantTimeCompare(a, b string) bool {
	if len(a) != len(b) {
		return false
	}

	result := 0
	for i := 0; i < len(a); i++ {
		result |= int(a[i]) ^ int(b[i])
	}

	return result == 0
}

// handleCustomProtocolURL 解析并处理自定义协议URL
func (a *App) handleCustomProtocolURL(fullURL string) {
	parsedURL, err := url.Parse(fullURL)
	if err != nil {
		log.Printf("解析URL出错: %v", err)
		return
	}

	// 确保是我们处理的协议
	if parsedURL.Scheme != "desktop-connect-login-example" {
		return
	}

	// 提取查询参数
	queryParams := parsedURL.Query()
	authToken := queryParams.Get("token")
	username := queryParams.Get("username")
	state := queryParams.Get("state")
	challenge := queryParams.Get("challenge")
	challengeResponse := queryParams.Get("challenge_response")

	// 验证挑战响应（如果提供了挑战和响应）
	if challenge != "" && challengeResponse != "" {
		if !verifyChallengeResponse(challenge, username, challengeResponse) {
			log.Println("挑战响应验证失败")
			return
		}
	}

	if authToken != "" && state == "authenticated" {
		// 存储认证信息
		authData = &AuthData{
			Token:     authToken,
			Username:  username,
			ExpiresAt: time.Now().Add(24 * time.Hour), // 24小时有效期
		}

		log.Printf("认证成功，用户: %s, Token: %s", username, authToken)

		// 发送事件到前端，通知登录成功
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "auth-success")

			// 显示窗口确保用户能看到认证信息
			runtime.WindowShow(a.ctx)
			runtime.WindowCenter(a.ctx)
		}
	} else {
		log.Println("收到协议请求，但缺少必要的认证参数")
	}
}

// GetAuthData 返回当前认证信息，供前端调用
func (a *App) GetAuthData() *AuthData {
	return authData
}

// Logout 清除认证信息
func (a *App) Logout() {
	authData = nil
	log.Println("用户已登出")

	// 通知前端更新UI
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "auth-logout")
	}
}

// OpenLoginPage 打开登录页面
func (a *App) OpenLoginPage() {
	// 生成随机挑战
	challengeBytes := make([]byte, 32)
	if _, err := rand.Read(challengeBytes); err != nil {
		log.Printf("生成挑战失败: %v", err)
		return
	}
	challenge := base64.StdEncoding.EncodeToString(challengeBytes)

	// 构建登录URL，包含挑战参数
	// TODO url
	// loginURL := fmt.Sprintf("http://localhost:3000?challenge=%s", url.QueryEscape(challenge))
	loginURL := fmt.Sprintf("http://47.119.157.17:3000?challenge=%s", url.QueryEscape(challenge))
	runtime.BrowserOpenURL(a.ctx, loginURL)
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// 确保应用在前台，以便接收协议调用
	runtime.WindowShow(ctx)

	// 监听自定义协议URL的打开事件
	runtime.EventsOn(ctx, "wails:open-url", func(optionalData ...interface{}) {
		log.Println("收到 wails:open-url 事件")
		if len(optionalData) > 0 {
			if urlStr, ok := optionalData[0].(string); ok {
				log.Printf("处理URL: %s", urlStr)
				a.handleCustomProtocolURL(urlStr)
			}
		}
	})

	// 检查是否有启动参数（协议调用）
	if len(os.Args) > 1 {
		for _, arg := range os.Args[1:] {
			if strings.HasPrefix(arg, "desktop-connect-login-example://") {
				log.Printf("启动参数中包含协议调用: %s", arg)
				a.handleCustomProtocolURL(arg)
				break
			}
		}
	}
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}
