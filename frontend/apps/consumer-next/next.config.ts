import type { NextConfig } from "next";

// EdgeOne Pages 走无服务器源码构建（官方文档默认 npm run build → .next，无 Docker 支持），
// 不需要 K8s 用的 standalone 产物；K8s 部署保持默认 standalone 不变。
// 用 EDGEONE_BUILD=1 区分两条构建路径，避免改动 K8s 部署形态。
// EDGEONE_BUILD=1 是构建期环境变量，只能在 EdgeOne 控制台配（edgeone.json 表达不了环境变量）。
// 注意：EdgeOne 项目根目录必须指向本应用目录（frontend/apps/consumer-next）——构建器的框架
// 识别只认根目录下的 package.json/next.config/app，指到 frontend/ 会退化成纯静态构建全站 404，
// 详见 frontend/README.md「部署到 EdgeOne Pages（consumer-next）」。
const nextConfig: NextConfig = {
  output: process.env.EDGEONE_BUILD === "1" ? undefined : "standalone",
  // 低内存 CI 限制页面生成 worker；不关闭类型检查或更换构建器。
  ...(process.env.CI_LOW_MEMORY === "1" ? { experimental: { cpus: 1 } } : {}),
  allowedDevOrigins: ["127.0.0.1"],
  // 灯市视觉 token / 演示数据是 TS 源码形式的 workspace 包,需要 Next 代为转译
  transpilePackages: ["@ecommerce/lantern"],
  async rewrites() {
    return [
      // 根路径首页:内部改写到 zh(不是 redirect——多一跳 RTT 会直接吃掉 LCP),
      // 浏览器地址栏仍是 /。集群 HTTPRoute 把 `/` Exact 指到本服务(见 deploy/base/dev.yaml)。
      { source: "/", destination: "/zh" },
    ];
  },
};

export default nextConfig;
