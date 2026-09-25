import { defineConfig } from "vite-plus";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";

const host = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3002", 10);

export default defineConfig(() => {
  return {
    test:
      process.env.CI_LOW_MEMORY === "1"
        ? { maxWorkers: 1, fileParallelism: false, maxConcurrency: 1 }
        : {},
    // Vite Plus 内置 React；路由插件负责把文件路由拆成按需加载的 chunk。
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
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
        output: {
          codeSplitting: {
            groups: [
              {
                name: "zrender",
                test: /node_modules[\\/]zrender[\\/]/,
                priority: 20,
              },
              {
                name: "echarts",
                test: /node_modules[\\/]echarts[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    server: {
      host,
      port,
      // Tauri 壳按固定端口连 dev server，端口被占时必须报错而不是静默换号
      strictPort: true,
    },
  };
});
