// Package gorse 是 gorse 推荐引擎 RESTful API 的最小客户端。
//
// 没有直接用官方的 github.com/gorse-io/gorse-go,原因有二:
//  1. 官方 SDK 只发了 v0.5.0-alpha.x,README 自己写着 "This SDK is unstable currently";
//  2. 官方 SDK 没有 PUT /api/feedback。gorse 的 POST 是把 Value 累加、PUT 是覆盖,
//     而我们的 dwell/cart/purchase 必须走覆盖语义,只有 read 需要累加(配合 read>=3 表达式)。
//
// 请求/响应的 JSON 字段名严格对齐 gorse 服务端(首字母大写),不要改。
package gorse

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// Feedback 对应 gorse 的反馈记录。
// 唯一键是 (FeedbackType, UserId, ItemId) 三元组,同一组合重复写入不会产生多行。
type Feedback struct {
	FeedbackType string    `json:"FeedbackType"`
	UserId       string    `json:"UserId"`
	ItemId       string    `json:"ItemId"`
	Value        float64   `json:"Value"`
	Timestamp    time.Time `json:"Timestamp"`
}

// Item 对应 gorse 的物料。
// 下架/售罄用 IsHidden 而不是删除,否则历史反馈会跟着失效。
type Item struct {
	ItemId     string    `json:"ItemId"`
	IsHidden   bool      `json:"IsHidden"`
	Labels     any       `json:"Labels"`
	Categories []string  `json:"Categories"`
	Timestamp  time.Time `json:"Timestamp"`
	Comment    string    `json:"Comment"`
}

// User 对应 gorse 的用户画像。Labels 可放搜索意图词、常逛品类等。
type User struct {
	UserId  string `json:"UserId"`
	Labels  any    `json:"Labels"`
	Comment string `json:"Comment"`
}

// Score 是召回结果,Id 为 ItemId。
type Score struct {
	Id    string  `json:"Id"`
	Score float64 `json:"Score"`
}

type rowAffected struct {
	RowAffected int `json:"RowAffected"`
}

// Client 是 gorse 的 HTTP 客户端,并发安全。
type Client struct {
	endpoint string
	apiKey   string
	hc       *http.Client
}

// New 创建客户端。endpoint 形如 http://gorse:8088,末尾斜杠会被去掉。
func New(endpoint, apiKey string, timeout time.Duration) *Client {
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return &Client{
		endpoint: strings.TrimRight(endpoint, "/"),
		apiKey:   apiKey,
		hc: &http.Client{
			Timeout:   timeout,
			Transport: otelhttp.NewTransport(http.DefaultTransport),
		},
	}
}

// InsertFeedback 累加写入(POST)。Value 会加到已有值上,用于 read 这类需要计次的类型。
func (c *Client) InsertFeedback(ctx context.Context, fb []Feedback) (int, error) {
	if len(fb) == 0 {
		return 0, nil
	}
	var out rowAffected
	err := c.do(ctx, http.MethodPost, "/api/feedback", nil, fb, &out)
	return out.RowAffected, err
}

// PutFeedback 覆盖写入(PUT)。Value 直接替换,用于 dwell/cart/purchase 这类不该累加的类型。
func (c *Client) PutFeedback(ctx context.Context, fb []Feedback) (int, error) {
	if len(fb) == 0 {
		return 0, nil
	}
	var out rowAffected
	err := c.do(ctx, http.MethodPut, "/api/feedback", nil, fb, &out)
	return out.RowAffected, err
}

// UpsertItems 批量写入物料,已存在则覆盖。
func (c *Client) UpsertItems(ctx context.Context, items []Item) (int, error) {
	if len(items) == 0 {
		return 0, nil
	}
	var out rowAffected
	err := c.do(ctx, http.MethodPost, "/api/items", nil, items, &out)
	return out.RowAffected, err
}

// UpsertUsers 批量写入用户画像,已存在则覆盖。
func (c *Client) UpsertUsers(ctx context.Context, users []User) (int, error) {
	if len(users) == 0 {
		return 0, nil
	}
	var out rowAffected
	err := c.do(ctx, http.MethodPost, "/api/users", nil, users, &out)
	return out.RowAffected, err
}

// Recommend 个性化召回。category 留空表示不限品类。
// 带 X-API-Version: 2 才会返回分数,否则 gorse 只回 ItemId 字符串数组。
func (c *Client) Recommend(ctx context.Context, userID, category string, n, offset int) ([]Score, error) {
	q := url.Values{}
	if category != "" {
		q.Add("category", category)
	}
	q.Set("n", strconv.Itoa(n))
	q.Set("offset", strconv.Itoa(offset))

	var out []Score
	err := c.do(ctx, http.MethodGet,
		"/api/recommend/"+url.PathEscape(userID)+"?"+q.Encode(),
		map[string]string{"X-API-Version": "2"}, nil, &out)
	return out, err
}

// SessionRecommend 会话召回:直接拿本次会话的临时反馈换推荐,不落库、不等离线训练。
// 匿名用户和刚注册的新用户走这条路。
func (c *Client) SessionRecommend(ctx context.Context, fb []Feedback, n int) ([]Score, error) {
	var out []Score
	err := c.do(ctx, http.MethodPost,
		"/api/session/recommend?n="+strconv.Itoa(n), nil, fb, &out)
	return out, err
}

// Neighbors 相似物料召回,不依赖用户画像。
func (c *Client) Neighbors(ctx context.Context, itemID, category string, n, offset int) ([]Score, error) {
	path := "/api/item/" + url.PathEscape(itemID) + "/neighbors"
	if category != "" {
		path += "/" + url.PathEscape(category)
	}
	path += "?n=" + strconv.Itoa(n) + "&offset=" + strconv.Itoa(offset)

	var out []Score
	err := c.do(ctx, http.MethodGet, path, nil, nil, &out)
	return out, err
}

// LatestItems 最新物料,用于完全没有信号时的兜底。
func (c *Client) LatestItems(ctx context.Context, userID, category string, n, offset int) ([]Score, error) {
	path := "/api/latest"
	if category != "" {
		path += "/" + url.PathEscape(category)
	}
	q := url.Values{}
	q.Set("n", strconv.Itoa(n))
	q.Set("offset", strconv.Itoa(offset))
	if userID != "" {
		q.Set("user-id", userID)
	}

	var out []Score
	err := c.do(ctx, http.MethodGet, path+"?"+q.Encode(), nil, nil, &out)
	return out, err
}

// Healthz 探活,供服务启动时的健康检查使用。
func (c *Client) Healthz(ctx context.Context) error {
	var out map[string]any
	return c.do(ctx, http.MethodGet, "/api/health/ready", nil, nil, &out)
}

func (c *Client) do(ctx context.Context, method, path string, headers map[string]string, body, out any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("gorse: marshal request body: %w", err)
		}
		reader = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.endpoint+path, reader)
	if err != nil {
		return fmt.Errorf("gorse: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("X-API-Key", c.apiKey)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := c.hc.Do(req)
	if err != nil {
		return fmt.Errorf("gorse: %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	// 响应体不大(最多几百个 ItemId),整体读出来便于把错误正文带进日志
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return fmt.Errorf("gorse: read response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("gorse: %s %s: unexpected status %d: %s",
			method, path, resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("gorse: decode response: %w", err)
	}
	return nil
}
