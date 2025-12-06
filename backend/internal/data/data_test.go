package data

import (
	"connect-go-example/internal/biz"
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"
)

// DataTestSuite 是 Data 的测试套件
type DataTestSuite struct {
	suite.Suite
	data   *Data
	logger *zap.Logger
}

// TestNewData 测试 NewData 函数
func (suite *DataTestSuite) TestNewData() {
	// 使用 nil 指针测试 NewData 函数，因为我们只是测试构造函数
	data := NewData(nil, nil, nil, nil)
	assert.NotNil(suite.T(), data)
	assert.IsType(suite.T(), &Data{}, data)
}

// CheckRepoTestSuite 是 CheckRepo 的测试套件
type CheckRepoTestSuite struct {
	suite.Suite
	checkRepo biz.CheckRepo
	logger    *zap.Logger
}

// SetupTest 设置 CheckRepo 测试环境
func (suite *CheckRepoTestSuite) SetupTest() {
	suite.logger, _ = zap.NewDevelopment()
	// 使用 nil 指针测试 CheckRepo，因为我们只是测试构造函数
	suite.checkRepo = NewCheckRepo(nil, nil, suite.logger)
}

// TestNewCheckRepo 测试 NewCheckRepo 函数
func (suite *CheckRepoTestSuite) TestNewCheckRepo() {
	checkRepo := NewCheckRepo(nil, nil, suite.logger)
	assert.NotNil(suite.T(), checkRepo)
	// 不需要测试具体类型，因为 checkRepo 是未导出的
}

// UserRepoTestSuite 是 UserRepo 的测试套件
type UserRepoTestSuite struct {
	suite.Suite
	userRepo biz.UserRepo
	logger   *zap.Logger
}

// SetupTest 设置 UserRepo 测试环境
func (suite *UserRepoTestSuite) SetupTest() {
	suite.logger, _ = zap.NewDevelopment()
	// 使用 nil 指针测试 UserRepo，因为我们只是测试构造函数
	data := NewData(nil, nil, nil, nil)
	suite.userRepo = NewUserRepo(data, suite.logger)
}

// TestNewUserRepo 测试 NewUserRepo 函数
func (suite *UserRepoTestSuite) TestNewUserRepo() {
	data := NewData(nil, nil, nil, nil)
	userRepo := NewUserRepo(data, suite.logger)
	assert.NotNil(suite.T(), userRepo)
	// 不需要测试具体类型，因为 userRepo 是未导出的
}

// TestSignIn_NilAuth 测试 UserRepo.SignIn 在 auth 为 nil 时的行为
func (suite *UserRepoTestSuite) TestSignIn_NilAuth() {
	ctx := context.Background()
	req := biz.SignInRequest{
		Code:  "test-code",
		State: "test-state",
	}

	resp, err := suite.userRepo.SignIn(ctx, req)

	// 当 auth 为 nil 时，应该返回错误
	assert.Error(suite.T(), err)
	assert.Nil(suite.T(), resp)
}

// 运行测试套件
func TestDataTestSuite(t *testing.T) {
	suite.Run(t, new(DataTestSuite))
}

func TestCheckRepoTestSuite(t *testing.T) {
	suite.Run(t, new(CheckRepoTestSuite))
}

func TestUserRepoTestSuite(t *testing.T) {
	suite.Run(t, new(UserRepoTestSuite))
}

// 单元测试函数
func TestNewData(t *testing.T) {
	data := NewData(nil, nil, nil, nil)
	assert.NotNil(t, data)
	assert.IsType(t, &Data{}, data)
}

func TestNewUserRepo(t *testing.T) {
	data := NewData(nil, nil, nil, nil)
	logger, _ := zap.NewDevelopment()
	userRepo := NewUserRepo(data, logger)
	assert.NotNil(t, userRepo)
	// 不需要测试具体类型，因为 userRepo 是未导出的
}

func TestNewCheckRepo(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	checkRepo := NewCheckRepo(nil, nil, logger)
	assert.NotNil(t, checkRepo)
	// 不需要测试具体类型，因为 checkRepo 是未导出的
}
