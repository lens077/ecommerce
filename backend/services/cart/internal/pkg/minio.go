package pkg

import (
	"net/url"
	"strings"

	confv1 "github.com/lens077/ecommerce/backend/services/cart/internal/conf/v1"
)

// FormatObjectURL 将相对 Key 转换为带有正确域名的绝对 URL
func FormatObjectURL(bucket, relativeKey string, cfg *confv1.Store) string {
	if relativeKey == "" {
		return ""
	}

	if strings.HasPrefix(relativeKey, "http://") || strings.HasPrefix(relativeKey, "https://") || strings.HasPrefix(relativeKey, "//") {
		return relativeKey
	}

	if cfg == nil || cfg.Minio == nil {
		return relativeKey
	}

	var baseURL string

	// 查找该 bucket 是否有专属域名
	if cfg.Minio.Buckets != nil {
		baseURL = cfg.Minio.Buckets[bucket]
	}

	// 降级逻辑：若没有专属域名，使用 DefaultDomain + bucket 拼接
	if baseURL == "" {
		if cfg.Minio.DefaultDomain == "" {
			return relativeKey // 没有基础配置时保底返回原 key
		}

		var err error
		// 使用 url.JoinPath 自动规范化斜杠处理
		baseURL, err = url.JoinPath(cfg.Minio.DefaultDomain, bucket)
		if err != nil {
			baseURL = strings.TrimSuffix(cfg.Minio.DefaultDomain, "/") + "/" + bucket
		}
	}

	// 拼接最终的完整 URL（优雅处理双斜杠问题）
	fullURL, err := url.JoinPath(baseURL, relativeKey)
	if err != nil {
		// 回退手动清理斜杠保底
		return strings.TrimSuffix(baseURL, "/") + "/" + strings.TrimPrefix(relativeKey, "/")
	}

	return fullURL
}
