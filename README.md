# 2027秋招内推 · 投递跟踪器

> 一键管理 2027 届秋招/提前批内推信息，跟踪投递状态，邮件动态结构化提取为待办事项，跨设备同步。

## 在线访问

**https://alchemistjason.github.io/qiuzhao-tracker/**

## 功能

- 🏢 76 家企业秋招/提前批内推信息（内推码一键复制、直达投递链接），**公司名直达官方校招官网**（`official-sites.js` 固定清单，逐家核实、剥离内推参数）
- 🆕 **爬虫候选池**：WorkBuddy 定时爬取校招来源写入 `discovered.json`（重点关注：互联网大厂 / 头部券商与公募基金 / 央企广东分公司，已内置 167 家核实过官网的种子公司（含阿里系 11 个子集团、国央企 8 家独立入口子公司，标注各平台投递名额规则）），站点自动合并进列表（带 🆕 徽章，校招池 tab 单独查看），设状态即开始跟踪
- 🗂 **来源分页**（v7.7）：内推（76 家内推码清单）/ 校招池（167 家官网池）/ 待办 三个平级 tab，内推与校招池各自保留表格/卡片视图；校招池按集团分组排序（阿里系子集团聚在一起）、带「可投N岗」名额标签；筛选面板选项按来源 scoped；URL hash（`#pool`/`#todo`）刷新保持所在 tab
- 🏷 **行业/性质双维度**（v8.2）：行业 17 类分 5 组（金融/互联网与软件/AI与智能硬件/工业能源交通/消费与服务），企业性质 5 类（央企/国企/民企/外企/合资），内推清单与校招池共用同一套词表（`INDUSTRY_GROUPS`/`NATURES`，`discovered.json` schemaVersion 2）；筛选面板行业按组分级展示、性质独立维度，卡片/表格显示性质与行业标签
- 🔍 搜索（公司/岗位/地点/性质/内推码）+ 多条件筛选（状态/地点/行业/性质/岗位方向/收藏）+ 排序，**筛选与视图偏好自动记忆**
- 📊 投递状态跟踪：未投递 → 已投递 → 笔试中 → 面试中 → Offer / 已拒绝；支持**岗位级进度**（一家公司投多个岗位各自跟踪）与**进度历史时间线**
- ✅ **待办视图**：邮件动态（笔试/面试/Offer/截止）+ 公司投递截止 + 进行中状态，统一汇总为待办清单，按 已逾期/今天/3天内/本周/更晚 分组；支持 ✓完成（沉底可恢复）、✕忽略（底部「已忽略」分组可恢复）、📅 导出 .ics 日历（UTC 时间 + 稳定 UID，重复导入不产生重复事件）
- ⏰ 顶部横带：新到邮件动态 + 2 天内紧急待办提醒，一键跳待办视图
- 📧 邮件动态同步：维护方解析招聘邮件写入 `dynamics.json`，页面自动拉取、分诊（采纳/忽略）
- 📊 表格 / 🗂️ 卡片 / ✅ 待办 三视图
- 📱 跨设备二维码同步（电脑 ↔ 手机）
- 💾 数据自动备份 + 自动迁移，版本更新不丢状态

## 项目结构

```
qiuzhao-tracker/
├── index.html            # 页面骨架
├── style.css             # 样式层（明暗双主题）
├── data.js               # 数据层：公司列表（维护方更新）
├── official-sites.js     # 数据层：官方校招门户固定清单（人工核实，爬虫按此轮询）
├── dynamics.json         # 数据层：邮件动态（维护方更新，schema 见下）
├── discovered.json       # 数据层：爬虫发现公司候选池（WorkBuddy 更新，schema 见文件内 _readme）
├── js/
│   ├── core.js           #   状态/筛选/偏好序列化等纯逻辑
│   ├── views.js          #   渲染层：仪表盘/表格/卡片/待办/周报
│   ├── features.js       #   交互层：状态操作/邮件动态/待办三态/岗位弹窗
│   ├── export-sync.js    #   导入导出/二维码同步
│   └── main.js           #   启动装配
├── tests/run-tests.js    # 341 项回归测试（node tests/run-tests.js）
└── .github/workflows/    # CI 门禁 + GitHub Pages 部署
```

**状态安全机制：**
- 公司用稳定 ID 存储，公司改名/新增/删除不影响已保存状态
- 旧版本数据自动迁移；快照自动去重保留最近 3 份，异常自动回滚
- 可用 💾 导出备份 / 📥 导入恢复
- 待办三态：动态条「采纳」= 出动态条但留在待办视图（进度只前进不回退，晚到的旧邮件不覆盖新状态）；待办视图「完成」= 沉底可 ↩恢复；「忽略」= 沉到「已忽略」分组，可 ↩恢复

## 邮件动态 dynamics.json（schema v2）

```jsonc
{
  "updatedAt": "2026-08-27T06:30:00+08:00",
  "items": [
    {
      "id": "mail-<公司>-<类型>-<日期>",   // 稳定唯一，用于已读/完成/忽略去重
      "type": "offer | written | interview | deadline | other",
      "company": "公司名",
      "companyId": "data.js 中的公司 id 或 null",
      "jobName": "岗位名",
      "title": "邮件标题",
      "summary": "结构化摘要（要做什么、注意什么）",
      "time": "邮件到达时间 ISO8601",
      "eventTime": "事件时间 ISO8601（面试/笔试，无时区后缀按本地解析）",
      "dueDate": "YYYY-MM-DD（截止类）",
      "round": "轮次，如 一面/二面",
      "actionUrl": "",
      "link": "",
      "suggestStatus": "建议联动的投递状态"
    }
  ]
}
```

> ⚠️ **隐私规则（本仓库公开部署，必须遵守）**：
> `actionUrl` / `link` **一律留空字符串**，邮件中的测评链接、会议链接、确认链接**不入库**；
> 邮件**附件不提取、不入库**。需要点链接/下附件时回到邮箱操作。
> 页面只展示「什么事、什么时间、什么状态」这类元信息。

## 开发与发布

- 本地跑测试：`node tests/run-tests.js`（时区无关，`TZ=UTC` 下也应全过）
- 数据更新：改 `data.js` / `dynamics.json` → 本地测试 → 发布（CI 会校验 dynamics.json 的 schema 与隐私规则，link/actionUrl 非空直接红）
- CI：push 后 GitHub Actions 自动执行语法检查 + 341 项回归测试，通过后自动部署 Pages

## 跨设备同步（手机 ↔ 电脑）

### 云同步（推荐，v8.6 起，后端 Supabase）

1. 点右上角 **☁️** 按钮 → 用邮箱注册/登录（密码不落盘）
2. 之后所有设备登录同一账号即可自动同步进度：本地改动防抖 8 秒上传，页面打开/回到前台自动拉取
3. 云端每行进度仅本人账号可读写（Supabase 行级安全 RLS 在服务端强制隔离，他人拿到 anon key 也读不到）

> 项目凭据（Project URL + anon key）由维护方内置在 `js/export-sync.js` 的 `BUILTIN_CLOUD`；未内置时可在弹窗「高级」里手动填写自己的 Supabase 项目。

**维护方一次性搭建步骤（Supabase 控制台）：**

1. [supabase.com](https://supabase.com) 注册（可用 GitHub 账号）→ New project，区域建议新加坡
2. 「SQL Editor」执行建表 + RLS：

```sql
create table qiuzhao_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table qiuzhao_state enable row level security;
create policy "own select" on qiuzhao_state for select using (auth.uid() = user_id);
create policy "own insert" on qiuzhao_state for insert with check (auth.uid() = user_id);
create policy "own update" on qiuzhao_state for update using (auth.uid() = user_id);
```

3. 「Authentication → Sign In / Providers → Email」关闭 **Confirm email**（否则注册后需收信验证才能登录）
4. 「Project Settings → Data API」确认 REST API 已启用（默认开启）
5. 把 Project URL 和 anon public key 填进 `BUILTIN_CLOUD` 后发布

**v9.5 邮件动态私有化（再执行一次）：** 邮件动态不再进公开仓库，改存私有表，登录账号后才可见。SQL Editor 执行：

```sql
create table qiuzhao_dynamics (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table qiuzhao_dynamics enable row level security;
create policy "own select" on qiuzhao_dynamics for select using (auth.uid() = user_id);
create policy "own insert" on qiuzhao_dynamics for insert with check (auth.uid() = user_id);
create policy "own update" on qiuzhao_dynamics for update using (auth.uid() = user_id);
```

> 过渡期行为：已登录但云端表暂无数据时，网站回退读仓库里的 `dynamics.json`（WorkBuddy 切换写入端前的桥接）；未登录一律不显示邮件动态与邮件待办。写入端接入方式见 AGENTS.md「邮件动态写入端（WorkBuddy）」。

### 二维码手动同步（备用，无需登录账号）

1. 一台设备点右上角 **☁️** → 展开「无账号同步（备用）」→「📤 导出同步码」，显示二维码
2. 另一台设备打开本页面 → **☁️** →「无账号同步（备用）」→「📥 扫描/粘贴导入」→ 扫码或粘贴
3. 反向同步同理

> 没有摄像头也可用：复制/粘贴文本同步码。

## 维护

数据更新由维护方自动完成（修改 `data.js` / `dynamics.json` 并发布），用户无需任何操作，已保存的状态不会丢失。

维护方（WorkBuddy / agent）请读 **[AGENTS.md](AGENTS.md)**：数据文件契约、taxonomy 词表、隐私红线、缓存戳规则、验收与推送流程。

## 免责声明

内推码/链接来源于公开渠道，如失效请以官网为准。
