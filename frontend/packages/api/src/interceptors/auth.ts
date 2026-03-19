import type { Interceptor } from "@connectrpc/connect";

export const authInterceptor: Interceptor = (next) => async (req) => {
  const token = localStorage.getItem("token");
  if (token) {
    req.header.set("Authorization", `Bearer ${token}`);
  }
  return await next(req);
};
