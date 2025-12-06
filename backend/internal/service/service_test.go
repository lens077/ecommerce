package service

import (
	"connect-go-example/internal/biz"
	conf "connect-go-example/internal/conf/v1"
	"context"
	"errors"
	"testing"

	checkv1 "connect-go-example/api/check/v1"
	"connect-go-example/api/check/v1/checkv1connect"
	userv1 "connect-go-example/api/user/v1"
	"connect-go-example/api/user/v1/userv1connect"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"
)

// MockCheckRepo 是 biz.CheckRepo 的模拟实现
type MockCheckRepo struct {
	mock.Mock
}

// Ready 实现 biz.CheckRepo 接口的 Ready 方法
func (m *MockCheckRepo) Ready(ctx context.Context, req biz.HealthCheckReq) (biz.HealthCheckReply, error) {
	args := m.Called(ctx, req)
	return args.Get(0).(biz.HealthCheckReply), args.Error(1)
}

// MockUserRepo 是 biz.UserRepo 的模拟实现
type MockUserRepo struct {
	mock.Mock
}

// SignIn 实现 biz.UserRepo 接口的 SignIn 方法
func (m *MockUserRepo) SignIn(ctx context.Context, req biz.SignInRequest) (*biz.SignInResponse, error) {
	args := m.Called(ctx, req)
	return args.Get(0).(*biz.SignInResponse), args.Error(1)
}

// CheckServiceTestSuite 是 CheckService 的测试套件
type CheckServiceTestSuite struct {
	suite.Suite
	checkRepo    *MockCheckRepo
	checkUseCase *biz.CheckUseCase
	checkService checkv1connect.CheckServiceHandler
}

// SetupTest 设置 CheckService 测试环境
func (suite *CheckServiceTestSuite) SetupTest() {
	suite.checkRepo = new(MockCheckRepo)
	suite.checkUseCase = biz.NewCheckUseCase(suite.checkRepo)
	suite.checkService = NewCheckService(suite.checkUseCase)
}

// TestReady_Success 测试 CheckService.Ready 成功情况
func (suite *CheckServiceTestSuite) TestReady_Success() {
	ctx := context.Background()
	req := &connect.Request[checkv1.ReadyCheckReq]{}

	expectedReply := biz.HealthCheckReply{
		Status:  "Ready",
		Details: nil,
	}
	suite.checkRepo.On("Ready", ctx, biz.HealthCheckReq{}).Return(expectedReply, nil)

	resp, err := suite.checkService.Ready(ctx, req)

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), resp)
	assert.Equal(suite.T(), "Ready", resp.Msg.Status)
	assert.Nil(suite.T(), resp.Msg.Details)
}

// TestReady_Error 测试 CheckService.Ready 失败情况
func (suite *CheckServiceTestSuite) TestReady_Error() {
	ctx := context.Background()
	req := &connect.Request[checkv1.ReadyCheckReq]{}

	expectedError := errors.New("service unavailable")
	suite.checkRepo.On("Ready", ctx, biz.HealthCheckReq{}).Return(biz.HealthCheckReply{}, expectedError)

	resp, err := suite.checkService.Ready(ctx, req)

	assert.Error(suite.T(), err)
	assert.Nil(suite.T(), resp)
	assert.Equal(suite.T(), expectedError, err)
}

// UserServiceTestSuite 是 UserService 的测试套件
type UserServiceTestSuite struct {
	suite.Suite
	userRepo    *MockUserRepo
	userUseCase *biz.UserUseCase
	userService userv1connect.UserServiceHandler
}

// SetupTest 设置 UserService 测试环境
func (suite *UserServiceTestSuite) SetupTest() {
	suite.userRepo = new(MockUserRepo)
	logger, _ := zap.NewDevelopment()
	cfg := &conf.Bootstrap{
		Auth: &conf.Auth{
			Endpoint:         "http://localhost:9000",
			ClientId:         "test-client-id",
			ClientSecret:     "test-client-secret",
			OrganizationName: "test-org",
			ApplicationName:  "test-app",
			Certificate:      "test-cert",
		},
	}
	suite.userUseCase = biz.NewUserUseCase(suite.userRepo, cfg, logger)
	suite.userService = NewUserService(suite.userUseCase)
}

// TestSignIn_Success 测试 UserService.SignIn 成功情况
func (suite *UserServiceTestSuite) TestSignIn_Success() {
	ctx := context.Background()
	connectReq := &connect.Request[userv1.SignInRequest]{
		Msg: &userv1.SignInRequest{
			Code:  "test-code",
			State: "test-state",
		},
	}

	expectedBizResp := &biz.SignInResponse{
		State: "test-state",
		Data:  "test-data",
	}
	suite.userRepo.On("SignIn", ctx, biz.SignInRequest{
		Code:  "test-code",
		State: "test-state",
	}).Return(expectedBizResp, nil)

	resp, err := suite.userService.SignIn(ctx, connectReq)

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), resp)
	assert.Equal(suite.T(), "test-state", resp.Msg.State)
	assert.Equal(suite.T(), "test-data", resp.Msg.Data)
}

// TestSignIn_Error 测试 UserService.SignIn 失败情况
func (suite *UserServiceTestSuite) TestSignIn_Error() {
	ctx := context.Background()
	connectReq := &connect.Request[userv1.SignInRequest]{
		Msg: &userv1.SignInRequest{
			Code:  "test-code",
			State: "test-state",
		},
	}

	expectedError := errors.New("sign in failed")
	suite.userRepo.On("SignIn", ctx, biz.SignInRequest{
		Code:  "test-code",
		State: "test-state",
	}).Return((*biz.SignInResponse)(nil), expectedError)

	resp, err := suite.userService.SignIn(ctx, connectReq)

	assert.Error(suite.T(), err)
	assert.Nil(suite.T(), resp)
	assert.Equal(suite.T(), expectedError, err)
}

// 运行测试套件
func TestCheckServiceTestSuite(t *testing.T) {
	suite.Run(t, new(CheckServiceTestSuite))
}

func TestUserServiceTestSuite(t *testing.T) {
	suite.Run(t, new(UserServiceTestSuite))
}

// TestNewCheckService 测试 NewCheckService 函数
func TestNewCheckService(t *testing.T) {
	mockCheckRepo := new(MockCheckRepo)
	checkUseCase := biz.NewCheckUseCase(mockCheckRepo)

	service := NewCheckService(checkUseCase)

	assert.NotNil(t, service)
	assert.IsType(t, &CheckService{}, service)

	// 验证接口实现
	var _ checkv1connect.CheckServiceHandler = service
}

// TestNewUserService 测试 NewUserService 函数
func TestNewUserService(t *testing.T) {
	mockUserRepo := new(MockUserRepo)
	logger, _ := zap.NewDevelopment()
	cfg := &conf.Bootstrap{
		Auth: &conf.Auth{
			Endpoint:         "http://localhost:9000",
			ClientId:         "test-client-id",
			ClientSecret:     "test-client-secret",
			OrganizationName: "test-org",
			ApplicationName:  "test-app",
			Certificate:      "test-cert",
		},
	}
	userUseCase := biz.NewUserUseCase(mockUserRepo, cfg, logger)

	service := NewUserService(userUseCase)

	assert.NotNil(t, service)
	assert.IsType(t, &UserService{}, service)

	// 验证接口实现
	var _ userv1connect.UserServiceHandler = service
}

// TestCheckServiceInterface 验证 CheckService 实现了正确的接口
func TestCheckServiceInterface(t *testing.T) {
	mockCheckRepo := new(MockCheckRepo)
	checkUseCase := biz.NewCheckUseCase(mockCheckRepo)
	service := NewCheckService(checkUseCase)

	// 这个测试会编译失败如果 CheckService 没有正确实现接口
	var handler checkv1connect.CheckServiceHandler = service
	assert.NotNil(t, handler)
}

// TestUserServiceInterface 验证 UserService 实现了正确的接口
func TestUserServiceInterface(t *testing.T) {
	mockUserRepo := new(MockUserRepo)
	logger, _ := zap.NewDevelopment()
	cfg := &conf.Bootstrap{
		Auth: &conf.Auth{
			Endpoint:         "http://localhost:9000",
			ClientId:         "test-client-id",
			ClientSecret:     "test-client-secret",
			OrganizationName: "test-org",
			ApplicationName:  "test-app",
			Certificate:      "test-cert",
		},
	}
	userUseCase := biz.NewUserUseCase(mockUserRepo, cfg, logger)
	service := NewUserService(userUseCase)

	// 这个测试会编译失败如果 UserService 没有正确实现接口
	var handler userv1connect.UserServiceHandler = service
	assert.NotNil(t, handler)
}
