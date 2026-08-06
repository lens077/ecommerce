import { defineConfig } from "vite-plus";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";

const host = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3002", 10);

export default defineConfig(() => {
  return {
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
    server: {
      host,
      port,
      // Tauri 壳按固定端口连 dev server，端口被占时必须报错而不是静默换号
      strictPort: true,
    },
  };
});
