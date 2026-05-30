import { useQuery } from "@tanstack/react-query";
import { userApi } from "@/api";

export const useGetUserProfile = () => {
  return useQuery({
    queryKey: ["getUserProfile"],
    queryFn: async ({ signal }) => {
      return await userApi.getUserProfile(signal);
    },
    staleTime: 1000 * 60 * 5, // 数据5分钟内被认为是新的，减少不必要的后端压力
    select: (data) => data.user,
  });
};
