import { useCallback, useEffect, useRef } from "react"

import { tracker } from "./tracker"
import type { RecommendResult, TrackedEvent } from "./types"

/**
 * 把 ref 挂到商品卡片上就会自动上报曝光：
 *
 *   const ref = useImpression(spu.spuCode, `search:${keyword}`)
 *   return <Card ref={ref}>...</Card>
 *
 * itemId 变了会重新观察，组件卸载会自动解绑。
 */
export function useImpression<T extends Element>(
    itemId: string,
    source?: string,
): (el: T | null) => void {
    const disposeRef = useRef<(() => void) | null>(null)

    // 卸载时收尾。ref 回调本身在元素被移除时会带着 null 再调一次，
    // 但 React 严格模式下的双重挂载会绕过它，所以这里补一道。
    useEffect(() => {
        return () => {
            disposeRef.current?.()
            disposeRef.current = null
        }
    }, [])

    return useCallback(
        (el: T | null) => {
            disposeRef.current?.()
            disposeRef.current = el ? tracker().observeImpression(el, itemId, source) : null
        },
        [itemId, source],
    )
}

/**
 * 商品详情页用。进入时记一次 read，停留时长在离开时结算。
 *
 *   useProductView(spu.spuCode, "search:手机")
 */
export function useProductView(itemId: string, source?: string): void {
    useEffect(() => {
        if (!itemId) return
        const t = tracker()
        t.read(itemId, source)
        return t.startDwell(itemId, source)
    }, [itemId, source])
}

/** 事件上报的函数式入口，避免在组件里到处 import tracker()。 */
export function useTrack(): (event: TrackedEvent) => void {
    return useCallback((event: TrackedEvent) => tracker().track(event), [])
}

/**
 * 推荐列表的取数函数。故意不自带缓存和状态 ——
 * 应用里已经有 @tanstack/react-query，交给它管才不会出现两套缓存。
 *
 *   const { data } = useQuery({
 *     queryKey: ["recommend", category],
 *     queryFn: () => recommend({ category, n: 20 }),
 *   })
 */
export function recommend(params?: {
    category?: string
    n?: number
    offset?: number
    sessionEvents?: TrackedEvent[]
}): Promise<RecommendResult> {
    return tracker().recommend(params)
}

export function similarItems(
    itemId: string,
    params?: { category?: string; n?: number },
): Promise<RecommendResult> {
    return tracker().similarItems(itemId, params)
}
