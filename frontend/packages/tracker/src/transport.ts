import type { RecommendResult, WireEvent } from "./types"

const SERVICE = "/behavior.v1.BehaviorService"

/**
 * 直接手写 Connect 的 unary JSON 线格式，不用 @connectrpc/connect-web 生成的客户端。
 *
 * 原因只有一个：navigator.sendBeacon 不允许设置任何自定义请求头，
 * 生成的客户端一定会带上 Connect-Protocol-Version。而页面关闭时的最后一次上报
 * 只有 sendBeacon 能送出去（fetch 会被浏览器连同页面一起干掉），
 * 那恰恰是停留时长最完整的一次。
 *
 * connect-go 默认不强制校验 Connect-Protocol-Version（除非开
 * WithRequireConnectProtocolHeader），所以裸 POST + application/json 就能被正确解析。
 */
export interface TrackPayload {
    anonId: string
    sessionId: string
    events: WireEvent[]
}

/** 页面存活时的常规上报。 */
export async function postTrack(gatewayUrl: string, payload: TrackPayload): Promise<void> {
    await fetch(endpoint(gatewayUrl, "Track"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
        keepalive: true,
    })
}

/**
 * 页面即将卸载时的上报。
 * 返回 false 表示浏览器拒收（多半是超过了 64KB 的 beacon 上限），调用方需要降级。
 */
export function beaconTrack(gatewayUrl: string, payload: TrackPayload): boolean {
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
        return false
    }
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" })
    try {
        return navigator.sendBeacon(endpoint(gatewayUrl, "Track"), blob)
    } catch {
        return false
    }
}

export async function postRecommend(
    gatewayUrl: string,
    body: {
        anonId: string
        category?: string
        n?: number
        offset?: number
        sessionEvents?: WireEvent[]
    },
): Promise<RecommendResult> {
    return unary<RecommendResult>(gatewayUrl, "Recommend", body)
}

export async function postSimilarItems(
    gatewayUrl: string,
    body: { itemId: string; category?: string; n?: number },
): Promise<RecommendResult> {
    return unary<RecommendResult>(gatewayUrl, "SimilarItems", body)
}

async function unary<T>(gatewayUrl: string, method: string, body: unknown): Promise<T> {
    const resp = await fetch(endpoint(gatewayUrl, method), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
    })
    if (!resp.ok) {
        const text = await resp.text().catch(() => "")
        throw new Error(`behavior ${method} failed: ${resp.status} ${text}`)
    }
    // proto3 JSON 会省略零值字段，items 缺失就是空列表
    const data = (await resp.json()) as Partial<T> & { items?: unknown }
    if (data.items === undefined) {
        return { ...data, items: [] } as T
    }
    return data as T
}

function endpoint(gatewayUrl: string, method: string): string {
    return `${gatewayUrl.replace(/\/+$/, "")}${SERVICE}/${method}`
}
