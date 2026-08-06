import { defineConfig } from "vite-plus";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";

const host = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3003", 10);

export default defineConfig(() => {
  return {
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
    server: {
      host,
      port,
    },
  };
});
