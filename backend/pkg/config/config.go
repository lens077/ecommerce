package config

import (
	"context"
	"fmt"
	"reflect"
	"time"

	"buf.build/go/protovalidate"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/mitchellh/mapstructure"
	"github.com/spf13/viper"
	"go.uber.org/fx"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/durationpb"
)

// RestartRequiredSection identifies a configuration section that is applied only on restart.
type RestartRequiredSection struct {
	Name    string
	Message proto.Message
}

// RestartRequiredProjects extracts restart-only sections from a service Bootstrap.
type RestartRequiredProjector[T proto.Message] func(T) []RestartRequiredSection

// Module wires one concrete protobuf Bootstrap type into Fx.
func Module[T proto.Message](restartRequired RestartRequiredProjector[T]) fx.Option {
	return fx.Module("config",
		fx.Provide(
			func(lc fx.Lifecycle) (*Live[T], error) {
				ctx, cancel := context.WithCancel(context.Background())
				lc.Append(fx.Hook{OnStop: func(context.Context) error {
					cancel()
					return nil
				}})

				source, err := NewSource()
				if err != nil {
					return nil, err
				}
				return NewWithContext[T](ctx, source)
			},
			func(live *Live[T]) T { return live.Get() },
		),
		fx.Invoke(func(lc fx.Lifecycle, logger *zap.Logger, live *Live[T]) {
			startWatch(lc, logger, live, restartRequired)
		}),
	)
}

// New loads, decodes, and validates one Bootstrap from src.
func New[T proto.Message](src Source) (*Live[T], error) {
	return NewWithContext[T](context.Background(), src)
}

// NewWithContext is New with an explicit load context.
func NewWithContext[T proto.Message](ctx context.Context, src Source) (*Live[T], error) {
	if src == nil {
		return nil, fmt.Errorf("config source is nil")
	}

	rawConfig, err := src.Load(ctx)
	if err != nil {
		return nil, err
	}

	localConfig := newMessage[T]()
	if err := decodeConfig(rawConfig, localConfig); err != nil {
		return nil, fmt.Errorf("decode bootstrap from %s: %w", src.Name(), err)
	}
	if err := validateMessage(localConfig); err != nil {
		return nil, fmt.Errorf("validate bootstrap from %s: %w", src.Name(), err)
	}

	live := NewLive(localConfig)
	live.source = src
	return live, nil
}

func decodeConfig[T proto.Message](data map[string]any, target T) error {
	v := viper.New()
	v.SetConfigType(constants.ConfigFileFormat)
	for key, value := range data {
		v.Set(key, value)
	}

	stringToProtoDurationHook := func(from reflect.Type, to reflect.Type, data any) (any, error) {
		if from.Kind() != reflect.String || to != reflect.TypeOf(&durationpb.Duration{}) {
			return data, nil
		}
		duration, err := time.ParseDuration(data.(string))
		if err != nil {
			return nil, err
		}
		return durationpb.New(duration), nil
	}

	decoder, err := mapstructure.NewDecoder(&mapstructure.DecoderConfig{
		TagName:     "json",
		ErrorUnused: true,
		DecodeHook:  mapstructure.ComposeDecodeHookFunc(stringToProtoDurationHook),
		Result:      target,
	})
	if err != nil {
		return err
	}
	return decoder.Decode(v.AllSettings())
}

func validateMessage[T proto.Message](message T) error {
	return protovalidate.Validate(message)
}

func startWatch[T proto.Message](
	lc fx.Lifecycle,
	logger *zap.Logger,
	live *Live[T],
	restartRequired RestartRequiredProjector[T],
) {
	log := logger.Named("configWatch")

	watcher, ok := live.source.(Watcher)
	if !ok {
		log.Info("当前配置数据源不支持变更推送,配置仅在启动时加载一次",
			zap.String("source", live.SourceName()))
		return
	}

	if restartRequired != nil {
		live.Subscribe(func(old, cur T) {
			warnNotHotReloadable(log, restartRequired(old), restartRequired(cur))
		})
	}

	ctx, cancel := context.WithCancel(context.Background())
	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			go func() {
				err := watcher.Watch(ctx, func(event WatchEvent) {
					switch {
					case event.Err != nil:
						log.Error("收到一条无法处理的配置推送,保留当前配置", zap.Error(event.Err))
					case event.Deleted:
						log.Error("配置项已在配置中心被删除,继续沿用当前配置",
							zap.String("source", live.SourceName()))
					default:
						cur := newMessage[T]()
						if err := decodeConfig(event.Raw, cur); err != nil {
							log.Error("热更新配置解码失败,保留当前配置", zap.Error(err))
							return
						}
						if err := live.validate(cur); err != nil {
							log.Error("热更新配置未通过 conf.proto 校验,保留当前配置", zap.Error(err))
							return
						}
						live.Set(cur)
						log.Info("配置已热更新", zap.String("source", live.SourceName()))
					}
				})
				if err != nil && ctx.Err() == nil {
					log.Error("配置变更订阅已退出,本服务将停留在最后一份已知配置", zap.Error(err))
				}
			}()
			return nil
		},
		OnStop: func(context.Context) error {
			cancel()
			return nil
		},
	})
}

func warnNotHotReloadable(log *zap.Logger, oldSections, curSections []RestartRequiredSection) {
	current := make(map[string]proto.Message, len(curSections))
	for _, section := range curSections {
		current[section.Name] = section.Message
	}
	for _, old := range oldSections {
		cur, ok := current[old.Name]
		if !ok || !proto.Equal(old.Message, cur) {
			log.Warn("该配置段已变更,但需要重启服务才会生效", zap.String("section", old.Name))
		}
	}
}
