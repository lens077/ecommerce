package biz

import (
	"context"
	"errors"
	"testing"
	"time"

	"connect-go-example/internal/biz/model"
	conf "connect-go-example/internal/conf/v1"

	"connectrpc.com/connect"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"
)

// MockUserRepo 是 UserRepo 的模拟实现
type MockUserRepo struct {
	mock.Mock
}

func (m *MockUserRepo) GetUserByName(ctx context.Context, username string) (*model.User, error) {
	args := m.Called(ctx, username)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.User), args.Error(1)
}

func (m *MockUserRepo) CreateUser(ctx context.Context, user *model.User) (int64, error) {
	args := m.Called(ctx, user)
	return args.Get(0).(int64), args.Error(1)
}

func (m *MockUserRepo) StoreAuthChallenge(ctx context.Context, username, challenge string, timeout time.Duration) error {
	args := m.Called(ctx, username, challenge, timeout)
	return args.Error(0)
}

func (m *MockUserRepo) GetAuthChallenge(ctx context.Context, username string) (string, error) {
	args := m.Called(ctx, username)
	return args.String(0), args.Error(1)
}

// MockCheckRepo 是 CheckRepo 的模拟实现
type MockCheckRepo struct {
	mock.Mock
}

func (m *MockCheckRepo) Ready(ctx context.Context, req model.HealthCheckReq) (model.HealthCheckReply, error) {
	args := m.Called(ctx, req)
	return args.Get(0).(model.HealthCheckReply), args.Error(1)
}

// UserUseCaseTestSuite 是 UserUseCase 的测试套件
type UserUseCaseTestSuite struct {
	suite.Suite
	userRepo *MockUserRepo
	useCase  *UserUseCase
	logger   *zap.Logger
}

func (suite *UserUseCaseTestSuite) SetupTest() {
	suite.userRepo = new(MockUserRepo)
	suite.logger, _ = zap.NewDevelopment()

	cfg := &conf.Bootstrap{
		Auth: &conf.Auth{
			JwtSecret:               "test-secret-key-12345678901234567890",
			ChallengeTimeoutSeconds: 120,
			JwtExpireHours:          24,
		},
	}

	useCaseInterface, err := NewUserUseCase(suite.userRepo, cfg, suite.logger)
	assert.NoError(suite.T(), err)
	suite.useCase = useCaseInterface.(*UserUseCase)
}

func (suite *UserUseCaseTestSuite) TestNewUserUseCase() {
	// 测试正常创建
	useCase, err := NewUserUseCase(suite.userRepo, &conf.Bootstrap{
		Auth: &conf.Auth{
			JwtSecret: "test-secret",
		},
	}, suite.logger)

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), useCase)

	// 测试自动生成密钥
	useCase2, err := NewUserUseCase(suite.userRepo, &conf.Bootstrap{
		Auth: &conf.Auth{},
	}, suite.logger)

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), useCase2)
}

func (suite *UserUseCaseTestSuite) TestRegister_UserAlreadyExists() {
	ctx := context.Background()

	// 模拟用户已存在
	suite.userRepo.On("GetUserByName", ctx, "existinguser").Return(&model.User{Username: "existinguser"}, nil)

	userID, err := suite.useCase.Register(ctx, "existinguser", "hash", "email@test.com", "salt")

	assert.Equal(suite.T(), "", userID)
	assert.Error(suite.T(), err)
	assert.IsType(suite.T(), &connect.Error{}, err)
	connectErr := err.(*connect.Error)
	assert.Equal(suite.T(), connect.CodeAlreadyExists, connectErr.Code())
}

func (suite *UserUseCaseTestSuite) TestRegister_Success() {
	ctx := context.Background()

	// 模拟用户不存在
	suite.userRepo.On("GetUserByName", ctx, "newuser").Return(nil, errors.New("not found"))
	suite.userRepo.On("CreateUser", ctx, mock.AnythingOfType("*model.User")).Return(int64(123), nil)

	userID, err := suite.useCase.Register(ctx, "newuser", "passwordhash", "email@test.com", "salt")

	assert.NoError(suite.T(), err)
	assert.Equal(suite.T(), "123", userID)
	suite.userRepo.AssertCalled(suite.T(), "CreateUser", ctx, mock.MatchedBy(func(user *model.User) bool {
		return user.Username == "newuser" && user.PasswordHash == "passwordhash"
	}))
}

func (suite *UserUseCaseTestSuite) TestGetAuthChallenge_UserNotFound() {
	ctx := context.Background()

	// 模拟用户不存在
	suite.userRepo.On("GetUserByName", ctx, "nonexistent").Return(nil, errors.New("not found"))

	challenge, err := suite.useCase.GetAuthChallenge(ctx, "nonexistent")

	assert.Nil(suite.T(), challenge)
	assert.Error(suite.T(), err)
	assert.Equal(suite.T(), "authentication failed", err.Error())
}

func (suite *UserUseCaseTestSuite) TestGetAuthChallenge_Success() {
	ctx := context.Background()

	// 模拟用户存在
	suite.userRepo.On("GetUserByName", ctx, "testuser").Return(&model.User{
		Username: "testuser",
		Salt:     "testsalt",
	}, nil)
	suite.userRepo.On("StoreAuthChallenge", ctx, "testuser", mock.AnythingOfType("string"), mock.AnythingOfType("time.Duration")).Return(nil)

	challenge, err := suite.useCase.GetAuthChallenge(ctx, "testuser")

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), challenge)
	assert.Equal(suite.T(), "testuser", challenge.Username)
	assert.Equal(suite.T(), "testsalt", challenge.Salt)
	assert.NotEmpty(suite.T(), challenge.Challenge)
	suite.userRepo.AssertCalled(suite.T(), "StoreAuthChallenge", ctx, "testuser", challenge.Challenge, mock.AnythingOfType("time.Duration"))
}

func (suite *UserUseCaseTestSuite) TestSubmitAuth_InvalidChallenge() {
	ctx := context.Background()

	// 模拟挑战不存在
	suite.userRepo.On("GetAuthChallenge", ctx, "testuser").Return("", errors.New("not found"))

	result, err := suite.useCase.SubmitAuth(ctx, "testuser", "hash", "req123", "response")

	assert.Nil(suite.T(), result)
	assert.Error(suite.T(), err)
	assert.Equal(suite.T(), "invalid or expired challenge", err.Error())
}

func (suite *UserUseCaseTestSuite) TestGenerateJWT() {
	token, err := suite.useCase.generateJWT(123, "testuser")

	assert.NoError(suite.T(), err)
	assert.NotEmpty(suite.T(), token)

	// 验证 JWT 令牌
	parsedToken, err := jwt.Parse(token, func(token *jwt.Token) (interface{}, error) {
		return []byte("test-secret-key-12345678901234567890"), nil
	})

	assert.NoError(suite.T(), err)
	assert.True(suite.T(), parsedToken.Valid)

	claims := parsedToken.Claims.(jwt.MapClaims)
	assert.Equal(suite.T(), float64(123), claims["sub"])
	assert.Equal(suite.T(), "testuser", claims["usr"])
}

func (suite *UserUseCaseTestSuite) TestConstantTimeCompare() {
	// 测试相等字符串
	assert.True(suite.T(), constantTimeCompare("test", "test"))

	// 测试不等长字符串
	assert.False(suite.T(), constantTimeCompare("short", "longer"))

	// 测试不等字符串
	assert.False(suite.T(), constantTimeCompare("test1", "test2"))
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
	expectedReply := model.HealthCheckReply{
		Status:  "Ready",
		Details: nil,
	}

	suite.checkRepo.On("Ready", ctx, model.HealthCheckReq{}).Return(expectedReply, nil)

	reply, err := suite.useCase.Ready(ctx, model.HealthCheckReq{})

	assert.NoError(suite.T(), err)
	assert.Equal(suite.T(), expectedReply, reply)
}

func (suite *CheckUseCaseTestSuite) TestReady_Error() {
	ctx := context.Background()
	expectedError := errors.New("database error")

	suite.checkRepo.On("Ready", ctx, model.HealthCheckReq{}).Return(model.HealthCheckReply{}, expectedError)

	reply, err := suite.useCase.Ready(ctx, model.HealthCheckReq{})

	assert.Error(suite.T(), err)
	assert.Equal(suite.T(), expectedError, err)
	assert.Equal(suite.T(), model.HealthCheckReply{}, reply)
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

	useCase, err := NewCheckUseCase(mockRepo)

	assert.NoError(t, err)
	assert.NotNil(t, useCase)
	assert.IsType(t, &CheckUseCase{}, useCase)
}
