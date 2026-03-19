export interface Role {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  description: string;
  roles: string[];
  domains: string[];
  isEnabled: boolean;
}

interface Permission {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  description: string;
  users: string[] | null;
  groups: string[];
  roles: string[];
  domains: string[];
  model: string;
  adapter: string;
  resourceType: string;
  resources: string[];
  actions: string[];
  effect: string;
  isEnabled: boolean;
  submitter: string;
  approver: string;
  approveTime: string;
  state: string;
}

interface JwtPayload {
  owner: string;
  name: string;
  createdTime: string;
  updatedTime: string;
  deletedTime: string;
  id: string;
  type: string;
  password: string;
  passwordSalt: string;
  passwordType: string;
  displayName: string;
  firstName: string;
  lastName: string;
  avatar: string;
  avatarType: string;
  permanentAvatar: string;
  email: string;
  emailVerified: boolean;
  phone: string;
  countryCode: string;
  region: string;
  location: string;
  address: string[];
  affiliation: string;
  title: string;
  idCardType: string;
  idCard: string;
  homepage: string;
  bio: string;
  language: string;
  gender: string;
  birthday: string;
  education: string;
  score: number;
  karma: number;
  ranking: number;
  isDefaultAvatar: boolean;
  isOnline: boolean;
  isAdmin: boolean;
  isForbidden: boolean;
  isDeleted: boolean;
  signupApplication: string;
  hash: string;
  preHash: string;
  accessKey: string;
  accessSecret: string;
  github: string;
  google: string;
  qq: string;
  wechat: string;
  facebook: string;
  dingtalk: string;
  weibo: string;
  gitee: string;
  linkedin: string;
  wecom: string;
  lark: string;
  gitlab: string;
  createdIp: string;
  lastSigninTime: string;
  lastSigninIp: string;
  preferredMfaType: string;
  recoveryCodes: null | string[];
  totpSecret: string;
  mfaPhoneEnabled: boolean;
  mfaEmailEnabled: boolean;
  ldap: string;
  properties: Record<string, unknown>;
  roles: Role[];
  permissions: Permission[];
  groups: string[];
  lastSigninWrongTime: string;
  signinWrongTimes: number;
  tokenType: string;
  tag: string;
  scope: string;
  iss: string;
  sub: string;
  aud: string[];
  exp: number;
  nbf: number;
  iat: number;
  jti: string;
}

/**
 * 安全地解码 JWT 的 Payload 部分。
 * Payload 是 Base64 URL 编码的 JSON 字符串。
 * @param token 完整的 JWT 字符串 (Header.Payload.Signature)
 * @returns Payload 对象或 null
 */
export const decodeJwtPayload = (token: string): JwtPayload | null => {
  if (!token) {
    console.error("Token is invalid or not provided.");
    return null;
  }

  try {
    // JWT 格式: Header.Payload.Signature
    const parts = token.split(".");
    if (parts.length !== 3) {
      console.error("Invalid JWT format (must have 3 parts).");
      return null;
    }
    const payloadBase64 = parts[1];

    // 1. Base64 URL 安全解码
    // Base64 URL 编码使用 '-' 和 '_' 替代标准 Base64 的 '+' 和 '/'
    const base64 = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");

    // 2. 使用 atob (浏览器 API) 进行 Base64 解码，并进行 UTF-8 安全处理
    const jsonStr = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => {
          // 确保正确处理多字节字符 (UTF-8 安全)
          return `%${("00" + c.charCodeAt(0).toString(16)).slice(-2)}`;
        })
        .join(""),
    );

    // 3. JSON 解析并返回
    return JSON.parse(jsonStr) as JwtPayload;
  } catch (e) {
    console.error("Failed to decode or parse JWT payload:", e);
    // 如果解码失败，通常意味着 Token 被篡改或格式错误
    return null;
  }
};

/**
 * 检查 Token 是否过期
 * @param token JWT 字符串
 * @returns boolean
 */
export const isTokenExpired = (token: string): boolean => {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) {
    // 如果无法解析或没有 exp 声明，认为已过期或无效
    return true;
  }

  // exp 是秒级时间戳，转为毫秒后与当前时间比较
  const expiryTime = payload.exp * 1000;
  const currentTime = Date.now();

  return expiryTime < currentTime;
};
