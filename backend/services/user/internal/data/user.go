package data

import (
	"context"
	"errors"
	"fmt"

	"github.com/casdoor/casdoor-go-sdk/casdoorsdk"
	"github.com/lens077/ecommerce/backend/services/user/internal/biz"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

var _ biz.UserRepo = (*userRepo)(nil)

type userRepo struct {
	// queries *models.Queries
	rdb  *redis.Client
	auth *casdoorsdk.Client
	l    *zap.Logger
}

func NewUserRepo(data *Data, logger *zap.Logger) biz.UserRepo {
	return &userRepo{
		// queries: models.New(data.db),
		rdb:  data.rdb,
		auth: data.auth,
		l:    logger,
	}
}

func (u userRepo) SignIn(_ context.Context, req biz.SignInRequest) (*biz.SignInResponse, error) {
	if u.auth == nil {
		return nil, fmt.Errorf("auth client is nil:%w", errors.New("config error"))
	}
	token, err := u.auth.GetOAuthToken(req.Code, req.State)
	if err != nil {
		return nil, fmt.Errorf("casdoor get oauth token err:%w", err)
	}
	u.l.Debug(token.AccessToken)
	return &biz.SignInResponse{
		State: "ok",
		Data:  token.AccessToken,
	}, nil
}

func (u userRepo) GetUserProfile(ctx context.Context, req biz.GetUserProfileRequest) (*biz.GetUserProfileResponse, error) {
	if u.auth == nil {
		return nil, fmt.Errorf("auth client is nil: %w", errors.New("config error"))
	}
	user, err := u.auth.GetUser(req.Name)
	// 错误处理
	if err != nil {
		// 如果是其他错误，直接返回
		return nil, fmt.Errorf("get user from casdoor failed: %w", err)
	}

	// 404 情况
	if user == nil || user.Id == "" {
		return nil, biz.ErrUserNotFound
	}

	return &biz.GetUserProfileResponse{
		User: casdoorsdk.User{
			// 基础身份信息 (核心字段)
			Owner:       user.Owner,
			Name:        user.Name,
			Id:          user.Id,
			ExternalId:  user.ExternalId,
			Type:        user.Type,
			DisplayName: user.DisplayName,
			FirstName:   user.FirstName,
			LastName:    user.LastName,

			// 时间和记录
			CreatedTime: user.CreatedTime,
			UpdatedTime: user.UpdatedTime,

			// 认证和联系方式
			Email:         user.Email,
			EmailVerified: user.EmailVerified,
			Phone:         user.Phone,

			// 头像和个人资料
			Avatar:          user.Avatar,
			AvatarType:      user.AvatarType,
			PermanentAvatar: user.PermanentAvatar,
			CountryCode:     user.CountryCode,
			Region:          user.Region,
			Location:        user.Location,
			Address:         user.Address, // []string 类型
			Affiliation:     user.Affiliation,
			Title:           user.Title,
			Bio:             user.Bio,
			Tag:             user.Tag,
			Language:        user.Language,
			Gender:          user.Gender,
			Birthday:        user.Birthday,

			// 状态和权限 (按需暴露)
			IsDefaultAvatar:   user.IsDefaultAvatar,
			IsOnline:          user.IsOnline,
			IsAdmin:           user.IsAdmin,
			IsForbidden:       user.IsForbidden,
			IsDeleted:         user.IsDeleted,
			SignupApplication: user.SignupApplication,

			// 辅助字段 (按需)
			Score:   user.Score,
			Karma:   user.Karma,
			Ranking: user.Ranking,

			// 敏感或不必要的字段 (保持为空或默认值，避免泄露)
			// Password:        "", // 保持为空
			// PasswordSalt:    "", // 保持为空
			// PasswordType:    "", // 保持为空
			// TotpSecret:      "", // 保持为空

			// Hash, Key, Secret: 保持为空
			// Hash: "",
			// PreHash: "",
			// AccessKey: "",
			// AccessSecret: "",

			// IP地址 (按需，通常不暴露)
			// CreatedIp: "",
			LastSigninTime: user.LastSigninTime,
			// LastSigninIp: "",

			// MFA和恢复字段 (按需暴露状态)
			PreferredMfaType: user.PreferredMfaType,
			RecoveryCodes:    nil, // 恢复码绝不暴露
			MfaPhoneEnabled:  user.MfaPhoneEnabled,
			MfaEmailEnabled:  user.MfaEmailEnabled,

			// 外部属性
			Properties: user.Properties, // map[string]string 类型

			// 社交链接 (Casdoor 字段过多，建议只填充需要的，其余保持为空)
			Google: user.Google,
			// ... (其他社交字段按需填充)

			// 关系 (Roles/Permissions/Groups 通常需要深度映射，这里仅作引用)
			Roles:       nil, // 假设需要单独的映射逻辑，这里不直接引用
			Permissions: nil,
			Groups:      user.Groups, // []string 类型

			// 密码记录
			LastChangePasswordTime: user.LastChangePasswordTime,
			LastSigninWrongTime:    user.LastSigninWrongTime,
			SigninWrongTimes:       user.SigninWrongTimes,

			// 托管账户
			ManagedAccounts:    nil, // 托管账户通常是敏感凭证，不直接暴露
			NeedUpdatePassword: user.NeedUpdatePassword,

			// 其他字段
		},
	}, nil
}
