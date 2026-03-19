import { createFileRoute, redirect } from "@tanstack/react-router";
import { addNotification } from "@/store/notifications";
import { setAccount } from "@/store/users";
import { isTokenExpired } from "@ecommerce/utils";
import { useGetUserProfile } from "@/hooks/useProfile";
import { useEffect } from "react";

export const Route = createFileRoute("/profile/")({
  component: RouteComponent,
  // 校验token是否过期，过期则重定向到首页
  beforeLoad: ({ location }) => {
    const token = localStorage.getItem("token");
    if (isTokenExpired(typeof token === "string" ? token : "")) {
      console.warn("Token已过期，请重新登录或尝试刷新。");

      addNotification({
        message: "Token已过期，请重新登录或尝试刷新。即将回到首页",
        severity: "warning",
      });

      setAccount({});
      localStorage.removeItem("token");

      throw redirect({
        to: "/",
        search: { redirect: location.href },
      });
    }
  },
});

function RouteComponent() {
  const { data: userProfile } = useGetUserProfile();

  useEffect(() => {
    if (userProfile) {
      setAccount(userProfile);
    }
  }, [userProfile]);

  if (!userProfile) return <div>未找到用户</div>;

  return (
      <div>
        <ol>
          {
            <li>
              id：{userProfile.id}
              用户名：{userProfile.name}
              昵称：{userProfile.displayName}
              <img src={userProfile.avatar} alt="" />
              邮箱：{userProfile.email}
              账号创建日期：{userProfile.createdTime}
              tag：{userProfile.tag}
            </li>
          }
        </ol>
      </div>
  );
}
