# 交接：删除 products.outbox 与 consumer 高风险页面整改

这份文档供新会话直接接手，覆盖用户要求的两件事：完成删表迁移，解决地址簿、结算页和登录态模块的问题。它记录交接快照与执行边界，不替代 `TODO.md` 的项目进度。

**接手顺序：先核对工作区 → 完成迁移代码与隔离库验证 → 前端 01 → 共用 hook 与表单 → 03、04 → 05 → 全量验收。** 详细前端实现单已存在，无需重新做一轮 Repowise 调研。

## 1. 任务与授权边界

- 工作区：`/Users/lens/lens077/ecommerce`。新会话先用 `pwd` 确认，不从工具或其他 checkout 的路径推断。
- 用户已要求解决删表与前端问题；本轮仅生成交接文档，没有继续实现业务代码。
- 已授权仓库内实现，以及本次交接文档的提交。后续实现改动的 commit、push、发布、部署，以及对 dev/pre/prod 数据库执行迁移，仍需对应授权。`90000abe` 与本次文档的提交授权都不是持续授权。
- 数据库实际删表必须单独明确目标环境。仓库迁移完成与数据库迁移完成分别报告。
- 保留并行工作。不要全仓 reset、restore、stash，也不要用 `git add -A` 混入其他任务；逐文件、逐 hunk 核对。
- 项目约束以 `AGENTS.md`、`context/`、`.service-matrix.yaml` 为准。旧 spec 与实现单里有需要纠正的判断，见第 5 节；不要直接照旧单执行。

## 2. 已有产物与当前快照

交接读取时 HEAD 为 `8d406b89`。工作区有大量并行改动，以下只是本任务的定位信息，不是全量文件所有权清单。新会话必须重新获取状态。

| 产物 | 本次观察 | 接手动作 |
|---|---|---|
| `90000abe` | 已提交删除 `backend/pkg/outbox`、`searchindex.Reindex`、`ErrorHandler.tsx`，并同步文档 | 不重复删除，不恢复旧代码 |
| `cd84e22a` | 已提交本目录的 `spec.md` 与 01–05 实现单 | 将它们作为实施草案；五张单当前仍为 `ready-for-agent` |
| `backend/services/product/internal/data/migrations/00006_drop_outbox.sql` | 未跟踪文件；已有 Up/Down 草稿 | 先修正安全与回滚说明，再验证；不是已执行迁移 |
| `backend/services/product/internal/data/models/models.go` | 工作区 diff 删除 `ProductsOutbox`，共 15 行 | 前轮 `sqlc generate` 的结果；重跑确认无额外漂移 |
| `context/team/db-migrations.md`、`context/project/ecommerce/events/INDEX.md`、`TODO.md` | 工作区已有删表相关修改 | 有「当前没有表／已删除」之类超出证据的措辞，需改成代码与数据库状态分开；`TODO.md` 另有并行 hunk |
| `frontend/apps/consumer/src/providers/AuthProvider.tsx` | 当前未提交 diff 是注释更新，说明 Web cookie 与桌面 `X-CT-Session` 共用 BFF；未据此证明 05 已实现 | 保留这些注释，不恢复过时的 PKCE/bearer 描述 |
| `backend/third_party/validate/validate_pb.ts`、门禁、部署及多份文档 | 另有并行改动 | 生成代码或运行全量格式化前核对，不覆盖、不混提 |

本次重新读取确认：`useAddresses.ts` 仍发送 `CreateAddressRequest.userId`，写操作仍使用 `mutate`；当前 proto 已 reserved 该请求字段。其他页面问题主要来自前轮阅读，实施时先用测试或当前源码复核，不把历史行数、健康分当作缺陷证明。

### 历史验证与未验证项

- 前轮报告 product build、vet、short tests、`verify-context.sh` 通过，sqlc 生成物仅减少 outbox 模型。这些不是当前 HEAD 的新验证结果。
- 没有在真实 PostgreSQL 上验证 `00006` 的 Up/Down；没有在任何目标环境执行该迁移。
- 前轮部分测试命令经过 `tail` 等管道，未可靠保留底层失败码。新会话直接执行命令，或开启 `set -o pipefail` 后记录退出码。
- 之前 `TestWorkloadIdentityBaseline` 与 release 脚本引用旧 `pre/deployment.yaml` 的失败属于历史快照。HEAD 已变化；重新跑完整测试，不默认跳过，也不要断言现在仍然失败。

## 3. 启动检查与按需阅读

在仓库根运行：

```bash
pwd
git status --short
git log -5 --oneline
git diff --stat
git diff --cached --name-status
```

完成条件：分清本任务已有代码、未提交的草稿与其他人的改动；对下一步要编辑的文件先读取最新内容。

按分支读取，避免通读全仓：

| 准备做什么 | 先读 |
|---|---|
| 任何实现 | `AGENTS.md`、`context/team/runbook.md` §0.1、`TODO.md` 对应项 |
| 删表迁移 | `context/team/db-migrations.md`、`backend/tools/dbmigrate/README.md`、`docs/DEVOPS.md` 的数据库变更要求、`context/project/ecommerce/events/INDEX.md` |
| 前端 | 本目录 `spec.md` 和当前实现单；`context/project/ecommerce/consumer/INDEX.md`、`context/project/ecommerce/frontend-api/sop/connect-query.md` |
| 表单与布局 | `DESIGN.md`；`backend/api/address/v1/address.proto` 是字段约束来源 |
| 生成同步脚本与门禁 | `context/team/shell-scripting.md`；改 CI 时再读 `docs/DEVOPS.md`；新门禁在接线处写明此次漂移事故 |
| 新增回归测试 | `docs/TESTING.md`；后端测试再读 `context/team/go-testing.md` |
| 关单 | `docs/agents/issue-tracker.md` 的验收标准与完成自检 |

## 4. A 线：完成 products.outbox 删表迁移

### 4.1 草稿是什么

`00006_drop_outbox.sql` 的 Up 是 `DROP TABLE IF EXISTS products.outbox`，没有 `CASCADE`。Down 重建 `00004` 的列和两个索引。

前轮仅从仓库证据判断没有当前调用方：`pkg/outbox.Insert` 已删除；同级 pipeline 仓的 publication 配置与 Debezium 表白名单当时不含该表。**这些不能证明所有环境的表为空，也不能证明 live publication、外部脚本或人工操作均不存在。** 权限备份出现 GRANT 更不能证明没有外部消费者。

### 4.2 接手后的步骤

1. **复核草稿与编号。** 比较 `00004_outbox.sql`、`00005_search_catalog.sql`、`00006_drop_outbox.sql`，确认并行任务未占用 00006；不修改已应用迁移来删除历史表定义。
2. **修正迁移注释。** 将「从未有写入」「一步删除是安全的，因为不是改列」改为有证据范围的表述：当前仓库没有生产者，实际执行仍需确认目标环境消费者与存量数据。是否可以直接 contract 取决于兼容性与消费者，不取决于操作名字叫删表还是改列。
3. **明确 Down 的能力。** Down 只能恢复空表结构，不能恢复已删除数据、序列进度或原有权限。当前草稿还缺少 `00004` 的 `COMMENT ON TABLE`；如声明结构等价，应补齐并验证。目标环境的 owner、GRANT/default privileges 需要独立核对，不能靠重建表推断已恢复。
4. **保留依赖保护。** 不加 `CASCADE` 自动删除未知依赖。若发现视图、外键或其他依赖，停止该步并列出对象；不要把依赖失败当作需要强删的理由。
5. **重跑 sqlc。** 在 `backend/services/product/` 执行 `sqlc generate`；检查所有生成 diff，只应出现可解释的 schema 变化，不能手改生成模型掩盖问题。
6. **用隔离 PostgreSQL 验证。** 按 dbmigrate 手册显式指定一次性数据库 DSN，不继承未知的 `DB_URI`／`DB_SOURCE`，也不把 localhost 等同于本地库（可能是远端转发）。通过 goose/dbmigrate 选择 Up/Down，不能用 `psql -f` 直接执行包含两个方向的 SQL 文件。
7. **修正文档状态。** 三处描述应区分「仓库已添加删表迁移／最新 schema 不再有表」与「某环境已执行」；实际执行前不写「数据库已删除」。项目进度只更新 `TODO.md` 相应项，不另建进度账本。

### 4.3 隔离库验收

至少记录这两条路径的实际结果：

- 从空库应用 product 历史迁移至最新：`products.outbox` 不存在，`products.search_catalog` 等现有表仍存在，product 的 goose 版本记录正确。
- 从迁移 00005 的状态应用 00006 → 回滚 00006 → 再应用 00006：表存在性随方向变化；Down 的列、约束、索引、表注释与目标结构一致。若用测试行验证删除语义，明确 Down 不恢复测试行。

没有可用隔离库时，保留「未验证」和具体条件，不用 sqlc 的解析成功替代数据库执行证据。

### 4.4 以后执行目标环境迁移前

这是执行前清单，不是当前执行授权：明确环境与 DSN；确认迁移版本；检查表是否存在及是否有数据；检查 live publication、Connector 白名单和依赖；核对仍运行的旧版本；准备备份与恢复路径，安排锁等待／超时。发现数据或消费者时重新评估，不直接 DROP。执行和回滚都走 dbmigrate，并分别记录结果。

## 5. B 线：前端实施顺序与旧单纠偏

### 5.1 推荐执行顺序

| 顺序 | 实现单 | 本片必须交付 |
|---|---|---|
| B1 | [01：生成代码对齐](issues/01-前端生成代码与后端契约对齐.md) | 前端协议生成物与后端一致；创建地址不再传 `userId`；可重复的同步与只读检查 |
| B2 | [02：共享表单](issues/02-共享地址表单与校验.md) ＋ [03](issues/03-地址簿页拆分与写操作反馈.md) 的共用 hook 前置 | 先完成 `useAddresses` 的 Promise 写接口，再提供唯一表单与校验；确定公共接口后页面再接入 |
| B3 | [03：地址簿页](issues/03-地址簿页拆分与写操作反馈.md) | 保存失败保留输入且错误可见；真实 mutation 忙碌状态；删除确认与可访问性 |
| B4 | [04：结算页](issues/04-结算页地址选择与提交.md) | 共享表单、合法单选结构、新地址自动选中、禁止静默丢弃选中商品 |
| B5 | [05：登录态](issues/05-AuthProvider-登录态收敛.md) | 一致的身份状态清理、首次 loading、明确的桌面／Web 行为与回归测试 |

B3/B4 在共用接口稳定后才适合并行。B5 业务独立，但当前 `AuthProvider.tsx` 有别人的注释修改，先对齐文件所有权。本交接不要求派子代理。

### 5.2 生成同步：不能只复制顶层文件

- 优先沿用 01 的小改动方案，但同步范围必须覆盖实际 import 的生成依赖，例如 `third_party/validate`；当前该后端文件还有并行 diff。
- 先核对 `backend/Makefile`、`backend/buf.gen.ts.yaml`、两个前端的生成目录和手写导出入口；按稳定清单生成／同步，不改手写 `index.ts`，不手工编辑 descriptor。
- `--check` 必须只读，能发现内容漂移、缺失文件及预期的过期生成物；同步重跑应无新 diff。测试检查器时只在隔离副本注错，避免改坏并行工作树。
- 前轮「其他 8 份只有版本头变化」是调查快照，不是永久豁免。重新比较生成依赖与 descriptor，按协议语义判断。
- `uint64` 与 `int64` 在 TypeScript 都显示为 `bigint`，不表示协议完全等价。保留服务端 ID 的合法范围校验，不以类型检查通过替代契约一致性。

### 5.3 地址表单与写操作：纠正默认地址判断

当前 `UpdateAddressRequest` 没有 `is_default`；`useAddresses.updateAddress` 只传姓名、电话与 detail。因此 03 号单的「通过编辑表单 `isDefault` 设置默认，保持现状」不成立。

- 新建地址可使用 `CreateAddressRequest.isDefault`；编辑默认地址需核对既有 `SetDefaultAddress` RPC 与设计，不能把表单勾选当作已经保存，也不能向 Update 请求硬塞不存在的字段。
- 如编辑流程组合「更新内容」和「设置默认」两个 RPC，要区分全部成功与部分失败，保留可重试状态，不能提示全量保存成功。
- `mutateAsync` 返回结果供调用方使用，仍保留查询失效刷新。拒绝时由调用方显式处理，不留下未处理 Promise；核对所有调用方，不只这两个页面。
- `RegionSelect` 的区县必填状态必须和当前城市一致。切换城市、打开已有地址、地区加载失败／尚未返回，都要避免沿用旧 `districtRequired`。
- 字段长度按 proto 语义对齐；不要未经设计新增只允许某国手机号的正则。错误提示使用现有 i18n 与 `toAppError`。

### 5.4 结算提交：测试行为，不按 grep 凑验收

- 先读 `src/store/cart.ts`、`src/hooks/useCart.ts`，核实临时条目的生成与同步流程。不能假设「纯数字就一定是已同步的服务端 ID」。
- 删除提交时静默过滤商品的行为；对不能提交的条目显式阻断并提示。重新检查选中地址是否仍在列表，不能只有一个非空 ID 就认为可下单。
- 新增地址成功后用响应 `addressId` 选中，处理列表刷新与选择先后顺序；失败保留输入。新增成功、刷新失败不能被误报为创建失败再重复创建。
- 旧单的 `.test(id))` grep、组件行数或 `clearAccount()` 出现次数只是定位线索，不能替代具名行为测试，也不能为了 grep 无输出删掉合理校验。

### 5.5 登录态：复用清理步骤，不把所有事件当成主动登出

- 保留当前 BFF 事实：Web cookie；桌面会话 ID 在内存，经 `X-CT-Session` 发送。沿用已有回跳与 `useLayoutEffect` 登录态快照，不恢复前端 JWT／PKCE 逻辑。
- 先读 `@ecommerce/tracker` 的 `resetIdentity` 和队列发送实现，区分主动 logout、认证失效、匿名冷启动。匿名冷启动不应无条件轮换匿名 ID；失效会话的队列不能错误归给下一用户。
- 主动 logout 的埋点清理顺序有约束：既有注释要求在 `bffLogout` 前处理。401 路径已无有效会话，不能未经验证照搬同一队列发送假设。
- 共用身份清理步骤，但调用时机和是否轮换 tracker 身份可明确分支。测试连续 401 是否重复导航／弹窗，以及未完成的身份请求是否会在 logout 后回写旧身份；先复现再决定需要的请求失效保护。
- 新增 `loading`、移除无真实调用方的公开 setter、收窄 router 类型时同步实际消费者与测试。保留匿名 401 不强迫登录、已登录 401 重新认证的既有测试。

### 5.6 保持范围

本批不是全站视觉重做、下单幂等设计或购物车标识迁移；不顺手改这些契约。设计约束仍有效：旧实现单「沿用旧 tokens」不能覆盖 `DESIGN.md` 对新建／改造 surface 的要求。实现前按当前设计确定组件用色边界，不新增硬编码颜色或混合两套主题。

## 6. 验证与完成定义

### 按片验证

在标明的目录执行，记录真实退出码。不要串在无 `pipefail` 的输出截断管道后宣称通过。

| 工作目录 | 命令 | 说明 |
|---|---|---|
| `backend/services/product` | `sqlc generate` | 会写生成物，先核对并行 diff；随后复查 diff |
| `backend` | `go build ./services/product/...` | product 编译 |
| `backend` | `go vet ./services/product/...` | 静态检查 |
| `backend` | `go test -short -count=1 ./services/product/...` | 既有 product 测试，不等于真实迁移验证 |
| `frontend/apps/consumer` | `pnpm test` | consumer 测试与本批回归 |
| `frontend/apps/consumer` | `pnpm test -- src/a11y` | 现有页面语义断言；新增／编辑弹窗还需实际打开后验证 |

### 整体验收

- 新同步检查器 `--check` 在一致时 rc=0，隔离副本注错后 rc≠0；再次同步无额外 diff。
- 地址簿保存拒绝：弹窗仍在、输入未丢、错误可见；结算新增成功：新地址被选中；无下级区县的城市可以提交，有下级的城市缺区县会被拦截。
- 不可提交购物车条目：提示可见，提交被阻断，`createOrder` 未调用；合法条目全部进入请求，不静默少项。
- 地址选择弹窗键盘和关闭按钮可用；真实浏览器检查打开后的弹窗、错误态及 console。单独说明未能验证的 Web／Tauri 场景。
- AuthProvider 既有与新增回归均通过；匿名冷启动、已登录 401、主动 logout 的清理边界正确。
- 隔离 PostgreSQL 的两条迁移路径通过，并记录实际库验证；未执行目标环境迁移则明确保留待执行状态。

最终从对应工作目录执行：

```bash
# frontend/：ready 包含 vp fmt，会修改文件，执行前后检查 diff
pnpm ready
```

```bash
# backend/：完整结构检查，不预先跳过历史失败项
go test -count=1 ./structcheck/...
```

```bash
# 仓库根
scripts/verify-quick.sh
scripts/verify-context.sh
git diff --check
```

并行改动造成失败时保留完整日志，给出当前证据与归属，不能用「以前是别人的问题」代替复核。`verify-quick`／`pnpm ready` 的通过也不能证明删表已在线上执行。

## 7. 交付方式

本次交接文档验证：`HANDOFF.md`、`spec.md` 的本地 Markdown 链接与空白检查通过，`git diff --check -- .scratch/consumer-hotspots` 通过。全仓 `scripts/verify-context.sh` 当次 rc=1，共 13 条，均不在本次两份文档：`docs/learning/` 缺少 09–11 章节及一处 architecture 路径错误，另有配置热更新文档引用 `backend/pkg/gorse/live.go` 的报错。后者回查时文件存在，原因尚未定位，不将其归因成已证明的门禁误报；工作区仍在并行变化。接手时重跑，不能将这次结果写成全仓文档通过。本次未运行业务测试或迁移。

1. 在涉及的 `TODO.md` 项下更新真实状态；不要把仅写好迁移说成环境已删表。
2. 01–05 每张单只在验收通过后改为 `done`，补齐带命令／具名测试／退出码的「完成自检」。先把第 5 节的纠偏反映到实际执行单，避免照错误验收关单。
3. 报告改动文件、验证结果、未验证与未执行项、保留的并行改动。commit/push/部署只有获得对应授权后执行。

可直接发给新会话：

> 请按 `.scratch/consumer-hotspots/HANDOFF.md` 接手，完成 products.outbox 删除迁移和 consumer 高风险页面整改。先核对当前工作树，并按交接第 4、5 节纠正旧草稿，再按薄片实现和验证。保留其他人的修改；不要把仓库迁移当成数据库已执行。不要自动 commit、push、部署或对共享数据库执行迁移；完成后给出实际验证证据和剩余事项。
