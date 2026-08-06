/**
 * 虚拟列表组件
 *
 * 用于大量数据的列表渲染，提升性能
 */

import { Box, type BoxProps } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";

interface VirtualListProps<T> {
  items: T[];
  height: number | string;
  itemHeight: number;
  overscan?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  sx?: BoxProps["sx"];
  onEndReached?: () => void;
  endReachedThreshold?: number;
}

export function VirtualList<T>({
  items,
  height,
  itemHeight,
  overscan = 3,
  renderItem,
  keyExtractor,
  sx,
  onEndReached,
  endReachedThreshold = 5,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // 计算可见范围
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan,
  );

  // 滚动处理
  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const target = event.currentTarget;
      setScrollTop(target.scrollTop);

      // 检测是否滚动到底部
      if (onEndReached) {
        const { scrollHeight, scrollTop, clientHeight } = target;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        const threshold = itemHeight * endReachedThreshold;

        if (distanceFromBottom < threshold) {
          onEndReached();
        }
      }
    },
    [itemHeight, onEndReached, endReachedThreshold],
  );

  // 设置容器高度
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // 计算总高度
  const totalHeight = items.length * itemHeight;
  const containerSx = Array.isArray(sx)
    ? [
        {
          height,
          overflow: "auto",
          position: "relative",
        },
        ...sx,
      ]
    : sx
      ? [
          {
            height,
            overflow: "auto",
            position: "relative",
          },
          sx,
        ]
      : {
          height,
          overflow: "auto",
          position: "relative",
        };

  // 渲染可见项
  const visibleItems = [];
  for (let i = startIndex; i <= endIndex; i++) {
    if (items[i]) {
      visibleItems.push(
        <Box
          key={keyExtractor(items[i], i)}
          sx={{
            position: "absolute",
            top: i * itemHeight,
            left: 0,
            right: 0,
            height: itemHeight,
          }}
        >
          {renderItem(items[i], i)}
        </Box>,
      );
    }
  }

  return (
    <Box ref={containerRef} onScroll={handleScroll} sx={containerSx}>
      <Box sx={{ height: totalHeight, position: "relative" }}>{visibleItems}</Box>
    </Box>
  );
}
