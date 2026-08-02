/**
 * 懒加载图片组件
 *
 * 使用 Intersection Observer API 实现图片懒加载
 * 当图片进入视口时才加载
 */

import { Box, Skeleton } from "@mui/material";
import { useEffect, useRef, useState } from "react";

interface LazyImageProps {
  src: string;
  alt: string;
  sx?: object;
  placeholder?: React.ReactNode;
  onLoad?: () => void;
  onError?: () => void;
}

export function LazyImage({ src, alt, sx, placeholder, onLoad, onError }: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: "100px",
        threshold: 0.1,
      },
    );

    observer.observe(imgRef.current);

    return () => observer.disconnect();
  }, []);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  return (
    <Box
      ref={imgRef}
      sx={{
        position: "relative",
        overflow: "hidden",
        bgcolor: "background.default",
        ...sx,
      }}
    >
      {/* 加载占位 */}
      {!isLoaded && !hasError && (
        <Skeleton
          variant="rectangular"
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
          animation="wave"
        />
      )}

      {/* 错误占位 */}
      {hasError && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "background.default",
          }}
        >
          {placeholder || (
            <Box
              component="span"
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                bgcolor: "action.disabledBackground",
              }}
            />
          )}
        </Box>
      )}

      {/* 实际图片 */}
      {isInView && !hasError && (
        <Box
          component="img"
          src={src}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: isLoaded ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}
        />
      )}
    </Box>
  );
}
