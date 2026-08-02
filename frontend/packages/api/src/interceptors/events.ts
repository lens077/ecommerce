import type { AppError } from "../errors";

export type AuthErrorListener = (err: AppError) => void;

// 存储各个 App 注册的监听函数
const authErrorListeners = new Set<AuthErrorListener>();

export const onAuthError = (listener: AuthErrorListener) => {
  authErrorListeners.add(listener);
  return () => authErrorListeners.delete(listener); // 返回取消订阅的函数
};

export const emitAuthError = (err: AppError) => {
  authErrorListeners.forEach((l) => l(err));
};
