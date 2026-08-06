package config

import (
	"bytes"
	"context"
	"fmt"

	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/payment/internal/pkg/env"
	"github.com/spf13/viper"
)

// Source 配置数据源:负责把整份 Bootstrap 配置(一份 YAML 文本)取回来。
//
// 每个实现放在自己的 source_*.go 里,自带环境变量解析与客户端构造,
// 彼此不共享任何状态 —— 删掉其中一个文件,另一个仍能独立编译运行。
// 新增数据源(如 etcd、Nacos、本地文件)只需实现本接口,再到 NewSource 加一个分支。
type Source interface {
	// Name 数据源标识,与 CONFIG_SOURCE 的取值一致。
	Name() string
	// Load 拉取整份 Bootstrap 配置,返回 viper 扁平化后的 map。
	Load(ctx context.Context) (map[string]any, error)
}

// WatchEvent 一次配置推送。
//
// 三种情况互斥:Err 非空表示这一条推送处理失败(如内容不是合法 YAML),
// Deleted 表示配置项在配置中心被删除,其余情况 Raw 为解析好的新配置。
type WatchEvent struct {
	Raw     map[string]any // Deleted 或 Err 非空时为 nil
	Deleted bool
	Err     error
}

// Watcher 可选能力:数据源支持变更推送时实现它。用类型断言发现,
// 不实现的数据源(consul)保持「启动读一次」语义,源文件一行不改
// —— 沿用本文件既有约定:删掉任一 source_*.go,另一个仍能独立编译。
//
// 实现方负责断线重连,Watch 只在 ctx 取消或遇到不可恢复的错误时返回。
// 单条事件的错误经 WatchEvent.Err 上报,不中断整个订阅
// —— 别人写坏一次配置不该让本服务从此收不到后续的修正。
type Watcher interface {
	Watch(ctx context.Context, onEvent func(WatchEvent)) error
}

// NewSource 按 CONFIG_SOURCE 选择数据源,未设置时用 constants.DefaultConfigSource。
//
// 刻意不做「主源失败自动降级到备源」:配置来源必须是确定的。静默降级会让服务
// 拿着一份你以为早已废弃的配置正常跑起来,比直接启动失败难排查得多。
func NewSource() (Source, error) {
	if sourceConfigFile := env.GetEnvString(constants.EnvConfigSourceFile, ""); sourceConfigFile != "" {
		return NewSDKSource(sourceConfigFile)
	}

	name := env.GetEnvString(constants.EnvConfigSource, constants.DefaultConfigSource)
	switch name {
	case constants.ConfigSourceConsul:
		return NewConsulSource()
	case constants.ConfigSourceConfigCenter:
		return nil, fmt.Errorf("%s=%s is deprecated; set %s to a local SourceConfig file instead",
			constants.EnvConfigSource, constants.ConfigSourceConfigCenter, constants.EnvConfigSourceFile)
	default:
		return nil, fmt.Errorf("unknown %s=%q, expect %q or %q",
			constants.EnvConfigSource, name,
			constants.ConfigSourceConsul, constants.ConfigSourceConfigCenter)
	}
}

// parseYAMLToMap 将 YAML 文档解析为 viper 扁平 map,供 decodeConfig 填充 Bootstrap。
// 两个数据源取回的都是同一份 YAML 文本,差别只在从哪儿取,故解析逻辑共用。
func parseYAMLToMap(data []byte) (map[string]any, error) {
	v := viper.New()
	v.SetConfigType(constants.ConfigFileFormat)
	if err := v.ReadConfig(bytes.NewBuffer(data)); err != nil {
		return nil, err
	}
	return v.AllSettings(), nil
}
