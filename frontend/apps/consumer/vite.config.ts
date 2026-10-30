import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright"; // 浏览器测试 provider
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import type { Plugin } from "vite-plus";

/**
 * 版本指纹插件：给每次构建一个唯一的 buildId，两端配合完成「标签页过期检测」——
 * 1. define 把 buildId 编译进产物（运行时内存里的「我的版本」）；
 * 2. closeBundle 把同一个 buildId 写进 dist/version.json（磁盘上的「最新版本」）。
 * 老标签页重新可见时 fetch version.json 与内存值比对，不一致即说明服务器上有了新
 * 构建产物。触发它的具体事故与完整设计见 src/lib/versionCheck.ts 头注。
 */
function versionManifest(): Plugin[] {
  // 时间戳够用：检测只需要「每次构建不同」，不需要可读或可复现。
  const buildId = Date.now().toString(36);
  return [
    {
      name: "version-manifest:define",
      config: () => ({ define: { __BUILD_ID__: JSON.stringify(buildId) } }),
    },
    {
      name: "version-manifest:emit",
      apply: "build",
      // 用 generateBundle（而不是 closeBundle）让 version.json 进 bundle，
      // 与其他产物一起走预览/部署，避免拿到 outDir 相对路径再自己拼盘。
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ buildId }),
        });
      },
    },
  ];
}

export default defineConfig(({ mode }) => {
  // 判断是否为生产构建（构建命令下 mode 通常为 'production'）
  const isProduction = mode === "production" || process.env.NODE_ENV === "production";

  // dev 代理目标：Mac /etc/hosts 把 gateway.dev.test 映射到 192.168.3.121（Cilium Gateway）
  // → control-tower。业务 HTTPRoute 只挂 443 listener，故必须 https；证书为集群内部 CA，
  // 所以下方 proxy 配 secure:false（仅 dev 信任）。换环境用 GATEWAY_PROXY_TARGET 覆盖。
  // hosts 条目见 context/team/local-env.md；未配置时这里会解析失败。
  // 2026-08-28 订正：旧默认 http://192.168.3.131:8080 的 LB 已不存在。
  const gatewayTarget = process.env.GATEWAY_PROXY_TARGET ?? "https://gateway.dev.test";

  // 试点默认关闭；显式设为 1 时才加载原生 Oxc React Compiler。
  const reactCompilerEnabled = process.env.REACT_COMPILER === "1";

  // 基础测试配置（所有环境共享）
  const baseTestConfig = {
    // 1Gi CI 中 workspace 串行不足以限制应用内的测试 worker；保持测试范围与隔离不变。
    ...(process.env.CI_LOW_MEMORY === "1"
      ? { maxWorkers: 1, fileParallelism: false, maxConcurrency: 1 }
      : {}),
    environment: "jsdom",
    // Node 25+ 默认开启实验性 Web Storage：globalThis.localStorage 变成 Node 自己的
    // getter，未给 --localstorage-file 时恒返回 undefined，jsdom 环境覆盖不掉它，
    // 于是 users.test.ts 的 localStorage.clear() 报「reading 'clear' of undefined」。
    // engines 允许 >=26（CI 是 22 所以没红），本机 Node 26 实测 2026-09-08。
    // 关掉这个实验特性让 jsdom 的 localStorage 重新生效；22/24 上该 flag 是 no-op。
    execArgv: ["--no-experimental-webstorage"],
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
      ...(reactCompilerEnabled ? [react({ compiler: true })] : []),
      ...versionManifest(),
    ],
    //     run: {
    //       cache: true,
    //     },
    test: testConfig,
    server: {
      // Tauri 壳按固定端口连 dev server，端口被占时必须报错而不是静默换号
      strictPort: true,
      // 不设 allowedHosts:走 Vite 默认(仅回环)。原先为经 Pangolin 隧道远程预览开了
      // `dev.apikv.com`,该资源已于 2026-08-29 随 dev 子域一并删除(实测 404),配置一并移除。
      // 若将来重开远程预览,需同时:建 Pangolin 资源 → 指向当前 mac 站点(siteId 6)→ 在此加回域名。
      // BFF 会话轨要求同源（control-tower ADR-0002）：会话 cookie 是
      // SameSite=Lax，跨站请求根本不会带上它。dev 里前端在 localhost:3000、
      // 网关在集群 LB，属跨站——所以把网关代理到同源之下。
      // 生产不需要这层：shop/gateway/casdoor 三个域同属 apikv.com，本就是 same-site。
      proxy: {
        // 经 Cilium Gateway 的域名路由需要 SNI/Host = gateway.dev.test，所以 changeOrigin: true；
        // secure: false 只是让 dev 代理信任集群内部 CA 证书。
        // ⚠️ BFF 登录联调注意：changeOrigin 会把上游看到的 Host 变成 gateway.dev.test；
        // 若 OAuth 回调链路需要保留 localhost:3000 语义，用 GATEWAY_PROXY_TARGET 指向
        // `kubectl port-forward svc/ecommerce-gateway-service -n ecommerce 18080:8080` 的 http://127.0.0.1:18080（直连网关、不经 Host 路由）。
        // BFF 端点（含 OAuth 回调）：不改写路径，Casdoor 白名单里填
        // http://localhost:3000/auth/callback 即可。
        "/auth": {
          target: gatewayTarget,
          changeOrigin: true,
          secure: false,
        },
        // Connect RPC：前端以 /api 为 baseUrl，转发时剥掉这层前缀。
        "/api": {
          target: gatewayTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (p: string) => p.replace(/^\/api/, ""),
        },
      },
    },
    build: {
      // 字体切片不内联:@fontsource 的小切片(<4KB)默认会被 base64 进 CSS,实测占了 63KB
      assetsInlineLimit: (filePath: string) => (/\.woff2?$/.test(filePath) ? false : undefined),
      rolldownOptions: {
        // 本 app 是纯客户端 SPA，没有 RSC 边界，第三方包（MUI / tanstack router
        // 与 react-query）里的 "use client" 没有任何消费者，rolldown 却会为每个
        // 带指令的模块各报一条 MODULE_LEVEL_DIRECTIVE——一次 build 近 300 条，
        // 把真正该看的告警淹掉。这里关的只是「use strict 之外的模块级指令」这一类。
        // 注意 apps/consumer-next 走 next build，不受此处影响，它的 RSC 指令照常保留。
        checks: { moduleLevelDirective: false },
        output: {
          // 合并小 chunk:默认分包把 MUI 拆成 40 多个 0–2KB 的组件 chunk,首绘前 46 个请求,
          // 150ms RTT 下队头开销比字节本身贵(2026-09-15 实测 /categories 移动端)。
          // 三组:react 运行时 / 路由与查询 / MUI+emotion;业务代码仍按路由懒加载。
          codeSplitting: {
            groups: [
              {
                name: "react",
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 30,
              },
              { name: "tanstack", test: /node_modules[\\/]@tanstack[\\/]/, priority: 20 },
              { name: "mui", test: /node_modules[\\/](@mui|@emotion)[\\/]/, priority: 20 },
            ],
          },
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
