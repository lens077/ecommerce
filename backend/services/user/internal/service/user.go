package service

import (
	"context"
	"errors"

	casdoorv1 "github.com/lens077/ecommerce/backend/api/casdoor/v1"
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/lens077/ecommerce/backend/services/user/internal/biz"

	v1 "github.com/lens077/ecommerce/backend/api/user/v1"
	"github.com/lens077/ecommerce/backend/api/user/v1/userv1connect"

	"connectrpc.com/connect"
)

// UserService 实现 Connect 服务
type UserService struct {
	uc *biz.UserUseCase
}

// 显式接口检查
var _ userv1connect.UserServiceHandler = (*UserService)(nil)

func NewUserService(uc *biz.UserUseCase) userv1connect.UserServiceHandler {
	return &UserService{
		uc: uc,
	}
}

func (s *UserService) SignIn(ctx context.Context, c *connect.Request[v1.SignInRequest]) (*connect.Response[v1.SignInResponse], error) {
	res, err := s.uc.SignIn(
		ctx,
		biz.SignInRequest{
			Code:  c.Msg.Code,
			State: c.Msg.State,
		},
	)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	response := &v1.SignInResponse{
		State: res.State,
		Data:  res.Data,
	}

	return connect.NewResponse(response), nil
}

func (s *UserService) UserProfile(ctx context.Context, req *connect.Request[v1.UserProfileRequest]) (*connect.Response[v1.UserProfileResponse], error) {
	var userName string
	// 从请求头中获取用户名称
	userName = req.Header().Get(constants.UserNameMetadataKey)
	res, err := s.uc.GetUserProfile(
		ctx,
		biz.GetUserProfileRequest{Name: userName},
	)
	if err != nil {
		// // 映射为 404 Not Found
		if errors.Is(err, biz.ErrUserNotFound) {
			return nil, connect.NewError(connect.CodeNotFound, err)
		}
		return nil, err
	}

	response := &v1.UserProfileResponse{
		User: &casdoorv1.User{
			// 基础身份信息 (核心字段)
			Owner:       res.User.Owner,
			Name:        res.User.Name,
			Id:          res.User.Id,
			ExternalId:  res.User.ExternalId,
			Type:        res.User.Type,
			DisplayName: res.User.DisplayName,
			FirstName:   res.User.FirstName,
			LastName:    res.User.LastName,

			// 时间和记录
			CreatedTime: res.User.CreatedTime,
			UpdatedTime: res.User.UpdatedTime,

			// 认证和联系方式
			Email:         res.User.Email,
			EmailVerified: res.User.EmailVerified,
			Phone:         res.User.Phone,

			// 头像和个人资料
			Avatar:          res.User.Avatar,
			AvatarType:      res.User.AvatarType,
			PermanentAvatar: res.User.PermanentAvatar,
			CountryCode:     res.User.CountryCode,
			Region:          res.User.Region,
			Location:        res.User.Location,
			Address:         res.User.Address, // []string 类型
			Affiliation:     res.User.Affiliation,
			Title:           res.User.Title,
			Bio:             res.User.Bio,
			Tag:             res.User.Tag,
			Language:        res.User.Language,
			Gender:          res.User.Gender,
			Birthday:        res.User.Birthday,

			// 状态和权限 (按需暴露)
			IsDefaultAvatar:   res.User.IsDefaultAvatar,
			IsOnline:          res.User.IsOnline,
			IsAdmin:           res.User.IsAdmin,
			IsForbidden:       res.User.IsForbidden,
			IsDeleted:         res.User.IsDeleted,
			SignupApplication: res.User.SignupApplication,

			// 辅助字段 (按需)
			Score:   int32(res.User.Score),
			Karma:   int32(res.User.Karma),
			Ranking: int32(res.User.Ranking),

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
			LastSigninTime: res.User.LastSigninTime,
			// LastSigninIp: "",

			// MFA和恢复字段 (按需暴露状态)
			PreferredMfaType: res.User.PreferredMfaType,
			RecoveryCodes:    nil, // 恢复码绝不暴露
			MfaPhoneEnabled:  res.User.MfaPhoneEnabled,
			MfaEmailEnabled:  res.User.MfaEmailEnabled,

			// 外部属性
			Properties: res.User.Properties, // map[string]string 类型

			// 社交链接 (Casdoor 字段过多，建议只填充需要的，其余保持为空)
			Github: res.User.GitHub,
			Google: res.User.Google,
			// ... (其他社交字段按需填充)

			// 关系 (Roles/Permissions/Groups 通常需要深度映射，这里仅作引用)
			Roles:       nil, // 假设需要单独的映射逻辑，这里不直接引用
			Permissions: nil,
			Groups:      res.User.Groups, // []string 类型

			// 密码记录
			LastChangePasswordTime: res.User.LastChangePasswordTime,
			LastSigninWrongTime:    res.User.LastSigninWrongTime,
			SigninWrongTimes:       int32(res.User.SigninWrongTimes),

			// 托管账户
			// ManagedAccounts:    nil, // 托管账户通常是敏感凭证，不直接暴露
			NeedUpdatePassword: res.User.NeedUpdatePassword,

			// 其他字段
		},
	}

	return connect.NewResponse(response), nil
}
