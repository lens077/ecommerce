# 错误处理分层约定

> PG 错误码映射的工具层用法见 `backend/services/inventory/internal/pkg/dbutil/README.md`（10 服务同构复制的包，README 只在 inventory）。

> 从根 `DESIGN.md` 拆出（2026-08-08）。三层分工：biz 定义错误 → data 包装 → service 映射
> RPC 错误码。此约定已在 user 等服务落地，是全服务通用规范；
> service 层把下层错误码重包（如 CodeNotFound → CodeInternal）即违反本约定。

1. 由biz领域模型层定义错误
```go
var (
	ErrUserAlreadyExists = errors.New("[user] user already exists")
	ErrUserNotFound      = errors.New("[user] user not found")
	ErrAuthFailed        = errors.New("[user] authentication failed")
)
```
2. 基础设施层（data）一律用 `%w` 包装——**业务哨兵错误与底层错误都必须保持 `errors.Is` 可穿透**，service 层全靠 `errors.Is` 做错误码映射，用 `%v` 会切断整条映射链。（2026-08-26 修正：本条旧文写「业务错误用 %v」，与下方示例代码及 `STACK.md` 相反，按示例与 STACK 的 `%w` 收敛为唯一规则。）
```go
func (u userRepo) SignIn(_ context.Context, req biz.SignInRequest) (*biz.SignInResponse, error) {
	if u.auth == nil {
		return nil, fmt.Errorf("auth client is nil:%w", errors.New("config error"))
	}
	token, err := u.auth.GetOAuthToken(req.Code, req.State)
	if err != nil {
		return nil, fmt.Errorf("%w: casdoor get oauth token err: %w", biz.ErrAuthFailed, err)
	}
	u.l.Debug(token.AccessToken)
	return &biz.SignInResponse{
		State: "ok",
		Data:  token.AccessToken,
	}, nil
}
```
3. 在service接口层, 根据错误类型进行判断, 返回对应的RPC错误码
```go
func (s *UserService) SignIn(ctx context.Context, c *connect.Request[v1.SignInRequest]) (*connect.Response[v1.SignInResponse], error) {
	res, err := s.uc.SignIn(
		ctx,
		biz.SignInRequest{
			Code:  c.Msg.Code,
			State: c.Msg.State,
		},
	)
	if err != nil { // 根据业务错误类型映射状态码
		switch {
		case errors.Is(err, biz.ErrUserAlreadyExists):
			return nil, connect.NewError(connect.CodeAlreadyExists, err)
		case errors.Is(err, biz.ErrAuthFailed):
			return nil, connect.NewError(connect.CodeInvalidArgument, err)
		case errors.Is(err, biz.ErrUserNotFound):
			return nil, connect.NewError(connect.CodeNotFound, err)
		default:
			// 可以在这里包装一个具体的 Unknown 描述，或者直接返回
			return nil, connect.NewError(connect.CodeUnknown, err)
		}
	}

	response := &v1.SignInResponse{
		State: res.State,
		Data:  res.Data,
	}

	return connect.NewResponse(response), nil
}
```
那么在终端查询中就很明显:
例如:
```
2026-05-07T07:58:52.175+0800	ERROR	LoggingInterceptor	server/logging.go:37	rpc system error	{"rpc.procedure": "/user.v1.UserService/SignIn", "rpc.code": "internal", "trace_id": "aed4697527ce036e401912ad325bd3b2", "error": "internal: [user] authentication failed: casdoor get oauth token err: oauth2: \"invalid_grant\" \"authorization code: [1231] is invalid\""}
```

1. `2026-05-07T07:58:52.175+0800`: 发送错误的时间
2. `ERROR`: 日志等级
3. `rpc system error`: 需要关注的错误优先级
4. `trace_id`: 链路ID
5. `rpc.procedure`: 请求的路由
5. `rpc.code`: RPC错误码
6. `error`: 错误的具体内容
