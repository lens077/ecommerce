/// <reference types="vite-plus" />
import { defineConfig } from "vite-plus";

// workspace 根配置。这里不跑任何 app，只承载 vite-plus 的仓库级工具链设置。
//
// staged / fmt / lint 三块必须写在这里而不是某个 app 的 vite.config：
//   - lint 的 options.typeAware 被 oxlint 硬性限制为「只允许根配置」，
//     写在 apps/*/vite.config.ts 里会直接报错，vp lint 整条挂掉；
//   - vp staged（pre-commit 钩子调的）只读根配置，写在 app 层等于没写，
//     提交时会报 No "staged" config found；
//   - vp fmt 的编辑器集成也是认根目录的 ./vite.config.ts。

// 生成物不进 lint 也不进 fmt——改了会被下一次生成覆盖，报的错也不该由人来修。
// src/gen 是 buf 生成的 protobuf 客户端，routeTree.gen.ts 是 tanstack-router 生成的路由树。
// （旧前端 biome.json 的 files.includes 里本来就排除了这两项，这条意图在迁移时丢了。）
const IGNORED = ["**/src/gen/**", "**/routeTree.gen.ts", "**/dist/**", "**/src-tauri/target/**"];

export default defineConfig({
  // pre-commit 钩子：对暂存文件跑格式化 + lint 并自动修复
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: IGNORED,
  },
  lint: {
    ignorePatterns: IGNORED,
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
