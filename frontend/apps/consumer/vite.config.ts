import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright"; // 浏览器测试 provider
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  // 判断是否为生产构建（构建命令下 mode 通常为 'production'）
  const isProduction = mode === "production" || process.env.NODE_ENV === "production";

  // dev 代理目标：默认 dev 集群网关 LB，换环境时用环境变量覆盖，不必改代码。
  const gatewayTarget = process.env.GATEWAY_PROXY_TARGET ?? "http://192.168.3.131:8080";

  // 基础测试配置（所有环境共享）
  const baseTestConfig = {
    environment: "jsdom",
  };

  // 开发环境特有的浏览器测试配置
  const browserTestConfig = {
    browser: {
      enabled: true,
      provider: playwright(), // 使用 Playwright 作为浏览器提供者
      instances: [{ browser: "chromium" }],
      headless: true, // 在 Docker/CI 环境中必须为 true
      ui: false, // 禁用 UI 模式
    },
  };

  // 根据环境合并测试配置
  const testConfig = isProduction
    ? baseTestConfig // 生产环境无需浏览器测试
    : { ...baseTestConfig, ...browserTestConfig };

  return {
    // staged / fmt / lint 在 workspace 根的 frontend/vite.config.ts，别搬回来
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
    //     run: {
    //       cache: true,
    //     },
    test: testConfig,
    server: {
      // Tauri 壳按固定端口连 dev server，端口被占时必须报错而不是静默换号
      strictPort: true,
      // 经 Pangolin 隧道(dev.apikv.com → mac site → 127.0.0.1:3000)远程预览 dev server 用
      allowedHosts: ["dev.apikv.com"],
      // BFF 会话轨要求同源（control-tower ADR-0002）：会话 cookie 是
      // SameSite=Lax，跨站请求根本不会带上它。dev 里前端在 localhost:3000、
      // 网关在集群 LB，属跨站——所以把网关代理到同源之下。
      // 生产不需要这层：shop/gateway/casdoor 三个域同属 apikv.com，本就是 same-site。
      proxy: {
        // BFF 端点（含 OAuth 回调）：不改写路径，Casdoor 白名单里填
        // http://localhost:3000/auth/callback 即可。
        "/auth": {
          target: gatewayTarget,
          changeOrigin: false,
        },
        // Connect RPC：前端以 /api 为 baseUrl，转发时剥掉这层前缀。
        "/api": {
          target: gatewayTarget,
          changeOrigin: false,
          rewrite: (p: string) => p.replace(/^\/api/, ""),
        },
      },
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
  };
});
