import { defineConfig } from "vite-plus";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";

const host = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3003", 10);
// dev 默认走 control-tower 的同源代理；测试或本地联调可用环境变量覆盖。
const gatewayTarget = process.env.GATEWAY_PROXY_TARGET ?? "https://gateway.dev.test";

export default defineConfig(() => {
  return {
    test:
      process.env.CI_LOW_MEMORY === "1"
        ? { maxWorkers: 1, fileParallelism: false, maxConcurrency: 1 }
        : {},
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        // 必须写绝对路径：oxlint/oxfmt 以 workspace 根为 cwd 加载各 app 的配置，
        // 而这两项默认相对 cwd 解析，写相对路径会让 vp lint/fmt 去 frontend/src/routes 找。
        routesDirectory: resolve(__dirname, "./src/routes"),
        generatedRouteTree: resolve(__dirname, "./src/routeTree.gen.ts"),
      }),
    ],
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
    build: {
      rolldownOptions: {
        // 本 app 是纯客户端 SPA，没有 RSC 边界，第三方包（MUI / tanstack router
        // 与 react-query）里的 "use client" 没有任何消费者，rolldown 却会为每个
        // 带指令的模块各报一条 MODULE_LEVEL_DIRECTIVE——一次 build 近 300 条，
        // 把真正该看的告警淹掉。这里关的只是「use strict 之外的模块级指令」这一类。
        // 注意 apps/consumer-next 走 next build，不受此处影响，它的 RSC 指令照常保留。
        checks: { moduleLevelDirective: false },
      },
    },
    server: {
      host,
      port,
      proxy: {
        "/auth": {
          target: gatewayTarget,
          changeOrigin: true,
          secure: false,
        },
        "/api": {
          target: gatewayTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path: string) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
