import { useQuery } from "@connectrpc/connect-query";
import { UserService } from "@/gen/api";

export const useGetUserProfile = () => {
  return useQuery(
    UserService.method.userProfile,
    {},
    {
      staleTime: 1000 * 60 * 5, // 数据5分钟内被认为是新的，减少不必要的后端压力
      select: (data) => data.user,
    },
  );
};
