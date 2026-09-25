# consumer 高风险页面收敛

Status: ready-for-agent

> 新会话先读 [HANDOFF.md](HANDOFF.md)：包含当前工作区快照、products.outbox 迁移交接，以及本稿和实现单的纠偏。
> 本文保留最初的调查与方案，不是完成证明；调查基准为 `90000abe`（2026-09-24）。实施时按交接说明复核当前代码与项目约束，不直接照历史行号、依赖顺序或验收 grep 执行。

## 背景

2026-09-23 用 Repowise（`context/team/repowise.md`）对仓库做死代码与健康度审计，consumer 有三个文件同时满足「近半年反复修 bug + 结构复杂 + 改动频繁」，属于最可能继续出问题的地方：

| 文件 | Repowise 信号 | 近半年 bug 修复提交 |
|---|---|---|
| `frontend/apps/consumer/src/routes/profile/addresses/index.tsx`（534 行） | `RouteComponent` 约 450 行、圈复杂度 23；29% 与 `routes/profile/index.tsx` 重复；变更熵前 1.5% | `821b2400` `a49fad74` `b99b2ef7` `82b71303` |
| `frontend/apps/consumer/src/providers/AuthProvider.tsx`（201 行） | 90 天改写量达文件大小 5 倍；与 35 个文件共变更；bug 修复次数全仓前 0.5% | `375faec5` `13be5e72` `9b040ecd` `7af0d799` `b99b2ef7` `9703be3a` |
| `frontend/apps/consumer/src/routes/checkout/index.tsx`（689 行） | `CheckoutPage` 约 350 行、内嵌 `AddressPickerDialog` 约 200 行；31% 与 `routes/orders/$orderId.tsx` 重复 | `a49fad74` `68a78946` |

健康分只是排序依据，不是缺陷证明。审计之后逐行核对代码，找到的**实际问题**如下，这才是本 spec 要解决的东西。

## 已核实的问题

1. **前端生成代码与后端契约漂移**（最高优先级，是其余单的前置）。
   `frontend/apps/consumer/src/gen/api/**/*_pb.ts` 是一份手工快照，最后更新于 `f88ee818`（2026-08-07），没有任何脚本从 `backend/api/**/*_pb.ts` 同步。对比后端当前生成物：
   - `address_pb.ts`：后端 `CreateAddressRequest` 已 `reserved 3; reserved "user_id"`（`82a1883e`，注释「由网关认证元数据注入，禁止由客户端提交」），前端快照仍有 `userId`，且 `hooks/useAddresses.ts` 的 `createAddress` 仍在发送 `userId: userStore.getState().account.id`。
   - `cart_pb.ts`：`spu_id`/`sku_id`/`cart_item_id` 前端是 `uint64`，后端是 `int64`。
   - 其余 8 份只差生成器版本（protoc-gen-es v2.12.0 → v2.15.0）与 descriptor 里的 `go_package` 等选项。
   - `frontend/apps/consumer-next/src/gen/api/{product,search}` 是另一份快照，同样要核对。
2. **结算页地址弹窗回归了地址簿页已修过的 bug**。`checkout/index.tsx` 的 `AddressPickerDialog` 用三个自由文本框填省/市/区，并且**强制要求区县非空**。地址簿页用的是 `components/address/RegionSelect.tsx`（输出规范中文名，并通过 `onDistrictRequiredChange` 告知「这个城市没有区县」）。proto `AddressDetail.district` 明确允许为空：「省直辖县级行政区（海南琼海市、湖北仙桃市、新疆石河子市等 49 个）……硬要求非空等于让这些地方填不出地址」。结果：这些地区的用户在结算页新增不了地址，而且结算页能写入不规范的省市名。
3. **两处地址新增/保存都是「发出即关」**。`profile/addresses` 的 `handleSaveAddress` 与 checkout 的 `handleCreate` 都调用 `useAddresses` 暴露的 `mutate`（不是 `mutateAsync`），随即关闭对话框或重置表单；请求失败时用户输入丢失，页面上也看不到错误。结算页新增成功后也不会自动选中新地址。
4. **地址表单与校验复制了两份**，且已经分叉（第 2 条就是分叉的后果）：空表单字面量、必填校验、字段布局各写一遍。
5. **结算页 `AddressPickerDialog` 的 HTML 不合法**：每个地址项是 `<Box component="button">`，里面嵌着 MUI `<Radio>`（一个 `input`）——交互元素嵌套，读屏与键盘行为不可预期；`Radio` 也不在 `RadioGroup` 里。
6. **结算页静默丢弃商品**。`handleSubmit` 里 `CartItemIds` 先 `.filter((id) => /^\d+$/.test(id))`，非数字 ID（本地临时购物车项）被悄悄过滤，订单可能少商品而用户不知道。
7. **`AuthProvider` 三条「回到未登录」路径字段不一致**：
   - `logout`：`tracker().resetIdentity()` + `clearSessionId()` + `clearAccount()` + 三个 `setState`；
   - `onAuthError`（已登录收到 401）：`clearSessionId()` + 三个 `setState`，**没有** `clearAccount()`，**没有** `tracker().resetIdentity()`（`375faec5` 只修了登出路径；会话过期后换人登录，同样会继承上一个人的匿名浏览记录）；
   - `applyIdentity(未登录)`：`clearAccount()` + 三个 `setState`。
   另外：没有 `loading` 状态，冷启动 `/auth/me` 返回前 UI 按「未登录」渲染一帧（共享包的 `packages/ui/src/auth/BffAuthProvider.tsx` 已有 `loading`）；`setIsAuthenticated` 暴露在 actions 里，但全仓只有 `bootstrap.tsx` 与 a11y 测试传入空函数，是可以把状态改乱又无人使用的公开 API；`router: any`。
8. **零碎的可访问性问题**：两个页面对话框的关闭 `IconButton` 都没有 `aria-label`；地址簿删除没有确认。

## 目标

- 前端生成代码与后端契约一致，并有机械检查防止再次漂移。
- 地址表单与校验只有一份实现，地址簿页与结算页共用，区县可选规则与 proto 一致。
- 地址写操作失败可见、表单不丢；结算页新增成功后自动选中。
- 结算页不再静默丢弃商品。
- `AuthProvider` 只有一条「回到未登录」路径，字段集一致。

## 验收标准

1. 01–05 五张实现单的 `Status:` 均为 `done`，且每张单都按 `docs/agents/issue-tracker.md` 填写 `## 完成自检`。
2. `scripts/sync-ts-gen.sh --check` 退出码为 0；`frontend/apps/consumer/src/hooks/useAddresses.ts` 不再发送 `CreateAddressRequest.userId`。
3. 地址簿页与结算页都使用同一个 `AddressForm` 和 `validateAddressForm`；具名测试证明 `districtRequired=false` 时空区县通过校验、`districtRequired=true` 时空区县不通过。
4. 地址簿页保存失败的回归测试证明：对话框保持打开、原表单值保留、错误信息可见。
5. 结算页含本地临时购物车条目时的回归测试证明：提交按钮禁用、同步提示可见、`createOrder` 未被调用。
6. `AuthProvider.test.tsx` 的回归测试证明：已登录用户收到 401 后调用 `clearAccount` 与 `tracker().resetIdentity`；`/auth/me` 完成前后 `loading` 分别为 `true` 与 `false`。
7. `cd frontend && pnpm ready`、`cd frontend/apps/consumer && pnpm test -- src/a11y`、`scripts/verify-quick.sh` 均以退出码 0 完成。

## 非目标（不要顺手做）

- **视觉迁移到「灯市」`lantern` 令牌**：`DESIGN.md` 迁移清单第 2 条单独推进。本次只遵守它的约束：改动到的代码**不得新增硬编码颜色，也不得混用 `tokens` 与 `lantern` 两套色**；已有的硬编码颜色原样保留。
- **下单幂等 `requestId`**：需要改 proto，见 `TODO.md`「下单幂等契约」。
- **购物车条目标识迁到 `cart_item_id`**：见 `TODO.md`「购物车条目标识」。
- 不要为了凑覆盖率补测试（AGENTS.md 硬规则 8）：只为本次修复的 bug 补能复现它的回归测试。

## 必读（动手前）

- `AGENTS.md`：硬规则，尤其 3（提交前判断 TODO 项）、6（commit/push 需要用户授权）、8（测试边界）。
- `context/project/ecommerce/consumer/INDEX.md`：consumer 的坑。重点——**没有 MUI ThemeProvider**：`Typography` 的 `variant` 直接决定标题标签，非标题文字要显式 `component`（`a49fad74`、`821b2400` 两次 bug 都是这个）；`sp` 间距常量是像素字符串；数据拉取走查询层，不写裸 `useEffect` + fetch；错误统一 `toAppError`。
- `context/project/ecommerce/frontend-api/sop/connect-query.md`：connect-query 写法。
- `DESIGN.md`「迁移清单」一节：两套色不得混用。
- `backend/api/address/v1/address.proto`：地址字段约束的真相源（`recipient_name` 1–255、`recipient_phone` 1–50、`province`/`city` 1–64、`district` 0–64、`detail` 1–500）。

## 验证命令

```bash
cd frontend && pnpm ready                                # lint + fmt + 类型 + 全部测试，必须绿
cd frontend/apps/consumer && pnpm test                   # 只跑 consumer
cd frontend/apps/consumer && pnpm test -- src/a11y       # 页面 a11y 与标题层级（覆盖 /checkout 与 /profile/addresses）
scripts/verify-quick.sh                                  # 提交前默认入口
```

`src/a11y/pages.a11y.test.tsx` 已经渲染 `/checkout` 与 `/profile/addresses`（含登录态），改页面结构后它必须保持绿。

## 实现单与顺序

| 单 | 依赖 | 内容 |
|---|---|---|
| [01](issues/01-前端生成代码与后端契约对齐.md) | — | 同步 `src/gen`，删除 `userId` 发送，加漂移检查 |
| [02](issues/02-共享地址表单与校验.md) | 01 | 抽出唯一的地址表单与校验，修结算页区县回归 |
| [03](issues/03-地址簿页拆分与写操作反馈.md) | 02 | 地址簿页拆分、失败可见、删除确认 |
| [04](issues/04-结算页地址选择与提交.md) | 02 | 结算页弹窗外移与语义修正、自动选中、不再静默丢商品 |
| [05](issues/05-AuthProvider-登录态收敛.md) | — | 单一复位路径、`loading`、收窄公开 API |

03、04 可以并行；05 与其余独立。每张单完成后单独提交（提交需用户授权），提交前按 AGENTS.md 硬规则 3 判断是否涉及 `TODO.md` 的「前端技术栈与工程化」各项。

## Comments
