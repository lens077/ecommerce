package server

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	v1check "connect-go-example/api/check/v1"
	"connect-go-example/api/check/v1/checkv1connect"
	v1greet "connect-go-example/api/greet/v1"
	"connect-go-example/api/greet/v1/greetv1connect"
	conf "connect-go-example/internal/conf/v1"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/suite"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric/noop"
	"go.opentelemetry.io/otel/sdk/metric"
	nooptrace "go.opentelemetry.io/otel/trace/noop"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

// 为测试添加缺失的接口实现
var (
	_ greetv1connect.GreetServiceHandler = (*MockGreetService)(nil)
	_ checkv1connect.CheckServiceHandler = (*MockCheckService)(nil)
)

// MockGreetService 是 GreetService 的模拟实现
type MockGreetService struct {
	mock.Mock
}

func (m *MockGreetService) Register(ctx context.Context, req *connect.Request[v1greet.RegisterRequest]) (*connect.Response[v1greet.RegisterResponse], error) {
	args := m.Called(ctx, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*connect.Response[v1greet.RegisterResponse]), args.Error(1)
}

func (m *MockGreetService) GetAuthChallenge(ctx context.Context, req *connect.Request[v1greet.AuthChallengeRequest]) (*connect.Response[v1greet.AuthChallengeResponse], error) {
	args := m.Called(ctx, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*connect.Response[v1greet.AuthChallengeResponse]), args.Error(1)
}

func (m *MockGreetService) SubmitAuth(ctx context.Context, req *connect.Request[v1greet.SubmitAuthRequest]) (*connect.Response[v1greet.SubmitAuthResponse], error) {
	args := m.Called(ctx, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*connect.Response[v1greet.SubmitAuthResponse]), args.Error(1)
}

// MockCheckService 是 CheckService 的模拟实现
type MockCheckService struct {
	mock.Mock
}

func (m *MockCheckService) Ready(ctx context.Context, req *connect.Request[v1check.ReadyCheckReq]) (*connect.Response[v1check.ReadyCheckReply], error) {
	args := m.Called(ctx, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*connect.Response[v1check.ReadyCheckReply]), args.Error(1)
}

// testLifecycle 是用于测试的简单生命周期实现
type testLifecycle struct {
	hooks []fx.Hook
}

func (tl *testLifecycle) Append(hook fx.Hook) {
	tl.hooks = append(tl.hooks, hook)
}

// ServerTestSuite 是 Server 的测试套件
type ServerTestSuite struct {
	suite.Suite
	greetService *MockGreetService
	checkService *MockCheckService
	logger       *zap.Logger
	server       *http.Server
}

func (suite *ServerTestSuite) SetupTest() {
	suite.greetService = new(MockGreetService)
	suite.checkService = new(MockCheckService)
	suite.logger, _ = zap.NewDevelopment()

	// 设置 OpenTelemetry 提供者
	tracerProvider := nooptrace.NewTracerProvider()
	otel.SetTracerProvider(tracerProvider)

	meterProvider := noop.NewMeterProvider()
	otel.SetMeterProvider(meterProvider)

	cfg := &conf.Bootstrap{
		Server: &conf.Server{
			Http: &conf.Server_HTTP{
				Addr: ":8080",
			},
		},
	}

	// 创建监控中间件
	monitoringMiddleware := MonitoringMiddleware(suite.logger)

	// 创建 Connect 监控拦截器
	connectInterceptor := ConnectMonitoringInterceptor(suite.logger)

	// 创建一个简单的生命周期实现
	lc := &testLifecycle{}

	suite.server = NewHTTPServer(
		lc,
		cfg,
		suite.greetService,
		suite.checkService,
		suite.logger,
		monitoringMiddleware,
		connectInterceptor,
	)
}

func (suite *ServerTestSuite) TestMonitoringMiddleware() {
	// 创建一个简单的处理器
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// 包装处理器
	wrappedHandler := MonitoringMiddleware(suite.logger)(handler)

	// 创建测试请求
	req := httptest.NewRequest("GET", "/test", nil)
	recorder := httptest.NewRecorder()

	// 执行请求
	wrappedHandler.ServeHTTP(recorder, req)

	// 验证响应
	assert.Equal(suite.T(), http.StatusOK, recorder.Code)
	assert.Equal(suite.T(), "OK", recorder.Body.String())
}

func (suite *ServerTestSuite) TestConnectMonitoringInterceptor() {
	// 创建拦截器
	interceptor := ConnectMonitoringInterceptor(suite.logger)

	// 创建一个模拟的 UnaryFunc
	mockHandler := connect.UnaryFunc(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		return connect.NewResponse(&v1check.ReadyCheckReply{Status: "Ready"}), nil
	})

	// 包装处理器
	wrappedHandler := interceptor(mockHandler)

	// 创建模拟请求
	req := &connect.Request[v1check.ReadyCheckReq]{}

	// 执行请求
	resp, err := wrappedHandler(context.Background(), req)

	// 验证响应
	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), resp)
}

func (suite *ServerTestSuite) TestResponseWriter() {
	// 创建一个模拟的 ResponseWriter
	mockResponseWriter := httptest.NewRecorder()

	// 包装 ResponseWriter
	wrappedWriter := &responseWriter{
		ResponseWriter: mockResponseWriter,
		statusCode:     http.StatusOK,
	}

	// 测试 WriteHeader
	wrappedWriter.WriteHeader(http.StatusNotFound)
	assert.Equal(suite.T(), http.StatusNotFound, wrappedWriter.statusCode)

	// 测试 Write
	bytesWritten, err := wrappedWriter.Write([]byte("test"))

	assert.NoError(suite.T(), err)
	assert.Equal(suite.T(), 4, bytesWritten)
	assert.Equal(suite.T(), "test", mockResponseWriter.Body.String())
}

func (suite *ServerTestSuite) TestMiddlewareModule() {
	// 测试模块创建
	module := MiddlewareModule

	assert.NotNil(suite.T(), module)

	// 验证模块提供的函数
	app := fx.New(
		module,
		fx.Provide(func() *zap.Logger {
			logger, _ := zap.NewDevelopment()
			return logger
		}),
		fx.Invoke(func(monitoringMiddleware func(http.Handler) http.Handler, connectInterceptor connect.UnaryInterceptorFunc) {
			assert.NotNil(suite.T(), monitoringMiddleware)
			assert.NotNil(suite.T(), connectInterceptor)
		}),
	)

	assert.NoError(suite.T(), app.Err())
}

// 测试初始化指标
func (suite *ServerTestSuite) TestInitMetrics() {
	// 创建一个真实的 MeterProvider
	reader := metric.NewManualReader()
	meterProvider := metric.NewMeterProvider(metric.WithReader(reader))
	otel.SetMeterProvider(meterProvider)

	// 调用初始化函数
	err := initMetrics()

	assert.NoError(suite.T(), err)

	// 验证指标是否已创建
	assert.NotNil(suite.T(), requestCounter)
	assert.NotNil(suite.T(), requestDuration)
	assert.NotNil(suite.T(), errorCounter)
}

func (suite *ServerTestSuite) TestServerLifecycle() {
	// 测试服务器生命周期
	// ctx := context.Background()

	// 启动服务器（在测试中我们不会真正启动，只是验证创建）
	assert.NotNil(suite.T(), suite.server)
	assert.Equal(suite.T(), ":8080", suite.server.Addr)

	// 验证处理器链
	assert.NotNil(suite.T(), suite.server.Handler)
}

// 运行测试套件
func TestServerTestSuite(t *testing.T) {
	suite.Run(t, new(ServerTestSuite))
}

// 单元测试函数
func TestNewHTTPServer(t *testing.T) {
	logger, _ := zap.NewDevelopment()

	cfg := &conf.Bootstrap{
		Server: &conf.Server{
			Http: &conf.Server_HTTP{
				Addr: ":8080",
			},
		},
	}

	greetService := new(MockGreetService)
	checkService := new(MockCheckService)

	monitoringMiddleware := MonitoringMiddleware(logger)
	connectInterceptor := ConnectMonitoringInterceptor(logger)

	// 创建一个简单的生命周期
	lc := &testLifecycle{}

	server := NewHTTPServer(
		lc,
		cfg,
		greetService,
		checkService,
		logger,
		monitoringMiddleware,
		connectInterceptor,
	)

	assert.NotNil(t, server)
	assert.Equal(t, ":8080", server.Addr)
	assert.NotNil(t, server.Handler)
}

func TestMonitoringMiddlewareIntegration(t *testing.T) {
	logger, _ := zap.NewDevelopment()

	// 创建一个简单的处理器
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// 包装处理器
	wrappedHandler := MonitoringMiddleware(logger)(handler)

	// 测试正常请求
	req := httptest.NewRequest("GET", "/test", nil)
	recorder := httptest.NewRecorder()

	wrappedHandler.ServeHTTP(recorder, req)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "OK", recorder.Body.String())

	// 测试错误请求
	errorHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("Error"))
	})

	wrappedErrorHandler := MonitoringMiddleware(logger)(errorHandler)

	req2 := httptest.NewRequest("GET", "/error", nil)
	recorder2 := httptest.NewRecorder()

	wrappedErrorHandler.ServeHTTP(recorder2, req2)

	assert.Equal(t, http.StatusInternalServerError, recorder2.Code)
	assert.Equal(t, "Error", recorder2.Body.String())
}

func TestConnectMonitoringInterceptorIntegration(t *testing.T) {
	logger, _ := zap.NewDevelopment()

	// 创建拦截器
	interceptor := ConnectMonitoringInterceptor(logger)

	// 创建一个模拟的 UnaryFunc
	mockHandler := connect.UnaryFunc(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		return connect.NewResponse(&v1check.ReadyCheckReply{Status: "Ready"}), nil
	})

	// 包装处理器
	wrappedHandler := interceptor(mockHandler)

	// 创建模拟请求
	req := &connect.Request[v1check.ReadyCheckReq]{}

	// 执行请求
	resp, err := wrappedHandler(context.Background(), req)

	assert.NoError(t, err)
	assert.NotNil(t, resp)

	// 测试错误情况
	errorHandler := connect.UnaryFunc(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		return nil, connect.NewError(connect.CodeInternal, errors.New("internal error"))
	})

	wrappedErrorHandler := interceptor(errorHandler)

	resp2, err2 := wrappedErrorHandler(context.Background(), req)

	assert.Error(t, err2)
	assert.Nil(t, resp2)
}
