// 登录用户信息(从 Casdoor JWT 解出)
export interface Account {
  owner?: string;
  name?: string;
  avatar?: string;
  email?: string;
  id?: string;
  role?: string;
  displayName?: string;
  isDeleted?: string;
  createdTime?: string;
  updatedTime?: string;
}
