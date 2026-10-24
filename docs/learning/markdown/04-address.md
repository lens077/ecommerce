# 04 地址：合法的 ID，不代表属于当前用户

[学习入口](README.md) · 前置：[用户](03-user.md)、[平台](01-platform.md) · 关联：[订单](10-order.md)

## 0. Git 证据：从字典/私有地址设计到真实 CRUD

原始全项目MVP未把address单列为六服务，但 [f3fe86d3 README](https://github.com/lens077/ecommerce/blob/f3fe86d3/README.md#L814-L845) 已要求消费者收货地址管理和本人数据隔离。

最早专门领域设计是 [dbeeb59d，2026-04-26 的服务README](https://github.com/lens077/ecommerce/blob/dbeeb59d/backend/services/README.md)：原文定义「全国标准行政区划库」和「用户私有地址簿」，并讨论IP/GPS位置到标准区划的匹配；geofencing/快递员等放在扩展，不是地址簿最小范围。

| 提交与原文件 | 当时实际行为 | 今天的意义 |
|---|---|---|
| [2c3ab730 address data](https://github.com/lens077/ecommerce/blob/2c3ab730/backend/services/address/internal/data/address.go)，2026-06-11 | 名叫address，内容却是ES商品搜索模板 | 「新增微服务」的标题和目录不能当地址功能实现 |
| [dd982f36 address data](https://github.com/lens077/ecommerce/blob/dd982f36/backend/services/address/internal/data/address.go)，06-27 | 首个可读六接口CRUD，JSON detail、userID+电话前缀生成ID，创建收body userId；SetDefault有事务 | 有真实写入，但拼接ID/身份/默认并发问题不能当安全MVP |
| [0fa38923 region.proto](https://github.com/lens077/ecommerce/blob/0fa38923/backend/api/address/v1/region.proto)，08-02 | 公开ListRegions、ID级联、code可空 | 真正补上标准地区读取，不靠虚构区县 |
| [d8186ed7 address data](https://github.com/lens077/ecommerce/blob/d8186ed7/backend/services/address/internal/data/address.go)，08-21 | UUID、分列、sqlc、事务内清默认与创建 | 改善持久化结构，但事务不自动保证唯一性 |
| [82a1883e service](https://github.com/lens077/ecommerce/blob/82a1883e/backend/services/address/internal/service/address.go)，09-22 | Create主体从header取，proto保留旧字段号不用 | 这是已提交修复，不是这轮临时改动；Get/Update/Delete/SetDefault仍需归属 |

**服务最小范围判定：部分实现，不完整满足「私有地址簿」。** 私有性本来就在初稿，不是生产期才追加的增强。当前UI的mutateAsync/类型修复有进展，但后端对象归属、默认唯一仍不成立。**生产判定：不满足**；真实定位也是未闭环能力，应标演示或实现，不能把定位权限弹窗当已接高德/IP服务。

## 1. 原始范围与职责

最小地址簿允许用户添加、读取、修改、删除收货地址，选一个默认地址。行政区划查询是它附带的公开字典能力，不应因此把整个地址簿变成匿名接口。

- **对象级授权**：判断「用户 A 能否改地址 X」，不只是判断「A 已登录」。
- **IDOR（不安全的直接对象引用）**：服务根据客户端给的资源 ID 操作，却不核实资源归属。ID 难猜只能降低碰巧猜中的概率，不能构成授权。
- **软删除**：保留行并标记删除，查询与唯一约束都必须考虑该标记。
- **部分唯一索引**：只对满足条件的行强制唯一。例如只约束「未删除、默认」地址。
- **快照**：保存当时的内容，而不是以后每次重新读取可变化的地址簿。

类比：知道别人的快递单编号，并不意味着你有权修改收件人。能读到一个 UUID，不应成为万能钥匙。

## 2. 当前实现从哪里读

[地址 proto](../../backend/api/address/v1/address.proto) → [service/address.go](../../backend/services/address/internal/service/address.go) → [data/address.go](../../backend/services/address/internal/data/address.go) → [query.sql](../../backend/services/address/internal/data/queries/query.sql)。

另有 [region.proto](../../backend/api/address/v1/region.proto) 和 [地区 handler 测试](../../backend/services/address/internal/service/region_test.go)。六个地址 RPC 是 Create/Update/Delete/Get/List/SetDefaultAddress；RegionService.ListRegions 是独立的公开查询。

## 3. 已经补上的防线

- 创建请求里的 user_id 已 reserved；Create/List 从网关注入头读取 UUID，不再信任请求体指定的用户。
- 地址 ID、格式与长度受到 proto 约束。
- 默认地址相关操作已有事务 helper，软删查询会过滤部分已删除行。
- sqlc 生成数据库访问；goose 维护 [地址迁移](../../backend/services/address/internal/data/migrations/00001_addresses.sql)。
- pgx.ErrNoRows 映射到 not_found，不再一概返回 unknown。
- 地区字典允许合法空子列表，省直辖县等不要求伪造不存在的下级行政代码。

因此旧结论「Create 仍使用请求体 userId」已经不适用。教材不能为了延续旧风险列表，忽略已经完成的修复。

## 4. 当前缺陷逐层分析

### A1 创建身份收口了，按 ID 读改删还没收口

Get/Update/Delete/SetDefault 的 service 和 SQL 仍以 address_id 为主，缺少当前 user_id 参与查询条件。Create/List 解析 UUID 也不等于已调用 RequireUser 拒绝访客。

修复链必须贯穿：

```text
可信请求主体 → RequireUser（拒访客）→ 用例参数
                                         ↓
                      WHERE address_id = ? AND user_id = ?
                                         ↓
                         检查返回/影响行数 → 错误映射
```

只在页面隐藏「编辑」按钮没有意义；只在 service 先 Get 再检查、而 UPDATE 又不带归属，也把保护变成容易漏掉的约定。SQL 应成为最后一道可验证防线。

建议统一对「不存在」与「不属于当前主体」返回不会泄漏他人资源信息的错误策略，具体遵循项目错误规范。

### A2 事务不能自动保证并发唯一

当前设置默认地址使用「清除旧默认，再设置新默认」的事务，但迁移没有约束每用户至多一条有效默认地址。

考虑初始没有地址的用户：

```text
请求1：清旧默认（0行） → 插入地址A为默认
请求2：清旧默认（0行） → 插入地址B为默认
```

两个事务都可能成功。**事务是原子提交，不代表所有业务约束自动串行执行。**

应由数据库保证「每用户至多一个未删除默认地址」，并设计同时切换默认时的冲突/重试策略。若业务还要求「只要有地址就必须有默认」，那是额外规则，需把删除默认、首次创建一起定义，不是部分唯一索引单独能保证。

不要只在前端按钮上防双击：两个标签页、两台设备和网络重试都能绕过。

### A3 前端旧 userId：当前工作树已收口

本次重新读取 [useAddresses](../../frontend/apps/consumer/src/hooks/useAddresses.ts) 和 [生成 TS](../../frontend/apps/consumer/src/gen/api/address/v1/address_pb.ts)，创建参数已不含userId，与后端reserved字段对齐。上一版的「前端仍提交userId」不能继续列为当前缺陷。

这证明本地源码已修正，不代表生成物已提交或部署；后续应以生成链检查和真实会话归属测试验收，不能用类型断言恢复旧字段。

### A4 保存失败的 UI：当前工作树已有实质修复

hook现在返回mutateAsync；[AddressEditDialog](../../frontend/apps/consumer/src/components/address/AddressEditDialog.tsx) 等待onSave成功才关闭，失败显示错误并保留输入，重复提交受ref和pending限制。查询刷新失败与写入失败已分开，避免写成功后误导用户再次创建。

新 [hook测试](../../frontend/apps/consumer/src/hooks/useAddresses.test.tsx) 和 [表单测试](../../frontend/apps/consumer/src/components/address/AddressBook.test.tsx) 已有拒绝保存、保留输入、刷新失败等断言。本轮读过但未运行，不宣称全部通过。这是当前工程化进展；剩余阻断在A1/A2的后端归属、并发默认与订单快照，而不是继续修已移除的立即关窗逻辑。

### A5 定位仍是演示结果，不是真实地理编码

当前 [location接口](../../frontend/apps/consumer/src/api/location/index.ts) 取得GPS坐标后仍返回固定省市区/街址，IP回退也返回固定地址。权限请求成功只证明浏览器提供位置能力，不证明把坐标正确转换成用户地址。

首步应避免演示数据被误保存为用户真实地址：明确标识/禁用假定位结果，或接入真实地理编码并验证标准区划匹配。定位失败允许手工填写，不能用固定城市伪装成功；隐私授权和日志最小化同样要验。

## 5. 订单为什么需要地址快照

地址簿是用户当前偏好，订单是过去已达成的交易。用户明天修改地址，不应使昨天的订单收件人悄悄改变。

目标是 order 在创建订单时取得**属于当前用户**的地址内容，并保存姓名、电话、省市区、详址等快照。订单后续读自己的快照，不每次回查 address。

这不是鼓励随意复制敏感信息：快照有履约目的，应限制读取者、日志输出、保留与删除策略。

| 对接方 | 必须对齐 |
|---|---|
| 前端 | district 可为空；loading、无地址、加载失败三种 UI 不混；创建不传业务 userId |
| gateway | 地址簿要求登录而不是访客；地区字典可公开；身份头防伪依赖受控入口 |
| order | address_id 是 UUID 字符串；查询包含主体；保存不可变内容快照；可空邮编不强制解引用 |
| PostgreSQL | 归属条件、软删过滤、默认唯一性、影响行数都有测试 |

matrix 中 order→address 仍是 planned。不要把「已有地址 RPC」写成「订单快照已接线」。

## 6. 如何演进而不做成大而全服务

高内聚：地址验证、默认选择与归属在 address 域内集中；地区字典可为独立内部模块。低耦合：order 接收快照契约，不共享 address 的数据表模型；user 只提供主体，不接管地址业务。

性能：列表按用户查询并建立适合的索引、限制结果规模。先测 SQL，不给含 PII 的地址列表增加跨用户共享缓存。可扩展：默认唯一性和归属在数据库，不在单进程 mutex 中，增加副本仍有效。

## 7. 学习练习

| 练习 | 最小范围 | 证明标准 |
|---|---|---|
| A-A 完整归属 | RequireUser → service/biz/data → 六 RPC SQL | A可操作A；A不能读改删B；访客拒绝；拒绝后DB完全不变 |
| A-B 并发默认 | 事务 + 数据库约束 + 冲突处理 | 并发首次默认创建至多一个有效默认；删除/切换结果符合明确规则 |
| A-C 契约与体验 | 验收工作树中的类型/异步保存修复，再接订单快照 | 不传userId创建仍归属正确；失败不关窗；刷新失败不误报写失败；地址改动不影响已保存订单快照 |

现有 [address service 测试](../../backend/services/address/internal/service/address_test.go) 和 [data 错误测试](../../backend/services/address/internal/data/address_errors_test.go) 可继续复用，但权限与并发要加真实行为断言，不靠 mock 返回 nil 证明安全。
