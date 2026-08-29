# 维护手册（给 WorkBuddy / 维护方 agent）

秋招跟踪器：纯静态站，GitHub Pages 部署，线上地址 `https://alchemistjason.github.io/qiuzhao-tracker/`。
push 到 `main` → GitHub Actions 跑语法检查 + `node tests/run-tests.js`（271 项）→ 全绿自动部署 Pages。
**任何改动以 CI 全绿 + 线上 curl 验证为完成标准。**

三个数据文件全部由 WorkBuddy 维护：`data.js`（内推清单，腾讯文档同步+人工补充）、`discovered.json`（爬虫候选池）、`dynamics.json`（邮件动态解析）。契约如下。

## 数据文件契约

### `data.js` — 内推清单（WorkBuddy 维护，来源：腾讯文档同步 + 人工补充）
- `id` 是稳定唯一标识，**已发布条目的 id 禁止修改**（用户状态按 id 关联，改 id = 丢用户进度）。
- 腾讯文档同步只更新内推码/链接/岗位/截止等业务字段；**不得覆盖 `official-sites.js`**，不得改动与本条无关的格式。
- `category`（行业）合法值 = `window.INDUSTRY_GROUPS` 展开的 17 个值 + 特殊值 `"活动"`；1~2 个值。
- `nature`（企业性质）必填，合法值仅 `"央企"|"国企"|"民企"|"外企"|"合资"`。
- 两个维度正交：行业描述主业，性质描述所有制，禁止互相混入、禁止发明词表外新值。新值必须先改 `INDUSTRY_GROUPS`/`NATURES` 常量并同步测试。
- `DATA_VERSION` 只在**用户状态结构**变化时才 +1，加公司/改分类不动它。

### `official-sites.js` — 官网固定清单
- 只增不改（除非官网换址）；**不被任何同步任务覆盖**；新增按 id 追加。
- 链接必须是剥离内推参数后的官方校招入口。

### `discovered.json` — 爬虫候选池（WorkBuddy 写入，schemaVersion 2）
- taxonomy 同上（category 用 17 词表、nature 用 5 词表），文件内 `_readme` 是单一事实源，改动词表时同步更新 `_readme`。
- 三查重（CI 断言）：**非毕业条目**不与 `data.js` 撞 id、撞归一化公司名、撞 `official-sites.js` 官网链接。
- **毕业迁移（候选池 → 内推清单）：池中条目不删除，打 `graduated: true` 保留**（池=用户关注清单），并满足两条硬约束：id 与 data.js 条目完全一致（用户状态按 id 共享，换 id=丢进度，v8.4 三七/库洛曾踩坑）、CI 对 graduated 条目豁免三查重但强制 id 命中。前端表现：毕业条目在校招池 tab 带 🔗 徽章继续可见，与内推 tab 共享同一跟踪状态。
- `parent` 必须指向同文件已存在条目（集团子集团结构）；`quota` 为正整数。
- 只放公开校招信息，禁止写入任何个人邮箱相关内容。

### `dynamics.json` — 邮件动态（WorkBuddy 解析邮件写入）
- 字段：`id/type/company/companyId/jobName/title/summary/time/dueDate/eventTime/suggestStatus`；`type` 白名单 `offer|written|interview|deadline|reject|evaluation|other`；`suggestStatus` 白名单 `未投递|已投递|笔试中|面试中|Offer|已拒绝`；`companyId` 必须是 `data.js` 里存在的 id 或 null。
- **隐私红线（CI 门禁）**：`link`/`actionUrl` 一律为空，禁止附件字段，摘要化描述，不含邮件正文原文、链接、附件、个人邮箱地址。违反则 CI 直接红。

## 前端契约

- 改动任何 `js/*.js` / `style.css` / `data.js` / `official-sites.js` 后，**必须同步 bump `index.html` 里全部 9 处 `?v=` 缓存戳**（CI 有一致性断言），否则用户端吃到旧缓存。
- **每次改动 `data.js` 必须 bump 其头部 `window.DATA_VERSION`**（标题栏"数据版本"展示的就是它，是用户判断数据新鲜度的唯一线索；v8.4 合并 34 家时漏 bump，停在 6，已修复为 7）。
- 用户状态存浏览器 localStorage（key 固定），任何改动不得破坏既有 key 和数据结构；迁移逻辑必须有测试。
- **userState（v3）= 账号同步的全部内容**：`companies`（进度/收藏/备注/岗位/历史）+ `dyn`（邮件分诊三列表 seen/done/ignored，v9.4 起并入，此前是独立键 `qiuzhao2027.dynSeen/dynDone/dynIgnored`，由 `migrateDynLegacyKeys` 一次性迁入后删除）。云合并时 companies 按 lastUpdate 公司级合并、dyn 三列表取并集。待办事项的完成/忽略标记就是 dyn.done/dyn.ignored，因此也随账号同步。
- 筛选维度（状态/地点/行业/性质/岗位）跨来源（内推/校招池）语义一致，选项按当前 tab scoped。
- **仪表盘（顶部统计卡片）是全局口径**：跨内推+校招池合并统计（COMPANIES 单数组 + CI 唯一性约束，天然去重——同一家公司内推/校招链接不同也只算一条）；点击卡片统一下钻到「全部」tab（`currentSource === "all"`，`filterBySource` 原样返回全量），保证数字与点击结果一致（v9.2 起，取代了 v7.8 的按来源统计）。URL hash 支持 `#all`。
- **列表分页（v9.3）**：每页 `PAGE_SIZE=20` 条，筛选/排序/搜索/切 tab 调 `applyFilters()` 默认重置回第 1 页；翻页（`goPage`）和表格/卡片视图切换传 `applyFilters(false)` 保持页码。待办视图不分页。筛选面板选项带命中数量（`countByDim`，口径与 `matchFilters` 一致）。
- **CSS 红线：`::before/::after` 伪元素若用 `position: absolute; inset: 0`，宿主元素必须 `position: relative`**——否则伪元素相对初始包含块铺开成全页隐形护盾，截获全页面指针事件（v8.9 前 #themeBtn 因此导致悬停闪烁，有测试断言）。

## 验收流程

1. `node tests/run-tests.js` 本地全过（改日期逻辑需 `TZ=America/New_York` 再跑一遍）。
2. push 后等约 1 分钟，`gh api repos/AlchemistJason/qiuzhao-tracker/commits/<sha>/check-runs` 确认 build/test/deploy 全 `success`。
3. `curl` 线上地址确认新版本生效（缓存戳、关键字段）。

## 推送方式

本地 `.git/config` 已清理失效 token，正常 `git push origin main` 即可。
若凭据不可用，兜底方案：gh api 逐文件上传 blob → 建 tree → 建 commit → PATCH ref（参考此前会话的 `_push.cjs` 流程；注意 gh api 传 body 要加 `--input -`）。

## 云同步账号（v8.6，后端 Supabase）

- **不要迁回 LeanCloud**：已于 2026-01 停止新注册，2027-01-12 全面停服；Bmob 要求自备 ICP 备案域名，均不可用。
- 认证走 Supabase GoTrue（`/auth/v1/signup`、`/auth/v1/token?grant_type=password`、refresh_token 自动续期），会话存 localStorage key `qiuzhao2027.auth`（只存 uid/email/accessToken/refreshToken/expiresAt，**密码永不落盘**）。
- 存储走 PostgREST 表 `qiuzhao_state`（`user_id uuid PK / payload jsonb / updated_at`），整行 upsert（`Prefer: resolution=merge-duplicates`）。**隔离由服务端 RLS 强制**（select/insert/update 策略均 `auth.uid() = user_id`），客户端不得自拼 ACL/where 做"客户端自觉式"隔离。
- 请求强制 HTTPS（`isHttpsUrl`）；access token 临期 60s 内自动用 refresh token 续期，续期失败/401 自动登出。
- 应用凭据维护方内置在 `js/export-sync.js` 的 `BUILTIN_CLOUD`（Project URL + anon key，anon key 官方设计为可公开，安全靠 RLS 不靠密钥保密）；为空时用户可在弹窗「高级」里自填。
- 未登录不进行任何云读写（`cloudPush`/`cloudPull` 有 `getAuth()` 守卫，有测试断言）。

### Supabase 控制台一次性搭建（建表 SQL 见 README「云同步」节）

1. SQL Editor 执行 README 里的建表 + RLS 策略 SQL（**RLS 三条策略缺一不可**）。
2. Authentication → Providers → Email：关闭 **Confirm email**（否则注册后需收信验证）。
3. anon key 泄露无需紧张，但 **service_role key 绝不能进前端代码**。

## 已知待办 / 口径备注

- 地平线内推码笔误待核对（`dcncha` vs 链接参数 `dcnhca`）。
- 柠檬微趣官网是 moka 个人分享短链，待换正式入口。
- 邮储/中行承办页按年更换，明年需更新。
- 性质归类口径：中信建投按北京国资=国企，紫光展锐/格力/平安=民企，华硕（台资）=外企；用户有不同口径时改单条即可。
