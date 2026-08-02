# frontend-api（前端 API 层）

**代码路径**：`frontend/packages/api/`（共享传输层）+ `frontend/apps/*/src/api/`（各 app 的域客户端）

跨 app 的前端数据访问层。四个 app（consumer / merchant / admin / config）共用
`@ecommerce/api` 的 transport、拦截器与错误模型，所以这一层的约定改一处、影响四个 app。

## 关键结构

| 路径 | 作用 |
|---|---|
| `packages/api/src/transport.ts` | `getSharedTransport()`（带 auth）/ `getPublicTransport()`（免鉴权）两个懒单例 |
| `packages/api/src/runtime.ts` | 运行时可注入的 `baseUrl` / `fetch` / 错误文案解析器（桌面端靠它换实现） |
| `packages/api/src/errors.ts` | `toAppError()` 与 `AppError`，Connect 错误 → 可直接渲染的中文 |
| `packages/api/src/interceptors/` | `auth` / `logger` / `error`，`errorInterceptor` 负责触发全局退登 |
| `apps/*/src/gen/` | buf 从 `backend/api/` 生成的 protobuf-es v2 代码（**生成物**） |
| `apps/*/src/hooks/use*.ts` | connect-query hook，数据拉取的唯一入口（见下方 SOP） |
| `apps/*/src/api/` | 只剩表单类型与非 RPC 工具；RPC 包装层已删（config 除外，待迁出） |

## sop

| 场景 | 文件 |
|---|---|
| 组件里要拿后端数据 / 写操作 / 缓存失效 / 报错展示 | [connect-query.md](sop/connect-query.md) |

## 已知注意事项

- **transport 只能有单例**。connect-query 的 query key 里带 transport 引用，
  多个实例会切出互不相通的缓存命名空间。consumer 已从 8 个实例收敛到 2 个
  （带 auth + 免鉴权），见 SOP 第 2 节。业务代码不要再直接调 `createAppTransport()`。
- **transport 创建时就固化 `baseUrl` 与 `fetch`**。桌面端（Tauri）要先
  `setGatewayBaseUrl()` / `setAppFetch()` 再取 transport，顺序反了就连的是默认 localhost。
- `product` / `search` 是公开接口，**不带 `authInterceptor`**，是唯一允许存在的第二个 transport。
- 错误一律过 `toAppError`，不要写 `err.message` 兜底 —— 会漏出浏览器原生英文并绕开 i18n。
- 认证失效由 `errorInterceptor` 统一 `emitAuthError`，**组件里不要再判一次**。

## 相关

- [`consumer/INDEX.md`](../consumer/INDEX.md) —— consumer 的页面结构
- [`consumer/experience/duplicate-cart-queries.md`](../consumer/experience/duplicate-cart-queries.md) —— 手写 queryKey 导致重复请求
- [`gateway/INDEX.md`](../gateway/INDEX.md) —— 错误体格式与 `X-Error-Reason` 由网关产出
