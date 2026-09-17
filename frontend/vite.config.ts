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

// K8s 部署清单是 KYAML（scripts/verify-kyaml.sh 强制），由 `yamlfmt -o=kyaml` 排版，
// 不能再经 vp fmt 的 YAML 格式化器——两个 formatter 会互相推翻：vp fmt 把 KYAML 的
// `images: [{ … }]` 拆成换行、缩进改 8 格，并重排多行字符串，于是 verify-kyaml 红、
// scripts/promote-release.py 的 `^    newTag: "…",` 回写正则同时失配。
// 2026-09-18 实测：一次 `pnpm ready` 就让 frontend/ 下 9 个部署清单一起坏掉，
// 而 backend/ 下的同类文件毫发无损——因为 vp 只管 frontend workspace。
// 这些文件不进 lint（oxlint 不看 YAML），所以只加到 fmt 的忽略清单。
const DEPLOY_MANIFESTS = ["**/deploy/**/*.yaml", "**/deploy/**/*.yml"];

export default defineConfig({
  // pre-commit 钩子：对暂存文件跑格式化 + lint 并自动修复
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [...IGNORED, ...DEPLOY_MANIFESTS],
  },
  lint: {
    ignorePatterns: IGNORED,
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    // a11y 静态门禁（见 docs/frontend/accessibility.md §四.1，2026-08-31 红测通过）。
    // ⚠️ oxlint 的 plugins 字段是「整体替换」语义：显式写它就会覆盖默认插件集
    // （react/unicorn/typescript/oxc），只写 ["jsx-a11y"] 会静默关掉现有规则——
    // 所以默认四项必须一并列出。验证方法：改动后 vp lint 的规则计数应上升而非下降。
    plugins: ["react", "unicorn", "typescript", "oxc", "jsx-a11y"],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      // jsx-a11y 插件启用后 correctness 类规则自动生效；下列高价值规则显式钉成
      // error，不随将来 categories 调整而漂移。
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/heading-has-content": "error",
      // 内联 SVG（生成艺术/图标）用 role="img" + aria-label 是无障碍 SVG 的
      // 推荐模式，无法替换成 <img>；该规则对这类用法系统性误报，关闭。
      "jsx-a11y/prefer-tag-over-role": "off",
    },
    options: { typeAware: true, typeCheck: true },
  },
});
