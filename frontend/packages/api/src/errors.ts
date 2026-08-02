import { Code, ConnectError } from "@connectrpc/connect";
import { getErrorMessageResolver } from "./runtime";

/**
 * 统一的前端错误模型。
 *
 * 网关（gateway/errors/response.go）现在输出符合 Connect 规范的错误体：
 *   { code: "unavailable", message: "后端服务暂不可用，请稍后重试",
 *     details: [{ type: "google.rpc.ErrorInfo", value: "<base64>",
 *                 debug: { reason: "NO_AVAILABLE_NODE", domain: "gateway", metadata: {...} } }] }
 * 加上响应头 X-Error-Reason。
 * 这里把 ConnectError 收敛成一个前端直接可用的结构：code 判大类，reason 判具体业务分支，
 * message 保证是可以直接渲染给用户的非空中文。
 */
export interface AppError {
    /** Connect 数值码，可直接与 Code.Unauthenticated 等比较 */
    code: Code;
    /** Connect 规范码字符串，如 "unavailable" */
    codeName: string;
    /** 业务 reason，统一大写下划线，如 "NO_AVAILABLE_NODE" */
    reason: string;
    /** 可直接展示给用户的文案，保证非空 */
    message: string;
    /** 响应头 + ErrorInfo.metadata 合并后的附加信息 */
    metadata: Record<string, string>;
    /** 原始 ConnectError，需要透传或调试时使用 */
    raw: ConnectError;
}

/** 需要退出登录并重新认证的 reason（与网关 middleware/jwt 抛出的保持一致） */
export const AUTH_REASONS = [
    "JWT_AUTHN_REQUIRED",
    "MISSING_AUTH_TOKEN",
    "TOKEN_EXPIRED",
    "TOKEN_PARSE_FAILED",
    "INVALID_TOKEN_CLAIMS",
    "UNAUTHENTICATED",
] as const;

/** 已登录但无权限的 reason，不应触发退登 */
export const PERMISSION_REASONS = [
    "PERMISSION_DENIED",
    "FORBIDDEN_ROUTE",
    "OPERATION_DENIED",
    "AUTH_CHECK_FAILED",
] as const;

const CODE_NAMES: Record<number, string> = {
    [Code.Canceled]: "canceled",
    [Code.Unknown]: "unknown",
    [Code.InvalidArgument]: "invalid_argument",
    [Code.DeadlineExceeded]: "deadline_exceeded",
    [Code.NotFound]: "not_found",
    [Code.AlreadyExists]: "already_exists",
    [Code.PermissionDenied]: "permission_denied",
    [Code.ResourceExhausted]: "resource_exhausted",
    [Code.FailedPrecondition]: "failed_precondition",
    [Code.Aborted]: "aborted",
    [Code.OutOfRange]: "out_of_range",
    [Code.Unimplemented]: "unimplemented",
    [Code.Internal]: "internal",
    [Code.Unavailable]: "unavailable",
    [Code.DataLoss]: "data_loss",
    [Code.Unauthenticated]: "unauthenticated",
};

/** reason -> 文案。仅在服务端没给 message 时兜底（正常情况下网关已经给了中文） */
const REASON_MESSAGES: Record<string, string> = {
    NO_AVAILABLE_NODE: "后端服务暂不可用，请稍后重试",
    NOT_FOUND: "请求的资源不存在",
    METHOD_NOT_ALLOWED: "请求方法不被允许",
    CANCELED: "请求已被取消",
    DEADLINE_EXCEEDED: "请求超时，请稍后重试",
    BAD_GATEWAY: "网关无法连接到后端服务",
    JWT_AUTHN_REQUIRED: "未登录或登录已失效，请重新登录",
    MISSING_AUTH_TOKEN: "缺少身份凭证，请重新登录",
    TOKEN_EXPIRED: "登录已过期，请重新登录",
    TOKEN_PARSE_FAILED: "身份凭证无效，请重新登录",
    INVALID_TOKEN_CLAIMS: "身份凭证无效，请重新登录",
    UNAUTHENTICATED: "登录状态已失效，请重新登录",
    PERMISSION_DENIED: "权限校验失败，请检查操作权限",
    FORBIDDEN_ROUTE: "当前角色无权访问该资源或页面",
    OPERATION_DENIED: "操作权限不足，请联系管理员分配权限",
    INTERNAL_ERROR: "服务内部错误，请稍后重试",
    SERVICE_UNAVAILABLE: "服务暂时不可用，请稍后再试",
};

const CODE_MESSAGES: Record<number, string> = {
    [Code.Canceled]: "请求已被取消",
    [Code.InvalidArgument]: "请求参数不合法",
    [Code.DeadlineExceeded]: "请求超时，请稍后重试",
    [Code.NotFound]: "请求的资源不存在",
    [Code.AlreadyExists]: "资源已存在",
    [Code.PermissionDenied]: "权限不足，无法执行该操作",
    [Code.ResourceExhausted]: "请求过于频繁，请稍后重试",
    [Code.FailedPrecondition]: "当前状态不允许该操作",
    [Code.Unimplemented]: "该接口尚未实现",
    [Code.Internal]: "服务内部错误，请稍后重试",
    [Code.Unavailable]: "服务暂时不可用，请稍后再试",
    [Code.Unauthenticated]: "登录状态已失效，请重新登录",
};

const FALLBACK_MESSAGE = "服务异常，请稍后重试";

/**
 * fetch 层失败时 ConnectError 携带的是浏览器原生英文文案，
 * 直接渲染给用户体验很差，这里替换成中文。
 */
const NETWORK_ERROR_PATTERNS = [
    "failed to fetch",
    "networkerror",
    "network error",
    "load failed",
    "fetch failed",
    "err_connection",
];

/** reason 兜底：服务端没给 reason 时由 code 推出一个 */
const CODE_REASONS: Record<number, string> = {
    [Code.Canceled]: "CANCELED",
    [Code.DeadlineExceeded]: "DEADLINE_EXCEEDED",
    [Code.NotFound]: "NOT_FOUND",
    [Code.PermissionDenied]: "PERMISSION_DENIED",
    [Code.Unauthenticated]: "UNAUTHENTICATED",
    [Code.Unavailable]: "SERVICE_UNAVAILABLE",
    [Code.Internal]: "INTERNAL_ERROR",
    [Code.InvalidArgument]: "INVALID_PARAM",
};

function headersToRecord(headers: Headers | undefined): Record<string, string> {
    const record: Record<string, string> = {};
    headers?.forEach((value, key) => {
        record[key] = value;
    });
    return record;
}

/**
 * 从合规的 details 里取 reason 与 metadata。
 * 走的是 Connect 规范里可选的 debug 字段，不需要 base64 解码 ErrorInfo。
 */
function readErrorInfo(err: ConnectError): { reason: string; metadata: Record<string, string> } {
    for (const detail of err.details) {
        const debug = (detail as { debug?: unknown }).debug;
        if (!debug || typeof debug !== "object") continue;

        const info = debug as { reason?: unknown; metadata?: unknown };
        if (typeof info.reason !== "string" || info.reason === "") continue;

        const metadata: Record<string, string> = {};
        if (info.metadata && typeof info.metadata === "object") {
            for (const [key, value] of Object.entries(info.metadata as Record<string, unknown>)) {
                if (typeof value === "string") metadata[key] = value;
            }
        }
        return { reason: info.reason, metadata };
    }
    return { reason: "", metadata: {} };
}

function isNetworkFailure(message: string): boolean {
    const lower = message.toLowerCase();
    return NETWORK_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

function resolveMessage(raw: ConnectError, reason: string, codeName: string): string {
    const rawMessage = raw.rawMessage?.trim() ?? "";
    const networkFailure = rawMessage !== "" && isNetworkFailure(rawMessage);

    // 接了国际化的 app 会注入解析器（见 runtime.ts 的 setErrorMessageResolver）。
    // 返回 undefined 表示不接管，下面的默认逻辑照旧。
    const resolved = getErrorMessageResolver()?.({
        reason,
        codeName,
        serverMessage: rawMessage,
        isNetworkFailure: networkFailure,
    });
    if (resolved) return resolved;

    if (rawMessage !== "" && !networkFailure) {
        return rawMessage;
    }
    if (networkFailure) {
        return "网络连接失败，请检查网络后重试";
    }
    return REASON_MESSAGES[reason] ?? CODE_MESSAGES[raw.code] ?? FALLBACK_MESSAGE;
}

/**
 * 把任意异常规整成 AppError。对非 ConnectError（网络异常、意外抛出的 Error）同样安全。
 */
export function toAppError(err: unknown): AppError {
    const raw = ConnectError.from(err);
    const headers = headersToRecord(raw.metadata);
    const info = readErrorInfo(raw);

    // reason 取值顺序：合规 details 的 debug -> 响应头 -> 由 code 推导
    const reason =
        info.reason || headers["x-error-reason"] || CODE_REASONS[raw.code] || "UNKNOWN_ERROR";
    const codeName = CODE_NAMES[raw.code] ?? "unknown";

    return {
        code: raw.code,
        codeName,
        reason,
        message: resolveMessage(raw, reason, codeName),
        metadata: { ...headers, ...info.metadata },
        raw,
    };
}

/** 认证失效：需要清 token 并重新登录 */
export function isUnauthenticated(err: AppError): boolean {
    return err.code === Code.Unauthenticated || (AUTH_REASONS as readonly string[]).includes(err.reason);
}

/** 已登录但无权限：只提示，不能触发退登，否则会和登录流程构成死循环 */
export function isPermissionDenied(err: AppError): boolean {
    return err.code === Code.PermissionDenied || (PERMISSION_REASONS as readonly string[]).includes(err.reason);
}

/** 上游不可用 / 网关连不上后端，通常可以让用户重试 */
export function isServiceUnavailable(err: AppError): boolean {
    return (
        err.code === Code.Unavailable ||
        err.reason === "NO_AVAILABLE_NODE" ||
        err.reason === "BAD_GATEWAY" ||
        err.reason === "SERVICE_UNAVAILABLE"
    );
}
