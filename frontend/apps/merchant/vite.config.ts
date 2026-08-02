import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3002", 10);

export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
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
