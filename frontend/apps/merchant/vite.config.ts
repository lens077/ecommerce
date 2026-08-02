/// <reference types="vite-plus" />
import { defineConfig } from "vite-plus";
import { resolve } from "node:path";

const host = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3002", 10);

export default defineConfig(() => {
  return {
    // 不需要 @vitejs/plugin-react：vite-plus 内置 React 支持，
    // 另外三个 app 也都没有显式挂这个插件
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
