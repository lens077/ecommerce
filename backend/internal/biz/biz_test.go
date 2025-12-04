package biz

import (
	"context"
	"errors"
	"testing"

	conf "connect-go-example/internal/conf/v1"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"
)

// MockUserRepo 是 UserRepo 的模拟实现
type MockUserRepo struct {
	mock.Mock
}

// SignIn 实现 UserRepo 接口的 SignIn 方法
func (m *MockUserRepo) SignIn(ctx context.Context, req SignInRequest) (SignInResponse, error) {
	args := m.Called(ctx, req)
	return args.Get(0).(SignInResponse), args.Error(1)
}

// MockCheckRepo 是 CheckRepo 的模拟实现
type MockCheckRepo struct {
	mock.Mock
}

func (m *MockCheckRepo) Ready(ctx context.Context, req HealthCheckReq) (HealthCheckReply, error) {
	args := m.Called(ctx, req)
	return args.Get(0).(HealthCheckReply), args.Error(1)
}

// UserUseCaseTestSuite 是 UserUseCase 的测试套件
type UserUseCaseTestSuite struct {
	suite.Suite
	userRepo *MockUserRepo
	useCase  *UserUseCase
	logger   *zap.Logger
}

// SetupTest 设置 UserUseCase 测试环境
func (suite *UserUseCaseTestSuite) SetupTest() {
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
	suite.logger = logger
	suite.useCase = NewUserUseCase(suite.userRepo, cfg, logger)
}

// TestSignIn_Success 测试 UserUseCase.SignIn 成功情况
func (suite *UserUseCaseTestSuite) TestSignIn_Success() {
	ctx := context.Background()
	req := SignInRequest{
		Code:  "test-code",
		State: "test-state",
	}
	expectedResp := SignInResponse{
		State: "test-state",
		Data:  "test-data",
	}

	suite.userRepo.On("SignIn", ctx, req).Return(expectedResp, nil)

	resp, err := suite.useCase.SignIn(ctx, req)

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), resp)
	assert.Equal(suite.T(), expectedResp.State, resp.State)
	assert.Equal(suite.T(), expectedResp.Data, resp.Data)
}

// TestSignIn_Error 测试 UserUseCase.SignIn 失败情况
func (suite *UserUseCaseTestSuite) TestSignIn_Error() {
	ctx := context.Background()
	req := SignInRequest{
		Code:  "test-code",
		State: "test-state",
	}
	expectedErr := errors.New("sign in error")

	suite.userRepo.On("SignIn", ctx, req).Return(SignInResponse{}, expectedErr)

	resp, err := suite.useCase.SignIn(ctx, req)

	assert.Error(suite.T(), err)
	assert.Nil(suite.T(), resp)
	assert.Equal(suite.T(), expectedErr, err)
}

// CheckUseCaseTestSuite 是 CheckUseCase 的测试套件
type CheckUseCaseTestSuite struct {
	suite.Suite
	checkRepo *MockCheckRepo
	useCase   *CheckUseCase
}

func (suite *CheckUseCaseTestSuite) SetupTest() {
	suite.checkRepo = new(MockCheckRepo)
	suite.useCase = &CheckUseCase{
		repo: suite.checkRepo,
	}
}

func (suite *CheckUseCaseTestSuite) TestReady_Success() {
	ctx := context.Background()
	expectedReply := HealthCheckReply{
		Status:  "Ready",
		Details: nil,
	}

	suite.checkRepo.On("Ready", ctx, HealthCheckReq{}).Return(expectedReply, nil)

	reply, err := suite.useCase.Ready(ctx, HealthCheckReq{})

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), reply)
	assert.Equal(suite.T(), expectedReply.Status, reply.Status)
	assert.Equal(suite.T(), expectedReply.Details, reply.Details)
}

func (suite *CheckUseCaseTestSuite) TestReady_Error() {
	ctx := context.Background()
	expectedError := errors.New("database error")

	suite.checkRepo.On("Ready", ctx, HealthCheckReq{}).Return(HealthCheckReply{}, expectedError)

	reply, err := suite.useCase.Ready(ctx, HealthCheckReq{})

	assert.Error(suite.T(), err)
	assert.Equal(suite.T(), expectedError, err)
	assert.Nil(suite.T(), reply)
}

// 运行测试套件
func TestUserUseCaseTestSuite(t *testing.T) {
	suite.Run(t, new(UserUseCaseTestSuite))
}

func TestCheckUseCaseTestSuite(t *testing.T) {
	suite.Run(t, new(CheckUseCaseTestSuite))
}

// 单元测试函数
func TestNewCheckUseCase(t *testing.T) {
	mockRepo := new(MockCheckRepo)

	useCase := NewCheckUseCase(mockRepo)

	assert.NotNil(t, useCase)
	assert.IsType(t, &CheckUseCase{}, useCase)
}

// TestNewUserUseCase 测试 NewUserUseCase 函数
func TestNewUserUseCase(t *testing.T) {
	mockRepo := new(MockUserRepo)
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

	useCase := NewUserUseCase(mockRepo, cfg, logger)

	assert.NotNil(t, useCase)
	assert.IsType(t, &UserUseCase{}, useCase)
	assert.Equal(t, mockRepo, useCase.repo)
	assert.Equal(t, cfg.Auth, useCase.cfg)
}
