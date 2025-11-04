package service

import (
	"context"
	"errors"
	"testing"

	v1 "connect-go-example/api/check/v1"
	"connect-go-example/api/check/v1/checkv1connect"
	v1greet "connect-go-example/api/greet/v1"
	"connect-go-example/api/greet/v1/greetv1connect"
	"connect-go-example/internal/biz/model"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/suite"
)

// MockUserUseCase 是 UserUseCase 的模拟实现
type MockUserUseCase struct {
	mock.Mock
}

func (m *MockUserUseCase) Register(ctx context.Context, username, passwordHash, email, salt string) (string, error) {
	args := m.Called(ctx, username, passwordHash, email, salt)
	return args.String(0), args.Error(1)
}

func (m *MockUserUseCase) GetAuthChallenge(ctx context.Context, username string) (*model.AuthChallenge, error) {
	args := m.Called(ctx, username)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.AuthChallenge), args.Error(1)
}

func (m *MockUserUseCase) SubmitAuth(ctx context.Context, username, hashedCredential, authRequestID, challengeResponse string) (*model.AuthResult, error) {
	args := m.Called(ctx, username, hashedCredential, authRequestID, challengeResponse)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.AuthResult), args.Error(1)
}

// MockCheckUseCase 是 CheckUseCase 的模拟实现
type MockCheckUseCase struct {
	mock.Mock
}

func (m *MockCheckUseCase) Ready(ctx context.Context, req model.HealthCheckReq) (model.HealthCheckReply, error) {
	args := m.Called(ctx, req)
	return args.Get(0).(model.HealthCheckReply), args.Error(1)
}

// GreetServiceTestSuite 是 GreetService 的测试套件
type GreetServiceTestSuite struct {
	suite.Suite
	userUseCase  *MockUserUseCase
	greetService greetv1connect.GreetServiceHandler
}

func (suite *GreetServiceTestSuite) SetupTest() {
	suite.userUseCase = new(MockUserUseCase)
	suite.greetService = NewGreetService(suite.userUseCase)
}

func (suite *GreetServiceTestSuite) TestRegister_Success() {
	ctx := context.Background()
	req := &connect.Request[v1greet.RegisterRequest]{
		Msg: &v1greet.RegisterRequest{
			Username:     "testuser",
			PasswordHash: "hashedpassword",
			Email:        "test@example.com",
			Salt:         "salt123",
		},
	}

	expectedUserID := "123"
	suite.userUseCase.On("Register", ctx, "testuser", "hashedpassword", "test@example.com", "salt123").Return(expectedUserID, nil)

	resp, err := suite.greetService.Register(ctx, req)

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), resp)
	assert.Equal(suite.T(), expectedUserID, resp.Msg.UserId)
}

func (suite *GreetServiceTestSuite) TestRegister_Error() {
	ctx := context.Background()
	req := &connect.Request[v1greet.RegisterRequest]{
		Msg: &v1greet.RegisterRequest{
			Username:     "testuser",
			PasswordHash: "hashedpassword",
			Email:        "test@example.com",
			Salt:         "salt123",
		},
	}

	expectedError := errors.New("user already exists")
	suite.userUseCase.On("Register", ctx, "testuser", "hashedpassword", "test@example.com", "salt123").Return("", expectedError)

	resp, err := suite.greetService.Register(ctx, req)

	assert.Error(suite.T(), err)
	assert.Nil(suite.T(), resp)
	assert.Equal(suite.T(), expectedError, err)
}

func (suite *GreetServiceTestSuite) TestGetAuthChallenge_Success() {
	ctx := context.Background()
	req := &connect.Request[v1greet.AuthChallengeRequest]{
		Msg: &v1greet.AuthChallengeRequest{
			Username: "testuser",
		},
	}

	expectedChallenge := &model.AuthChallenge{
		Username:  "testuser",
		Challenge: "challenge123",
		Salt:      "salt456",
	}
	suite.userUseCase.On("GetAuthChallenge", ctx, "testuser").Return(expectedChallenge, nil)

	resp, err := suite.greetService.GetAuthChallenge(ctx, req)

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), resp)
	assert.Equal(suite.T(), "challenge123", resp.Msg.Challenge)
	assert.Equal(suite.T(), "salt456", resp.Msg.Salt)
}

func (suite *GreetServiceTestSuite) TestGetAuthChallenge_Unauthenticated() {
	ctx := context.Background()
	req := &connect.Request[v1greet.AuthChallengeRequest]{
		Msg: &v1greet.AuthChallengeRequest{
			Username: "testuser",
		},
	}

	expectedError := errors.New("authentication failed")
	suite.userUseCase.On("GetAuthChallenge", ctx, "testuser").Return(nil, expectedError)

	resp, err := suite.greetService.GetAuthChallenge(ctx, req)

	assert.Error(suite.T(), err)
	assert.Nil(suite.T(), resp)
	assert.IsType(suite.T(), &connect.Error{}, err)
	connectErr := err.(*connect.Error)
	assert.Equal(suite.T(), connect.CodeUnauthenticated, connectErr.Code())
}

func (suite *GreetServiceTestSuite) TestSubmitAuth_Success() {
	ctx := context.Background()
	req := &connect.Request[v1greet.SubmitAuthRequest]{
		Msg: &v1greet.SubmitAuthRequest{
			Username:          "testuser",
			HashedCredential:  "hashedcred",
			AuthRequestId:     "req123",
			ChallengeResponse: "response456",
		},
	}

	expectedResult := &model.AuthResult{
		Code:      "success",
		State:     "authenticated",
		AuthToken: "jwt.token.here",
	}
	suite.userUseCase.On("SubmitAuth", ctx, "testuser", "hashedcred", "req123", "response456").Return(expectedResult, nil)

	resp, err := suite.greetService.SubmitAuth(ctx, req)

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), resp)
	assert.Equal(suite.T(), "success", resp.Msg.Code)
	assert.Equal(suite.T(), "authenticated", resp.Msg.State)
	assert.Equal(suite.T(), "jwt.token.here", resp.Msg.AuthToken)
}

func (suite *GreetServiceTestSuite) TestSubmitAuth_Unauthenticated() {
	ctx := context.Background()
	req := &connect.Request[v1greet.SubmitAuthRequest]{
		Msg: &v1greet.SubmitAuthRequest{
			Username:          "testuser",
			HashedCredential:  "hashedcred",
			AuthRequestId:     "req123",
			ChallengeResponse: "response456",
		},
	}

	expectedError := errors.New("invalid credentials")
	suite.userUseCase.On("SubmitAuth", ctx, "testuser", "hashedcred", "req123", "response456").Return(nil, expectedError)

	resp, err := suite.greetService.SubmitAuth(ctx, req)

	assert.Error(suite.T(), err)
	assert.Nil(suite.T(), resp)
	assert.IsType(suite.T(), &connect.Error{}, err)
	connectErr := err.(*connect.Error)
	assert.Equal(suite.T(), connect.CodeUnauthenticated, connectErr.Code())
}

// CheckServiceTestSuite 是 CheckService 的测试套件
type CheckServiceTestSuite struct {
	suite.Suite
	checkUseCase *MockCheckUseCase
	checkService checkv1connect.CheckServiceHandler
}

func (suite *CheckServiceTestSuite) SetupTest() {
	suite.checkUseCase = new(MockCheckUseCase)
	suite.checkService = NewCheckService(suite.checkUseCase)
}

func (suite *CheckServiceTestSuite) TestReady_Success() {
	ctx := context.Background()
	req := &connect.Request[v1.ReadyCheckReq]{}

	expectedReply := model.HealthCheckReply{
		Status:  "Ready",
		Details: nil,
	}
	suite.checkUseCase.On("Ready", ctx, model.HealthCheckReq{}).Return(expectedReply, nil)

	resp, err := suite.checkService.Ready(ctx, req)

	assert.NoError(suite.T(), err)
	assert.NotNil(suite.T(), resp)
	assert.Equal(suite.T(), "Ready", resp.Msg.Status)
	assert.Nil(suite.T(), resp.Msg.Details)
}

func (suite *CheckServiceTestSuite) TestReady_Error() {
	ctx := context.Background()
	req := &connect.Request[v1.ReadyCheckReq]{}

	expectedError := errors.New("service unavailable")
	suite.checkUseCase.On("Ready", ctx, model.HealthCheckReq{}).Return(model.HealthCheckReply{}, expectedError)

	resp, err := suite.checkService.Ready(ctx, req)

	assert.Error(suite.T(), err)
	assert.Nil(suite.T(), resp)
	assert.Equal(suite.T(), expectedError, err)
}

// 运行测试套件
func TestGreetServiceTestSuite(t *testing.T) {
	suite.Run(t, new(GreetServiceTestSuite))
}

func TestCheckServiceTestSuite(t *testing.T) {
	suite.Run(t, new(CheckServiceTestSuite))
}

// 单元测试函数
func TestNewGreetService(t *testing.T) {
	mockUserUseCase := new(MockUserUseCase)

	service := NewGreetService(mockUserUseCase)

	assert.NotNil(t, service)
	assert.IsType(t, &GreetService{}, service)

	// 验证接口实现
	var _ greetv1connect.GreetServiceHandler = service
}

func TestNewCheckService(t *testing.T) {
	mockCheckUseCase := new(MockCheckUseCase)

	service := NewCheckService(mockCheckUseCase)

	assert.NotNil(t, service)
	assert.IsType(t, &CheckService{}, service)

	// 验证接口实现
	var _ checkv1connect.CheckServiceHandler = service
}

// 测试接口实现验证
func TestGreetServiceInterface(t *testing.T) {
	mockUserUseCase := new(MockUserUseCase)
	service := NewGreetService(mockUserUseCase)

	// 这个测试会编译失败如果 GreetService 没有正确实现接口
	var handler greetv1connect.GreetServiceHandler = service
	assert.NotNil(t, handler)
}

func TestCheckServiceInterface(t *testing.T) {
	mockCheckUseCase := new(MockCheckUseCase)
	service := NewCheckService(mockCheckUseCase)

	// 这个测试会编译失败如果 CheckService 没有正确实现接口
	var handler checkv1connect.CheckServiceHandler = service
	assert.NotNil(t, handler)
}
