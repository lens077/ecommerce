# consumer（消费者端）

面向买家的前台：商品浏览与搜索、购物车、下单与支付、收货地址、订单查询。
默认端口 3000，`pnpm dev`（在 `frontend/` 下）启动。

monorepo 的整体结构、分包原则、`conf / utils / hooks / providers` 四层职责表
和工具链说明都在 [`frontend/README.md`](../../README.md)，这里只写 consumer 自己的事。

## 只在这个 app 里的东西

- `src/routes/` —— TanStack Router 文件式路由；`routeTree.gen.ts` 是生成物
- `src/gen/` —— buf 从 `backend/api` 的 proto 生成的 Connect 客户端，同样是生成物
- `src/store/` —— valtio 的通知队列
- `src/themes/`、`src/styles/`、`src/base.css` —— MUI 主题与全局样式
- `src/reportWebVitals.ts` —— Web Vitals 上报

## 桌面端

`@ecommerce/desktop` 的 `pnpm desktop` 会启动 Tauri 壳并连到本 app 的 dev server，
所以 `vite.config.ts` 里的 `server.strictPort: true` 不能去掉 —— 端口被占时必须报错，
静默换号会让壳连到一个空窗口。
