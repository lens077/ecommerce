/**
 * 防抖 Hook
 * 
 * 延迟更新值，适用于搜索输入等场景
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface UseDebounceOptions<T> {
  value: T;
  delay: number;
}

interface UseDebounceReturn<T> {
  debouncedValue: T;
  isPending: boolean;
}

interface UseDebounceCallbackOptions {
  immediate?: boolean;
}

type DebouncedCallback<T extends unknown[]> = (...args: T) => void;

/**
 * 防抖值
 */
export function useDebounce<T>({ value, delay }: UseDebounceOptions<T>): UseDebounceReturn<T>["debouncedValue"] {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * 防抖回调
 */
export function useDebouncedCallback<T extends unknown[]>(
  callback: (...args: T) => void,
  delay: number,
  options?: UseDebounceCallbackOptions
): DebouncedCallback<T> {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // 更新回调引用
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedCallback = useCallback(
    (...args: T) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );

  // 清理
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}

/**
 * 带 pending 状态的防抖值
 */
export function useDebounceWithPending<T>(value: T, delay: number): UseDebounceReturn<T> {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const [isPending, setIsPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setIsPending(true);

    timerRef.current = setTimeout(() => {
      setDebouncedValue(value);
      setIsPending(false);
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [value, delay]);

  return { debouncedValue, isPending };
}
