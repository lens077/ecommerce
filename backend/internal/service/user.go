package service

import (
	"context"

	v1 "connect-go-example/api/greet/v1"
	"connect-go-example/api/greet/v1/greetv1connect"
	"connect-go-example/internal/biz/model"

	"connectrpc.com/connect"
)

// GreetService 实现 Connect 服务
type GreetService struct {
	userUseCase model.UserUseCase
}

// 显式接口检查
var _ greetv1connect.GreetServiceHandler = (*GreetService)(nil)

func NewGreetService(userUseCase model.UserUseCase) greetv1connect.GreetServiceHandler {
	return &GreetService{
		userUseCase: userUseCase,
	}
}

func (s *GreetService) Register(ctx context.Context, req *connect.Request[v1.RegisterRequest]) (*connect.Response[v1.RegisterResponse], error) {
	userID, err := s.userUseCase.Register(
		ctx,
		req.Msg.Username,
		req.Msg.PasswordHash,
		req.Msg.Email,
		req.Msg.Salt,
	)
	if err != nil {
		return nil, err
	}

	response := &v1.RegisterResponse{
		UserId: userID,
	}

	return connect.NewResponse(response), nil
}

func (s *GreetService) GetAuthChallenge(ctx context.Context, req *connect.Request[v1.AuthChallengeRequest]) (*connect.Response[v1.AuthChallengeResponse], error) {
	challenge, err := s.userUseCase.GetAuthChallenge(ctx, req.Msg.Username)
	if err != nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, err)
	}

	response := &v1.AuthChallengeResponse{
		Challenge: challenge.Challenge,
		Salt:      challenge.Salt,
	}

	return connect.NewResponse(response), nil
}

func (s *GreetService) SubmitAuth(ctx context.Context, req *connect.Request[v1.SubmitAuthRequest]) (*connect.Response[v1.SubmitAuthResponse], error) {
	result, err := s.userUseCase.SubmitAuth(
		ctx,
		req.Msg.Username,
		req.Msg.HashedCredential,
		req.Msg.AuthRequestId,
		req.Msg.ChallengeResponse,
	)
	if err != nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, err)
	}

	response := &v1.SubmitAuthResponse{
		Code:      result.Code,
		State:     result.State,
		AuthToken: result.AuthToken,
	}

	return connect.NewResponse(response), nil
}
