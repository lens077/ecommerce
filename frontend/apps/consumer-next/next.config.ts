import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
