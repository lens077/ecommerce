# Third-party notices

由 `scripts/gen-third-party-notices.sh` 生成,勿手工编辑;依赖变更进暂存区时 pre-commit 会自动重新生成。
后端列出 `go list -deps ./...` 实际链接进制品的 101 个模块;前端列出 `pnpm licenses list` 解析到的 212 个包(含 dev 依赖)。

## 需要人看一眼

无待处理条目:其余全部识别为宽松许可证。

已核对接受的 copyleft 条目(理由见脚本 `accepted_copyleft`,改依赖后重新判断):

- `github.com/lens077/control-tower` CC-BY-NC-SA-4.0——第一方模块,与本仓同一版权人、同一许可证;非商用与相同方式共享的约束对自己不构成额外限制
- `github.com/lens077/go-connect-kit` CC-BY-NC-SA-4.0——同上
- `@img/sharp-libvips-<platform>` LGPL-3.0-or-later——libvips 本身即 LGPL;sharp 动态链接、不修改它,运行时依赖不触发传染。仅被 consumer-next(Next.js PoC)经 next→sharp 引入,PoC 不采用即自然消失

## 按许可证统计

| 许可证 | 条目数 |
|---|---|
| MIT | 209 |
| Apache-2.0 | 51 |
| BSD-3-Clause | 16 |
| ISC | 15 |
| MPL-2.0 | 10 |
| BSD-2-Clause | 4 |
| MIT-0 | 2 |
| CC-BY-NC-SA-4.0 | 2 |
| Python-2.0 | 1 |
| CC0-1.0 | 1 |
| BlueOak-1.0.0 | 1 |
| (Apache-2.0 AND BSD-3-Clause) | 1 |

## 后端(Go 模块,101)

| 模块 | 版本 | 许可证 | 来源文件 |
|---|---|---|---|
| `buf.build/gen/go/bufbuild/protovalidate/protocolbuffers/go` | v1.36.12-20260825204119-511051f7f437.1 | Apache-2.0 | LICENSE |
| `buf.build/go/protovalidate` | v1.3.0 | Apache-2.0 | LICENSE |
| `cel.dev/expr` | v0.25.3 | Apache-2.0 | LICENSE |
| `connectrpc.com/connect` | v1.20.0 | Apache-2.0 | LICENSE |
| `connectrpc.com/cors` | v0.1.0 | Apache-2.0 | LICENSE |
| `connectrpc.com/grpchealth` | v1.5.0 | Apache-2.0 | LICENSE |
| `connectrpc.com/otelconnect` | v0.9.0 | Apache-2.0 | LICENSE |
| `connectrpc.com/validate` | v0.6.0 | Apache-2.0 | LICENSE |
| `github.com/Protocol-Lattice/GoEventBus` | v0.2.5 | MIT | LICENSE |
| `github.com/antlr4-go/antlr/v4` | v4.13.1 | BSD-3-Clause | LICENSE |
| `github.com/armon/go-metrics` | v0.4.1 | MIT | LICENSE |
| `github.com/casdoor/casdoor-go-sdk` | v1.46.0 | Apache-2.0 | LICENSE |
| `github.com/cenkalti/backoff/v5` | v5.0.3 | MIT | LICENSE |
| `github.com/cespare/xxhash/v2` | v2.3.0 | MIT | LICENSE.txt |
| `github.com/elastic/elastic-transport-go/v8` | v8.9.0 | Apache-2.0 | LICENSE |
| `github.com/elastic/go-elasticsearch/v9` | v9.4.3 | Apache-2.0 | LICENSE |
| `github.com/exaring/otelpgx` | v0.11.1 | Apache-2.0 | LICENSE |
| `github.com/fatih/color` | v1.19.0 | MIT | LICENSE.md |
| `github.com/felixge/httpsnoop` | v1.1.0 | MIT | LICENSE.txt |
| `github.com/fsnotify/fsnotify` | v1.9.0 | BSD-3-Clause | LICENSE |
| `github.com/go-logr/logr` | v1.4.4 | Apache-2.0 | LICENSE |
| `github.com/go-logr/stdr` | v1.2.2 | Apache-2.0 | LICENSE |
| `github.com/go-viper/mapstructure/v2` | v2.5.0 | MIT | LICENSE |
| `github.com/golang-jwt/jwt/v4` | v4.5.2 | MIT | LICENSE |
| `github.com/google/cel-go` | v0.30.0 | Apache-2.0 | LICENSE |
| `github.com/google/uuid` | v1.6.0 | BSD-3-Clause | LICENSE |
| `github.com/grpc-ecosystem/grpc-gateway/v2` | v2.30.0 | BSD-3-Clause | LICENSE |
| `github.com/hashicorp/consul/api` | v1.34.4 | MPL-2.0 | LICENSE |
| `github.com/hashicorp/errwrap` | v1.1.0 | MPL-2.0 | LICENSE |
| `github.com/hashicorp/go-cleanhttp` | v0.5.2 | MPL-2.0 | LICENSE |
| `github.com/hashicorp/go-hclog` | v1.6.3 | MIT | LICENSE |
| `github.com/hashicorp/go-immutable-radix` | v1.3.1 | MPL-2.0 | LICENSE |
| `github.com/hashicorp/go-metrics` | v0.6.0 | MIT | LICENSE |
| `github.com/hashicorp/go-multierror` | v1.1.1 | MPL-2.0 | LICENSE |
| `github.com/hashicorp/go-rootcerts` | v1.0.2 | MPL-2.0 | LICENSE |
| `github.com/hashicorp/golang-lru` | v1.0.2 | MPL-2.0 | LICENSE |
| `github.com/hashicorp/serf` | v0.10.4 | MPL-2.0 | LICENSE |
| `github.com/jackc/pgpassfile` | v1.0.0 | MIT | LICENSE |
| `github.com/jackc/pgservicefile` | v0.0.0-20240606120523-5a60cdf6a761 | MIT | LICENSE |
| `github.com/jackc/pgx/v5` | v5.10.0 | MIT | LICENSE |
| `github.com/jackc/puddle/v2` | v2.2.2 | MIT | LICENSE |
| `github.com/lens077/control-tower` | v0.1.7 | CC-BY-NC-SA-4.0 | LICENSE |
| `github.com/lens077/go-connect-kit` | v0.8.0 | CC-BY-NC-SA-4.0 | LICENSE |
| `github.com/lib/pq` | v1.12.3 | MIT | LICENSE |
| `github.com/mattn/go-colorable` | v0.1.15 | MIT | LICENSE |
| `github.com/mattn/go-isatty` | v0.0.23 | MIT | LICENSE |
| `github.com/mfridman/interpolate` | v0.0.2 | MIT | LICENSE.txt |
| `github.com/mitchellh/go-homedir` | v1.1.0 | MIT | LICENSE |
| `github.com/mitchellh/mapstructure` | v1.5.0 | MIT | LICENSE |
| `github.com/pelletier/go-toml/v2` | v2.4.3 | MIT | LICENSE |
| `github.com/pressly/goose/v3` | v3.27.3 | MIT | LICENSE |
| `github.com/redis/go-redis/extra/redisotel-native/v9` | v9.21.0 | BSD-2-Clause | LICENSE |
| `github.com/redis/go-redis/v9` | v9.22.0 | BSD-2-Clause | LICENSE |
| `github.com/rs/cors` | v1.11.1 | MIT | LICENSE |
| `github.com/sagikazarmark/locafero` | v0.11.0 | MIT | LICENSE |
| `github.com/sethvargo/go-retry` | v0.4.0 | Apache-2.0 | LICENSE |
| `github.com/shopspring/decimal` | v1.4.0 | MIT | LICENSE |
| `github.com/smartwalle/alipay/v3` | v3.2.29 | MIT | LICENSE |
| `github.com/smartwalle/ncrypto` | v1.0.4 | MIT | LICENSE |
| `github.com/smartwalle/ngx` | v1.1.0 | MIT | LICENSE |
| `github.com/smartwalle/nsign` | v1.0.9 | MIT | LICENSE |
| `github.com/sourcegraph/conc` | v0.3.1-0.20240121214520-5f936abd7ae8 | MIT | LICENSE |
| `github.com/spf13/afero` | v1.15.0 | Apache-2.0 | LICENSE.txt |
| `github.com/spf13/cast` | v1.10.0 | MIT | LICENSE |
| `github.com/spf13/pflag` | v1.0.10 | BSD-3-Clause | LICENSE |
| `github.com/spf13/viper` | v1.21.0 | MIT | LICENSE |
| `github.com/subosito/gotenv` | v1.6.0 | MIT | LICENSE |
| `go.opentelemetry.io/auto/sdk` | v1.2.1 | Apache-2.0 | LICENSE |
| `go.opentelemetry.io/contrib/bridges/otelzap` | v0.20.0 | Apache-2.0 | LICENSE |
| `go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp` | v0.70.0 | Apache-2.0 | LICENSE |
| `go.opentelemetry.io/contrib/instrumentation/runtime` | v0.70.0 | Apache-2.0 | LICENSE |
| `go.opentelemetry.io/otel` | v1.46.0 | Apache-2.0 | LICENSE |
| `go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp` | v0.21.0 | Apache-2.0 | LICENSE |
| `go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp` | v1.45.0 | Apache-2.0 | LICENSE |
| `go.opentelemetry.io/otel/exporters/otlp/otlptrace` | v1.46.0 | Apache-2.0 | LICENSE |
| `go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp` | v1.45.0 | Apache-2.0 | LICENSE |
| `go.opentelemetry.io/otel/log` | v0.21.0 | Apache-2.0 | LICENSE |
| `go.opentelemetry.io/otel/metric` | v1.46.0 | Apache-2.0 | LICENSE |
| `go.opentelemetry.io/otel/sdk` | v1.46.0 | Apache-2.0 | LICENSE |
| `go.opentelemetry.io/otel/sdk/log` | v0.21.0 | Apache-2.0 | LICENSE |
| `go.opentelemetry.io/otel/sdk/metric` | v1.46.0 | Apache-2.0 | LICENSE |
| `go.opentelemetry.io/otel/trace` | v1.46.0 | Apache-2.0 | LICENSE |
| `go.opentelemetry.io/proto/otlp` | v1.11.0 | Apache-2.0 | LICENSE |
| `go.uber.org/atomic` | v1.11.0 | MIT | LICENSE.txt |
| `go.uber.org/dig` | v1.19.0 | MIT | LICENSE |
| `go.uber.org/fx` | v1.24.0 | MIT | LICENSE |
| `go.uber.org/multierr` | v1.11.0 | MIT | LICENSE.txt |
| `go.uber.org/zap` | v1.28.0 | MIT | LICENSE |
| `go.yaml.in/yaml/v3` | v3.0.5 | Apache-2.0 | LICENSE |
| `golang.org/x/exp` | v0.0.0-20260820142414-ca536658362e | BSD-3-Clause | LICENSE |
| `golang.org/x/net` | v0.58.0 | BSD-3-Clause | LICENSE |
| `golang.org/x/oauth2` | v0.36.0 | BSD-3-Clause | LICENSE |
| `golang.org/x/sync` | v0.22.0 | BSD-3-Clause | LICENSE |
| `golang.org/x/sys` | v0.47.0 | BSD-3-Clause | LICENSE |
| `golang.org/x/text` | v0.41.0 | BSD-3-Clause | LICENSE |
| `google.golang.org/genproto` | v0.0.0-20260427160629-7cedc36a6bc4 | Apache-2.0 | LICENSE |
| `google.golang.org/genproto/googleapis/api` | v0.0.0-20260819154853-08b0e4226688 | Apache-2.0 | LICENSE |
| `google.golang.org/genproto/googleapis/rpc` | v0.0.0-20260819154853-08b0e4226688 | Apache-2.0 | LICENSE |
| `google.golang.org/grpc` | v1.83.2 | Apache-2.0 | LICENSE |
| `google.golang.org/protobuf` | v1.36.12 | BSD-3-Clause | LICENSE |
| `gopkg.in/yaml.v3` | v3.0.1 | Apache-2.0 | LICENSE |

## 前端(npm 包,212)

| 包 | 版本 | 许可证 | 主页 |
|---|---|---|---|
| `@asamuzakjp/css-color` | 7.1.7 | MIT | <https://github.com/asamuzaK/cssColor#readme> |
| `@asamuzakjp/dom-selector` | 10.0.4 | MIT | <https://github.com/asamuzaK/domSelector#readme> |
| `@babel/code-frame` | 7.29.7 | MIT | <https://babel.dev/docs/en/next/babel-code-frame> |
| `@babel/helper-validator-identifier` | 7.29.7 | MIT | <https://github.com/babel/babel#readme> |
| `@babel/runtime` | 7.29.10 | MIT | <https://babel.dev/docs/en/next/babel-runtime> |
| `@blazediff/core` | 1.10.0 | MIT | <https://blazediff.dev> |
| `@bramus/specificity` | 2.4.3 | MIT | <https://github.com/bramus/specificity#readme> |
| `@bufbuild/protobuf` | 2.16.0 | (Apache-2.0 AND BSD-3-Clause) | <https://protobufes.com/> |
| `@bufbuild/protoc-gen-es` | 2.16.0 | Apache-2.0 | <https://protobufes.com/> |
| `@bufbuild/protoplugin` | 2.16.0 | Apache-2.0 | <https://protobufes.com/> |
| `@commitlint/cli` | 21.2.4 | MIT | <https://commitlint.js.org/> |
| `@commitlint/config-conventional` | 21.2.4 | MIT | <https://commitlint.js.org/> |
| `@commitlint/config-validator` | 21.2.3 | MIT | <https://commitlint.js.org/> |
| `@commitlint/ensure` | 21.2.4 | MIT | <https://commitlint.js.org/> |
| `@commitlint/execute-rule` | 21.0.1 | MIT | <https://commitlint.js.org/> |
| `@commitlint/format` | 21.2.3 | MIT | <https://commitlint.js.org/> |
| `@commitlint/is-ignored` | 21.2.3 | MIT | <https://commitlint.js.org/> |
| `@commitlint/lint` | 21.2.4 | MIT | <https://commitlint.js.org/> |
| `@commitlint/load` | 21.2.4 | MIT | <https://commitlint.js.org/> |
| `@commitlint/message` | 21.2.0 | MIT | <https://commitlint.js.org/> |
| `@commitlint/parse` | 21.2.3 | MIT | <https://commitlint.js.org/> |
| `@commitlint/read` | 21.2.3 | MIT | <https://commitlint.js.org/> |
| `@commitlint/resolve-extends` | 21.2.3 | MIT | <https://commitlint.js.org/> |
| `@commitlint/rules` | 21.2.4 | MIT | <https://commitlint.js.org/> |
| `@commitlint/to-lines` | 21.0.1 | MIT | <https://commitlint.js.org/> |
| `@commitlint/top-level` | 21.2.0 | MIT | <https://commitlint.js.org/> |
| `@commitlint/types` | 21.2.3 | MIT | <https://commitlint.js.org/> |
| `@conventional-changelog/git-client` | 3.2.0 | MIT | <https://conventional-changelog.js.org/git-client/> |
| `@conventional-changelog/template` | 1.4.0 | MIT | <https://conventional-changelog.js.org/template/> |
| `@csstools/color-helpers` | 6.1.2 | MIT-0 | <https://github.com/csstools/postcss-plugins/tree/main/packages/color-helpers#readme> |
| `@csstools/css-calc` | 3.4.3 | MIT | <https://github.com/csstools/postcss-plugins/tree/main/packages/css-calc#readme> |
| `@csstools/css-color-parser` | 4.2.6 | MIT | <https://github.com/csstools/postcss-plugins/tree/main/packages/css-color-parser#readme> |
| `@csstools/css-parser-algorithms` | 4.0.2 | MIT | <https://github.com/csstools/postcss-plugins/tree/main/packages/css-parser-algorithms#readme> |
| `@csstools/css-syntax-patches-for-csstree` | 1.1.15 | MIT-0 | <https://github.com/csstools/postcss-plugins/tree/main/packages/css-syntax-patches-for-csstree#readme> |
| `@csstools/css-tokenizer` | 4.0.2 | MIT | <https://github.com/csstools/postcss-plugins/tree/main/packages/css-tokenizer#readme> |
| `@exodus/bytes` | 1.16.0 | MIT | <https://github.com/ExodusOSS/bytes> |
| `@jridgewell/resolve-uri` | 3.1.2 | MIT | <https://github.com/jridgewell/resolve-uri#readme> |
| `@jridgewell/sourcemap-codec` | 1.6.0 | MIT | <https://github.com/jridgewell/sourcemaps/tree/main/packages/sourcemap-codec> |
| `@jridgewell/trace-mapping` | 0.3.31 | MIT | <https://github.com/jridgewell/sourcemaps/tree/main/packages/trace-mapping> |
| `@oxc-parser/binding-<platform>` | 0.154.0 | MIT | <https://oxc.rs/docs/guide/usage/parser> |
| `@oxc-project/runtime` | 0.155.0 | MIT | <https://oxc.rs> |
| `@oxc-project/types` | 0.154.0 | MIT | <https://oxc.rs> |
| `@oxc-project/types` | 0.155.0 | MIT | <https://oxc.rs> |
| `@oxc-resolver/binding-<platform>` | 11.24.2 | MIT | <https://oxc.rs> |
| `@oxfmt/binding-<platform>` | 0.74.0 | MIT | <https://oxc.rs/docs/guide/usage/formatter> |
| `@oxlint-tsgolint/darwin-arm64` | 7.0.2004 | MIT | <https://github.com/oxc-project/tsgolint#readme> |
| `@oxlint/binding-<platform>` | 1.89.0 | MIT | <https://oxc.rs/docs/guide/usage/linter> |
| `@oxlint/plugins` | 1.89.0 | MIT | <https://oxc.rs/docs/guide/usage/linter/js-plugins> |
| `@playwright/test` | 1.64.1 | Apache-2.0 | <https://playwright.dev> |
| `@polka/url` | 1.0.0-next.29 | MIT | <https://github.com/lukeed/polka#readme> |
| `@simple-libs/child-process-utils` | 2.0.0 | MIT | <https://github.com/TrigenSoftware/simple-libs/tree/main/packages/child-process-utils#readme> |
| `@simple-libs/stream-utils` | 2.0.0 | MIT | <https://github.com/TrigenSoftware/simple-libs/tree/main/packages/stream-utils#readme> |
| `@testing-library/dom` | 10.4.2 | MIT | <https://github.com/testing-library/dom-testing-library#readme> |
| `@testing-library/user-event` | 14.6.8 | MIT | <https://github.com/testing-library/user-event#readme> |
| `@types/aria-query` | 5.0.4 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/aria-query> |
| `@types/chai` | 5.2.3 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/chai> |
| `@types/deep-eql` | 4.0.2 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/deep-eql> |
| `@types/estree` | 1.0.9 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/estree> |
| `@types/node` | 26.6.5 | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node> |
| `@typescript/typescript-<platform>` | 7.1.0-dev.20260904.1 | Apache-2.0 | <https://www.typescriptlang.org/> |
| `@typescript/vfs` | 1.6.5 | MIT | <https://github.com/microsoft/TypeScript-Website> |
| `@vitest/browser-playwright` | 5.0.5 | MIT | <https://vitest.dev/config/browser/playwright> |
| `@vitest/browser-preview` | 5.0.5 | MIT | <https://vitest.dev/guide/browser> |
| `@vitest/browser` | 5.0.5 | MIT | <https://vitest.dev/guide/browser/> |
| `@vitest/mocker` | 5.0.5 | MIT | <https://github.com/vitest-dev/vitest/tree/main/packages/mocker> |
| `@vitest/pretty-format` | 5.0.5 | MIT | <https://github.com/vitest-dev/vitest/tree/main/packages/pretty-format> |
| `@vitest/snapshot` | 5.0.5 | MIT | <https://vitest.dev/guide/snapshot> |
| `@vitest/spy` | 5.0.5 | MIT | <https://vitest.dev/api/mock> |
| `@vitest/ui` | 5.0.5 | MIT | <https://vitest.dev/guide/ui> |
| `@vitest/utils` | 5.0.5 | MIT | <https://github.com/vitest-dev/vitest/tree/main/packages/utils> |
| `@voidzero-dev/vite-plus-<platform>` | 1.4.0 | MIT | <https://viteplus.dev/guide> |
| `@voidzero-dev/vite-plus-core` | 1.4.0 | MIT | <https://viteplus.dev/guide> |
| `@yuku-core/binding-<platform>` | 0.19.0 | MIT | <https://github.com/yuku-toolchain/yuku#readme> |
| `@yuku-toolchain/types` | 0.19.0 | MIT | <https://github.com/yuku-toolchain/yuku#readme> |
| `ajv` | 8.20.0 | MIT | <https://ajv.js.org> |
| `ansi-regex` | 5.0.1 | MIT | <https://github.com/chalk/ansi-regex#readme> |
| `ansi-regex` | 6.4.0 | MIT | <https://github.com/chalk/ansi-regex#readme> |
| `ansi-styles` | 5.2.0 | MIT | <https://github.com/chalk/ansi-styles#readme> |
| `ansi-styles` | 6.2.3 | MIT | <https://github.com/chalk/ansi-styles#readme> |
| `argparse` | 2.0.1 | Python-2.0 | <https://github.com/nodeca/argparse#readme> |
| `argue-cli` | 3.2.0 | MIT | <https://github.com/TrigenSoftware/Argue#readme> |
| `aria-query` | 5.3.0 | Apache-2.0 | <https://github.com/A11yance/aria-query#readme> |
| `assertion-error` | 2.0.1 | MIT | <https://github.com/chaijs/assertion-error#readme> |
| `bidi-js` | 1.1.0 | MIT | <https://github.com/lojjic/bidi-js#readme> |
| `callsites` | 3.1.0 | MIT | <https://github.com/sindresorhus/callsites#readme> |
| `chai` | 6.3.0 | MIT | <http://chaijs.com> |
| `cliui` | 9.0.1 | ISC | <https://github.com/yargs/cliui#readme> |
| `conventional-changelog-angular` | 9.4.0 | ISC | <https://conventional-changelog.js.org/presets/angular/> |
| `conventional-changelog-conventionalcommits` | 10.4.1 | ISC | <https://conventional-changelog.js.org/presets/conventional-commits/> |
| `conventional-commits-parser` | 7.1.3 | MIT | <https://conventional-changelog.js.org/commits-parser/> |
| `convert-source-map` | 2.0.0 | MIT | <https://github.com/thlorenz/convert-source-map> |
| `cosmiconfig` | 9.0.2 | MIT | <https://github.com/cosmiconfig/cosmiconfig#readme> |
| `css-tree` | 3.2.1 | MIT | <https://github.com/csstree/csstree#readme> |
| `data-urls` | 8.0.0 | MIT | <https://github.com/jsdom/data-urls#readme> |
| `debug` | 4.4.3 | MIT | <https://github.com/debug-js/debug#readme> |
| `decimal.js` | 10.6.0 | MIT | <https://github.com/MikeMcl/decimal.js#readme> |
| `dequal` | 2.0.3 | MIT | <https://github.com/lukeed/dequal#readme> |
| `detect-libc` | 2.1.2 | Apache-2.0 | <https://github.com/lovell/detect-libc#readme> |
| `dom-accessibility-api` | 0.5.16 | MIT | <https://github.com/eps1lon/dom-accessibility-api#readme> |
| `emoji-regex` | 10.6.0 | MIT | <https://mths.be/emoji-regex> |
| `entities` | 8.1.0 | BSD-2-Clause | <https://github.com/fb55/entities#readme> |
| `env-paths` | 2.2.1 | MIT | <https://github.com/sindresorhus/env-paths#readme> |
| `error-ex` | 1.3.4 | MIT | <https://github.com/qix-/node-error-ex#readme> |
| `es-module-lexer` | 2.3.2 | MIT | <https://github.com/guybedford/es-module-lexer#readme> |
| `es-toolkit` | 1.52.0 | MIT | <https://es-toolkit.dev> |
| `escalade` | 3.2.0 | MIT | <https://github.com/lukeed/escalade#readme> |
| `estree-walker` | 3.0.3 | MIT | <https://github.com/Rich-Harris/estree-walker#readme> |
| `expect-type` | 1.4.0 | Apache-2.0 | <https://github.com/mmkal/expect-type#readme> |
| `fast-deep-equal` | 3.1.3 | MIT | <https://github.com/epoberezkin/fast-deep-equal#readme> |
| `fast-uri` | 3.1.9 | BSD-3-Clause | <https://github.com/fastify/fast-uri> |
| `fd-package-json` | 2.0.0 | MIT | <https://github.com/es-tooling/fd-package-json#readme> |
| `fdir` | 6.5.0 | MIT | <https://github.com/thecodrr/fdir#readme> |
| `fflate` | 0.8.3 | MIT | <https://101arrowz.github.io/fflate> |
| `flatted` | 3.4.4 | ISC | <https://github.com/WebReflection/flatted#readme> |
| `formatly` | 0.11.4 | MIT | <https://github.com/JoshuaKGoldberg/formatly#readme> |
| `fsevents` | 2.3.3 | MIT | <https://github.com/fsevents/fsevents> |
| `get-caller-file` | 2.0.5 | ISC | <https://github.com/stefanpenner/get-caller-file#readme> |
| `get-east-asian-width` | 1.7.0 | MIT | <https://github.com/sindresorhus/get-east-asian-width#readme> |
| `get-tsconfig` | 4.14.3 | MIT | <https://github.com/privatenumber/get-tsconfig#readme> |
| `global-directory` | 5.0.0 | MIT | <https://github.com/sindresorhus/global-directory#readme> |
| `html-encoding-sniffer` | 7.0.0 | MIT | <https://github.com/jsdom/html-encoding-sniffer#readme> |
| `import-fresh` | 3.3.1 | MIT | <https://github.com/sindresorhus/import-fresh#readme> |
| `ini` | 6.0.0 | ISC | <https://github.com/npm/ini#readme> |
| `is-arrayish` | 0.2.1 | MIT | <https://github.com/qix-/node-is-arrayish#readme> |
| `is-plain-obj` | 4.1.0 | MIT | <https://github.com/sindresorhus/is-plain-obj#readme> |
| `is-potential-custom-element-name` | 1.0.1 | MIT | <https://github.com/mathiasbynens/is-potential-custom-element-name> |
| `jiti` | 2.7.0 | MIT | <https://github.com/unjs/jiti#readme> |
| `js-tokens` | 4.0.0 | MIT | <https://github.com/lydell/js-tokens#readme> |
| `js-yaml` | 4.3.2 | MIT | <https://github.com/nodeca/js-yaml#readme> |
| `jsdom` | 30.1.3 | MIT | <https://github.com/jsdom/jsdom#readme> |
| `json-parse-even-better-errors` | 2.3.1 | MIT | <https://github.com/npm/json-parse-even-better-errors#readme> |
| `json-schema-traverse` | 1.0.0 | MIT | <https://github.com/epoberezkin/json-schema-traverse#readme> |
| `knip` | 6.42.1 | ISC | <https://knip.dev> |
| `lightningcss-<platform>` | 1.33.0 | MPL-2.0 | <https://github.com/parcel-bundler/lightningcss#readme> |
| `lightningcss` | 1.33.0 | MPL-2.0 | <https://github.com/parcel-bundler/lightningcss#readme> |
| `lines-and-columns` | 1.2.4 | MIT | <https://github.com/eventualbuddha/lines-and-columns#readme> |
| `lru-cache` | 11.5.3 | BlueOak-1.0.0 | <https://github.com/isaacs/node-lru-cache#readme> |
| `lz-string` | 1.5.0 | MIT | <http://pieroxy.net/blog/pages/lz-string/index.html> |
| `magic-string` | 1.4.3 | MIT | <https://github.com/Rich-Harris/magic-string#readme> |
| `mdn-data` | 2.27.1 | CC0-1.0 | <https://developer.mozilla.org> |
| `mrmime` | 2.0.1 | MIT | <https://github.com/lukeed/mrmime#readme> |
| `ms` | 2.1.3 | MIT | <https://github.com/vercel/ms#readme> |
| `nanoid` | 3.3.20 | MIT | <https://github.com/ai/nanoid#readme> |
| `obug` | 3.0.0 | MIT | <https://github.com/sxzz/obug#readme> |
| `oxc-parser` | 0.154.0 | MIT | <https://oxc.rs/docs/guide/usage/parser> |
| `oxc-resolver` | 11.24.2 | MIT | <https://oxc.rs> |
| `oxfmt` | 0.74.0 | MIT | <https://oxc.rs/docs/guide/usage/formatter> |
| `oxlint-tsgolint` | 7.0.2004 | MIT | <https://github.com/oxc-project/tsgolint#readme> |
| `oxlint` | 1.89.0 | MIT | <https://oxc.rs/docs/guide/usage/linter> |
| `package-manager-detector` | 1.9.0 | MIT | <https://github.com/antfu-collective/package-manager-detector#readme> |
| `parent-module` | 1.0.1 | MIT | <https://github.com/sindresorhus/parent-module#readme> |
| `parse-json` | 5.2.0 | MIT | <https://github.com/sindresorhus/parse-json#readme> |
| `parse5` | 8.0.1 | MIT | <https://parse5.js.org> |
| `pathe` | 2.0.3 | MIT | <https://github.com/unjs/pathe#readme> |
| `picocolors` | 1.1.1 | ISC | <https://github.com/alexeyraspopov/picocolors#readme> |
| `picomatch` | 4.0.7 | MIT | <https://github.com/micromatch/picomatch> |
| `playwright-core` | 1.64.1 | Apache-2.0 | <https://playwright.dev> |
| `playwright` | 1.64.1 | Apache-2.0 | <https://playwright.dev> |
| `pngjs` | 7.0.0 | MIT | <https://github.com/lukeapage/pngjs> |
| `postcss` | 8.5.31 | MIT | <https://postcss.org/> |
| `pretty-format` | 27.5.1 | MIT | <https://github.com/facebook/jest#readme> |
| `punycode` | 2.3.1 | MIT | <https://mths.be/punycode> |
| `react-is` | 17.0.2 | MIT | <https://reactjs.org/> |
| `require-from-string` | 2.0.2 | MIT | <https://github.com/floatdrop/require-from-string#readme> |
| `resolve-from` | 4.0.0 | MIT | <https://github.com/sindresorhus/resolve-from#readme> |
| `resolve-from` | 5.0.0 | MIT | <https://github.com/sindresorhus/resolve-from#readme> |
| `resolve-pkg-maps` | 1.0.0 | MIT | <https://github.com/privatenumber/resolve-pkg-maps#readme> |
| `saxes` | 6.0.0 | ISC | <https://github.com/lddubeau/saxes#readme> |
| `semver` | 7.8.5 | ISC | <https://github.com/npm/node-semver#readme> |
| `sirv` | 3.0.2 | MIT | <https://github.com/lukeed/sirv#readme> |
| `smol-toml` | 1.9.1 | BSD-3-Clause | <https://github.com/squirrelchat/smol-toml#readme> |
| `source-map-js` | 1.2.2 | BSD-3-Clause | <https://github.com/7rulnik/source-map-js> |
| `std-env` | 4.3.0 | MIT | <https://github.com/unjs/std-env#readme> |
| `string-width` | 7.2.0 | MIT | <https://github.com/sindresorhus/string-width#readme> |
| `string-width` | 8.3.0 | MIT | <https://github.com/sindresorhus/string-width#readme> |
| `strip-ansi` | 7.2.0 | MIT | <https://github.com/chalk/strip-ansi#readme> |
| `strip-json-comments` | 5.0.3 | MIT | <https://github.com/sindresorhus/strip-json-comments#readme> |
| `tinybench` | 6.2.2 | MIT | <https://github.com/tinylibs/tinybench#readme> |
| `tinyexec` | 1.3.1 | MIT | <https://github.com/tinylibs/tinyexec#readme> |
| `tinyglobby` | 0.2.17 | MIT | <https://superchupu.dev/tinyglobby> |
| `tinypool` | 2.2.0 | MIT | <https://github.com/tinylibs/tinypool#readme> |
| `tinyrainbow` | 3.2.0 | MIT | <https://github.com/tinylibs/tinyrainbow#readme> |
| `tldts-core` | 7.4.19 | MIT | <https://github.com/remusao/tldts#readme> |
| `tldts` | 7.4.19 | MIT | <https://github.com/remusao/tldts#readme> |
| `totalist` | 3.0.1 | MIT | <https://github.com/lukeed/totalist#readme> |
| `tough-cookie` | 6.0.2 | BSD-3-Clause | <https://github.com/salesforce/tough-cookie> |
| `tr46` | 7.0.0 | MIT | <https://github.com/jsdom/tr46#readme> |
| `typescript` | 5.4.5 | Apache-2.0 | <https://www.typescriptlang.org/> |
| `typescript` | 7.1.0-dev.20260904.1 | Apache-2.0 | <https://www.typescriptlang.org/> |
| `unbash` | 6.0.1 | ISC | <https://github.com/webpro-nl/unbash#readme> |
| `undici-types` | 8.9.0 | MIT | <https://undici.nodejs.org> |
| `undici` | 8.12.3 | MIT | <https://undici.nodejs.org> |
| `verkit` | 0.5.0 | MIT | <https://github.com/sxzz/verkit#readme> |
| `vite-plus` | 1.4.0 | MIT | <https://viteplus.dev/guide> |
| `vitest` | 5.0.5 | MIT | <https://vitest.dev> |
| `w3c-xmlserializer` | 6.0.0 | MIT | <https://github.com/jsdom/w3c-xmlserializer#readme> |
| `walk-up-path` | 4.0.0 | ISC | <https://github.com/isaacs/walk-up-path#readme> |
| `webidl-conversions` | 8.0.1 | BSD-2-Clause | <https://github.com/jsdom/webidl-conversions#readme> |
| `whatwg-mimetype` | 5.0.0 | MIT | <https://github.com/jsdom/whatwg-mimetype#readme> |
| `whatwg-url` | 17.3.0 | MIT | <https://github.com/jsdom/whatwg-url#readme> |
| `why-is-node-running` | 3.2.1 | MIT | <https://github.com/mafintosh/why-is-node-running> |
| `wrap-ansi` | 9.0.2 | MIT | <https://github.com/chalk/wrap-ansi#readme> |
| `ws` | 8.22.0 | MIT | <https://github.com/websockets/ws> |
| `xml-name-validator` | 5.0.0 | Apache-2.0 | <https://github.com/jsdom/xml-name-validator#readme> |
| `xmlchars` | 2.2.0 | MIT | <https://github.com/lddubeau/xmlchars#readme> |
| `y18n` | 5.0.8 | ISC | <https://github.com/yargs/y18n> |
| `yaml` | 2.9.1 | ISC | <https://eemeli.org/yaml/> |
| `yargs-parser` | 22.0.0 | ISC | <https://github.com/yargs/yargs-parser#readme> |
| `yargs` | 18.2.0 | MIT | <https://yargs.js.org/> |
| `yuku-core` | 0.19.0 | MIT | <https://github.com/yuku-toolchain/yuku#readme> |
| `yuku-parser` | 0.19.0 | MIT | <https://github.com/yuku-toolchain/yuku#readme> |
| `zod` | 4.6.7 | MIT | <https://zod.dev> |
