#!/usr/bin/env node
/* ============================================================
 * 秋招跟踪器 · 回归测试（CI 用）
 * 运行：node tests/run-tests.js
 * 覆盖：数据完整性 / 安全函数 / 状态迁移 / 同步码 / 快照去重
 * ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

// ---------- 测试框架（零依赖） ----------
let pass = 0, fail = 0;
const failures = [];
function t(name, cond, detail) {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; failures.push(name + (detail ? " | " + detail : "")); console.log("  ❌ " + name + (detail ? " | " + detail : "")); }
}
function section(name) { console.log("\n▸ " + name); }

// ---------- 1. 加载数据层 ----------
global.window = {};
require(path.join(ROOT, "data.js"));
const COMPANIES = window.COMPANIES;
const DATA_VERSION = window.DATA_VERSION;

section("数据层完整性 (data.js)");
t("DATA_VERSION 已定义", typeof DATA_VERSION === "number" && DATA_VERSION >= 1);
t("公司总数 ≥ 30", COMPANIES.length >= 30, "当前 " + COMPANIES.length);
t("ID 唯一", new Set(COMPANIES.map(c => c.id)).size === COMPANIES.length);
t("必填字段齐全", COMPANIES.every(c => c.id && c.name && c.type && Array.isArray(c.jobs)));
t("ID 格式合法(小写/数字/连字符)", COMPANIES.every(c => /^[a-z0-9-]+$/.test(c.id)));
t("type 合法", COMPANIES.every(c => ["秋招", "提前批", "技术提前批", "活动"].includes(c.type)));
t("deadline 格式合法(如有)", COMPANIES.every(c => !c.deadline || /^\d{4}-\d{2}-\d{2}$/.test(c.deadline)));
t("refCode 为字符串或 null", COMPANIES.every(c => typeof c.refCode === "string" || c.refCode === null));
t("link 为 http/https(如有)", COMPANIES.every(c => !c.link || /^https?:\/\//i.test(c.link)));

// ---------- 2. 从模块文件拼接源码提取纯函数测试 ----------
section("核心逻辑 (js/*.js 模块提取)");
// v6.1 重构后 app.js 已拆分为 js/ 目录模块，按序拼接为完整源码
const MODULE_FILES = ["core.js", "views.js", "features.js", "export-sync.js", "main.js"];
const appJs = MODULE_FILES.map(f =>
  fs.readFileSync(path.join(ROOT, "js", f), "utf8")
).join("\n\n");

// 提取纯函数源码（支持注入依赖，无 DOM 依赖）
function extractFn(name, deps = {}) {
  const re = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}", "m");
  const m = appJs.match(re);
  if (!m) return null;
  const ctx = { ...deps };
  vm.createContext(ctx);
  vm.runInContext(m[0] + "\nthis." + name + " = " + name + ";", ctx);
  return ctx[name];
}

const escapeHtml = extractFn("escapeHtml");
const safeLink = extractFn("safeLink");
const csvSafe = extractFn("csvSafe");
const parseLocalDate = extractFn("parseLocalDate");
const getDaysLeft = extractFn("getDaysLeft");

t("escapeHtml 已提取", typeof escapeHtml === "function");
t("safeLink 已提取", typeof safeLink === "function");
t("csvSafe 已提取", typeof csvSafe === "function");
t("parseLocalDate 已提取", typeof parseLocalDate === "function");
t("getDaysLeft 已提取", typeof getDaysLeft === "function");

if (escapeHtml) {
  t("XSS: <script> 被转义", !escapeHtml('<script>alert(1)</script>').includes("<script>"));
  t("XSS: 双引号被转义", escapeHtml('a"b').includes("&quot;"));
  t("XSS: 空值安全", escapeHtml(null) === "" && escapeHtml(undefined) === "");
}
if (safeLink) {
  t("链接白名单: https 放行", safeLink("https://x.com") === "https://x.com");
  t("链接白名单: javascript: 拦截", safeLink("javascript:alert(1)") === "#");
  t("链接白名单: 空值兜底", safeLink("") === "#");
}
if (csvSafe) {
  t("CSV: = 开头转义", csvSafe("=1+1").includes("'=1+1"));
  t("CSV: + 开头转义", csvSafe("+86").includes("'+86"));
  t("CSV: 正常字段不误伤", csvSafe("Shopee") === '"Shopee"');
  t("CSV: 引号转义", csvSafe('a"b') === '"a""b"');
}
if (parseLocalDate) {
  const d = parseLocalDate("2026-08-31");
  t("日期解析: 本地时区正确", d && d.getFullYear() === 2026 && d.getMonth() === 7 && d.getDate() === 31);
  t("日期解析: 非法输入返回 null", parseLocalDate("bad") === null);
}
if (getDaysLeft) {
  t("倒计时: 非法输入返回 null", getDaysLeft("") === null);
}

// ---------- 2b. 数据补全断言（v4.3） ----------
section("数据补全 (v4.3)");
t("全部分类已补齐", COMPANIES.every(c => Array.isArray(c.category) && c.category.length > 0));
t("全部地点已补齐", COMPANIES.every(c => typeof c.location === "string" && c.location.length > 0));
t("分类去重后 ≥ 6 个行业", new Set(COMPANIES.flatMap(c => c.category)).size >= 6);

// ---------- 2c. 新功能纯函数（v4.3 周报/提醒/一键复制） ----------
section("新功能纯函数 (v4.3)");

// 构造带依赖的测试环境
const stubState = { companies: {} };
COMPANIES.forEach(c => { stubState.companies[c.id] = { status: "未投递", starred: false, note: "", lastUpdate: null }; });
stubState.companies.shopee = { status: "已投递", starred: true, note: "", lastUpdate: null };
stubState.companies.iflytek = { status: "笔试中", starred: false, note: "", lastUpdate: null };
stubState.companies.dji = { status: "Offer", starred: false, note: "", lastUpdate: null };
const stubGetState = (id) => stubState.companies[id] || { status: "未投递", starred: false, note: "" };

const DEP = {
  COMPANIES,
  getState: stubGetState,
  STATUS_OPTIONS: ["未投递", "已投递", "笔试中", "面试中", "Offer", "已拒绝"],
  DONE_STATUSES: ["Offer", "已拒绝"],
  WEEK_MS: 7 * 24 * 3600 * 1000,
  pushName: (map, key, name) => { if (!map[key]) map[key] = []; map[key].push(name); },
  splitKeywords: (kw) => String(kw || "").toLowerCase().split(/\s+/).filter(Boolean),
  escapeHtml: (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
  parseLocalDate: (str) => { const p = String(str).split("-").map(Number); if (p.length < 3 || p.some(isNaN)) return null; return new Date(p[0], p[1] - 1, p[2]); }
};

const groupTodos = extractFn("groupTodos", { ...DEP, TODO_GROUPS: [
  { key: "overdue", label: "⚠️ 已逾期" }, { key: "today", label: "🔴 今天" },
  { key: "soon", label: "🟠 3天内" }, { key: "week", label: "🟡 本周" },
  { key: "later", label: "🟢 更晚" }, { key: "none", label: "⚪ 无明确时间" },
  { key: "done", label: "✅ 已完成" }, { key: "ignored", label: "🗑 已忽略（可恢复）" }
] });
const getWeeklyStats = extractFn("getWeeklyStats", DEP);
const shouldAlertToday = extractFn("shouldAlertToday", DEP);
const buildCompanyInfoText = extractFn("buildCompanyInfoText", DEP);
const extractCities = extractFn("extractCities", { ...DEP, CITY_TOKEN_EXCLUDE: new Set(["全国多地", "全国", "线上", "海外", "广东"]) });
const fmtNames = extractFn("fmtNames", DEP);
const splitKeywords = extractFn("splitKeywords", DEP);
const highlightText = extractFn("highlightText", DEP);
const matchFilters = extractFn("matchFilters", DEP);
const formatFilterParts = extractFn("formatFilterParts", DEP);
const countFiltered = extractFn("countFiltered", { ...DEP, matchFilters, filterBySource: extractFn("filterBySource"), currentSource: "referral" });
const deriveCompanyStatus = extractFn("deriveCompanyStatus", { ...DEP, JOB_STATUS_RANK: { "Offer": 6, "面试中": 5, "笔试中": 4, "已投递": 3, "已拒绝": 2, "未投递": 1 } });
const upgradeToV3 = extractFn("upgradeToV3", DEP);
const groupCitiesByProvince = extractFn("groupCitiesByProvince", { ...DEP,
  CITY_PROVINCE: { "深圳": "广东", "广州": "广东", "苏州": "江苏", "杭州": "浙江", "上海": "上海", "北京": "北京", "成都": "四川", "全国多地": "全国" }
});
const extractStandardJobs = extractFn("extractStandardJobs", { ...DEP,
  JOB_KEYWORDS: ["算法", "研发", "开发", "测试", "数据", "产品", "运营", "市场", "设计", "美术"]
});
const groupJobsByDirection = extractFn("groupJobsByDirection", { ...DEP,
  JOB_DIRS: [
    { dir: "技术类", keys: ["算法", "研发", "开发", "测试", "数据"] },
    { dir: "产品/运营", keys: ["产品", "运营"] },
    { dir: "市场/职能", keys: ["市场", "设计", "美术"] }
  ]
});
// v8.2: 行业分组 / 性质提取（依赖 data.js 的 taxonomy 常量）
const groupIndustries = extractFn("groupIndustries", { window: { INDUSTRY_GROUPS: window.INDUSTRY_GROUPS } });
const scopedIndustries = extractFn("scopedIndustries");
const scopedNatures = extractFn("scopedNatures", { window: { NATURES: window.NATURES } });
const mergeCloudState = extractFn("mergeCloudState", { ...DEP, deriveCompanyStatus });
const classifyMail = extractFn("classifyMail", DEP);
const filterNewDynamics = extractFn("filterNewDynamics", DEP);
// v7.2 新增纯函数
const serializeUIPrefs = extractFn("serializeUIPrefs", DEP);
const deserializeUIPrefs = extractFn("deserializeUIPrefs", DEP);
const icsEscape = extractFn("icsEscape", DEP);
const buildICS = extractFn("buildICS", { ...DEP, icsEscape });
const buildTodoItems = extractFn("buildTodoItems", { ...DEP, DYN_TYPE_LABEL: { interview: "面试", written: "笔试", offer: "Offer", deadline: "截止" } });
const fmtTodoWhen = extractFn("fmtTodoWhen", DEP);
// v7.4 新增纯函数
const jsArg = extractFn("jsArg", { escapeHtml });
const shouldAdoptStatus = extractFn("shouldAdoptStatus", { JOB_STATUS_RANK: { "Offer": 6, "面试中": 5, "笔试中": 4, "已投递": 3, "已拒绝": 2, "未投递": 1 } });
const buildSlimCompanies = extractFn("buildSlimCompanies");

t("groupTodos 已提取", typeof groupTodos === "function");
t("getWeeklyStats 已提取", typeof getWeeklyStats === "function");
t("shouldAlertToday 已提取", typeof shouldAlertToday === "function");
t("buildCompanyInfoText 已提取", typeof buildCompanyInfoText === "function");
t("extractCities 已提取", typeof extractCities === "function");
t("fmtNames 已提取", typeof fmtNames === "function");
t("groupCitiesByProvince 已提取", typeof groupCitiesByProvince === "function");
t("extractStandardJobs 已提取", typeof extractStandardJobs === "function");
t("groupJobsByDirection 已提取", typeof groupJobsByDirection === "function");
t("deriveCompanyStatus 已提取", typeof deriveCompanyStatus === "function");
t("upgradeToV3 已提取", typeof upgradeToV3 === "function");
t("mergeCloudState 已提取", typeof mergeCloudState === "function");
t("classifyMail 已提取", typeof classifyMail === "function");
t("filterNewDynamics 已提取", typeof filterNewDynamics === "function");

// ---------- v6.0 邮件动态 ----------
section("v6.0 邮件动态追踪");
if (classifyMail) {
  t("分类: 百度面试评价邀请 → interview", classifyMail("邀请您对本次面试进行评价", "talentsystem@baidu.com") === "interview");
  t("分类: 广发录取报到须知 → offer", classifyMail("校园招聘实习生报到须知（收到邮件请回复）", "campus@gf.com.cn") === "offer");
  t("分类: 笔试通知 → written", classifyMail("XX公司笔试通知", "hr@corp.com") === "written");
  t("分类: 面试提醒 → interview", classifyMail("面试提醒", "hr@corp.com") === "interview");
  t("分类: 拒信遗憾 → reject", classifyMail("很遗憾未能通过本轮筛选", "hr@corp.com") === "reject");
  t("分类: 逾期视为放弃 → deadline", classifyMail("请回复否则逾期视为放弃", "hr@corp.com") === "deadline");
  t("过滤: 安克校招启动(猎聘EDM) → other线索", classifyMail("安克创新2027届全球校招正式启动", "service@mail34.lietou-edm.com") === "other");
  t("过滤: 猎聘普通营销 → null", classifyMail("给你推荐高薪岗位", "service@mail34.lietou-edm.com") === null);
  t("过滤: 智联岗位推荐 → null", classifyMail("中汽数据邀请投递AI软件工程师", "service1@growth-mail-tc.zhaopin.cn") === null);
}
if (filterNewDynamics) {
  const items = [
    { id: "a", time: "2026-08-27T01:00:00Z" },
    { id: "b", time: "2026-08-26T01:00:00Z" },
    { id: "c", time: "2026-08-25T01:00:00Z" }
  ];
  const out = filterNewDynamics(items, ["a"]);
  t("动态过滤: seen 剔除后剩2条", out.length === 2);
  t("动态过滤: 时间倒序(b在前)", out[0].id === "b");
  t("动态过滤: 空seen全保留", filterNewDynamics(items, []).length === 3);
}


// ---------- v7 云同步合并 ----------
section("v7.1 云同步（岗位级合并）");
if (mergeCloudState) {
  const mk = (id, status, t) => ({ [id]: { status, starred: false, note: "", lastUpdate: t, jobs: {} } });
  const local = { companies: { ...mk("a", "已投递", 100), ...mk("b", "笔试中", 200) } };
  const remote = { companies: { ...mk("a", "面试中", 300), ...mk("c", "Offer", 400) } };
  const merged = mergeCloudState(local, remote);
  t("合并: 双方都有取较新(lastUpdate)", merged.companies.a.status === "面试中");
  t("合并: 仅本地有则保留", merged.companies.b.status === "笔试中");
  t("合并: 仅云端有则补入", merged.companies.c.status === "Offer");
  t("合并: 本地较新时保留本地", mergeCloudState({ companies: mk("x", "已投递", 999) }, { companies: mk("x", "未投递", 1) }).companies.x.status === "已投递");
  t("合并: 空远程全保留本地", Object.keys(mergeCloudState(local, { companies: {} }).companies).length === 2);

  // v7.1 岗位级：多设备各投不同岗位，并集保留（旧公司级合并会整包互覆）
  const mkJobs = (id, jobs, status, t, extra) => ({ [id]: { status, starred: false, note: "", lastUpdate: t, jobs, ...(extra || {}) } });
  const mJobs = mergeCloudState(
    { companies: mkJobs("a", { "算法岗": "面试中" }, "面试中", 100) },
    { companies: mkJobs("a", { "开发岗": "已投递" }, "已投递", 200) }
  ).companies.a;
  t("岗位合并: 双方不同岗位取并集", mJobs.jobs["算法岗"] === "面试中" && mJobs.jobs["开发岗"] === "已投递");
  t("岗位合并: status 从并集重新聚合", mJobs.status === "面试中");
  t("岗位合并: 同岗位冲突取较新侧", mergeCloudState(
    { companies: mkJobs("a", { "算法岗": "笔试中" }, "笔试中", 100) },
    { companies: mkJobs("a", { "算法岗": "面试中" }, "面试中", 200) }
  ).companies.a.jobs["算法岗"] === "面试中");
  t("收藏合并: 任一侧收藏即保留", mergeCloudState(
    { companies: mkJobs("a", {}, "未投递", 100, { starred: true }) },
    { companies: mkJobs("a", {}, "已投递", 200) }
  ).companies.a.starred === true);
  t("备注合并: 较新侧为空时保留另一侧", mergeCloudState(
    { companies: mkJobs("a", {}, "未投递", 100, { note: "8.31 前免笔试" }) },
    { companies: mkJobs("a", {}, "已投递", 200) }
  ).companies.a.note === "8.31 前免笔试");
  t("lastUpdate 合并: 取双侧较大值", mergeCloudState(
    { companies: mkJobs("a", {}, "未投递", 100) },
    { companies: mkJobs("a", {}, "已投递", 200) }
  ).companies.a.lastUpdate === 200);
  // v7.2: 历史记录双侧并集、去重、按时间排序
  const mHist = mergeCloudState(
    { companies: mkJobs("a", {}, "已投递", 100, { history: [{ time: 10, job: null, from: null, to: "已投递" }, { time: 30, job: null, from: "已投递", to: "笔试中" }] }) },
    { companies: mkJobs("a", {}, "笔试中", 200, { history: [{ time: 10, job: null, from: null, to: "已投递" }, { time: 50, job: null, from: "笔试中", to: "面试中" }] }) }
  ).companies.a.history;
  t("历史合并: 双侧并集去重", mHist.length === 3);
  t("历史合并: 按时间排序", mHist[0].time === 10 && mHist[2].time === 50);
}

// ---------- v7.2 新增功能 ----------
section("v7.2 偏好持久化 / 待办面板 / ICS / 隐藏已截止");

t("serializeUIPrefs 已提取", typeof serializeUIPrefs === "function");
t("deserializeUIPrefs 已提取", typeof deserializeUIPrefs === "function");
t("buildICS 已提取", typeof buildICS === "function");
t("buildTodoItems 已提取", typeof buildTodoItems === "function");

if (serializeUIPrefs && deserializeUIPrefs) {
  const f = { status: new Set(["面试中"]), starred: true, locations: new Set(["北京"]), industries: new Set(), jobs: new Set(["算法"]), keyword: "百度", hideExpired: false };
  const back = deserializeUIPrefs(serializeUIPrefs(f, { field: "deadline", asc: false }, "todo"));
  t("偏好往返: 视图/排序", back.view === "todo" && back.sort.field === "deadline" && back.sort.asc === false);
  t("偏好往返: 筛选集合与开关", back.f.status[0] === "面试中" && back.f.starred === true && back.f.locations[0] === "北京" && back.f.jobs[0] === "算法" && back.f.keyword === "百度" && back.f.hideExpired === false);
  t("偏好反序列化: 非法输入返回 null", deserializeUIPrefs("not-json") === null && deserializeUIPrefs('{"v":9}') === null);
}

if (buildICS) {
  const ics = buildICS({ company: "百度", jobName: "算法岗", label: "面试·二面", summary: "视频面试", actionUrl: "https://meeting.example.com/x", eventTime: "2026-08-28T17:00:00+08:00" });
  t("ICS: 基本结构", ics.includes("BEGIN:VCALENDAR") && ics.includes("END:VCALENDAR") && ics.includes("BEGIN:VEVENT"));
  t("ICS: 含开始/结束时间(默认1小时)", /DTSTART:\d{8}T\d{6}/.test(ics) && /DTEND:\d{8}T\d{6}/.test(ics));
  t("ICS: 标题与链接", ics.includes("SUMMARY:【秋招】百度·算法岗 面试·二面") && ics.includes("URL:https://meeting.example.com/x"));
  const icsAllDay = buildICS({ company: "广发证券", label: "Offer确认截止", dueDate: "2026-08-28" });
  t("ICS: 仅截止日时为全天事件", icsAllDay.includes("DTSTART;VALUE=DATE:20260828"));
  t("ICS: 特殊字符转义", buildICS({ company: "A,B;C", label: "面\n试" }).includes("A\\,B\\;C"));
}

if (buildTodoItems && fmtTodoWhen) {
  const now = new Date(2026, 7, 26, 12, 0, 0);  // 2026-08-26 中午
  const comps = [
    { id: "c1", name: "甲公司", deadline: "2026-08-28", link: "https://a.com" },   // 2天后截止
    { id: "c2", name: "乙公司" },                                                    // 笔试中（邮件已覆盖 → 去重）
    { id: "c3", name: "丙公司" },                                                    // Offer（不提醒）
    { id: "c4", name: "丁公司" }                                                     // 面试中（无邮件、无时间 → 排最后）
  ];
  const st = { c1: { status: "未投递" }, c2: { status: "笔试中" }, c3: { status: "Offer" }, c4: { status: "面试中" } };
  const dyn = [
    { id: "m1", type: "written", company: "乙公司", companyId: "c2", jobName: "算法", eventTime: "2026-08-26T17:00:00+08:00", summary: "在线测评" },  // 今天，与 c2 "笔试中"状态同类型 → 应去重
    { id: "m2", type: "offer", company: "广发", companyId: null, jobName: "实习", dueDate: "2026-08-24", actionUrl: "https://confirm.com" },            // 已逾期
    { id: "m3", type: "other", company: "线索公司" }  // other 类型不进待办
  ];
  const todo = buildTodoItems(comps, id => st[id] || { status: "未投递" }, dyn, [], [], now);
  t("待办: other 类型不进列表", !todo.some(x => x.company === "线索公司"));
  t("待办: 邮件与状态来源去重(同公司同类型只保留邮件)", todo.filter(x => x.company === "乙公司").length === 1 && todo.find(x => x.company === "乙公司").source === "mail");
  t("待办: Offer 已结束公司不提醒", !todo.some(x => x.company === "丙公司"));
  t("待办: 按紧急度排序(逾期最前)", todo[0].company === "广发" && todo[0].urgency === "overdue");
  t("待办: 公司截止进入列表且倒计时正确", todo.some(x => x.company === "甲公司" && x.urgency === "soon" && x.days === 2));
  t("待办: 无时间事项排最后", todo[todo.length - 1].company === "丁公司" && todo[todo.length - 1].urgency === "none");
  t("待办文案: 今天带时间", fmtTodoWhen({ days: 0, eventTime: "2026-08-26T17:00:00" }) === "今天 17:00");  // 无时区后缀=本地时间解析，CI(UTC)也稳定
  t("待办文案: 逾期", fmtTodoWhen({ days: -2 }) === "已逾期2天");
  // v7.3: 三态（done/ignored）与远期邮件
  const doneT = buildTodoItems(comps, id => st[id] || { status: "未投递" }, dyn, ["m1"], [], now);
  t("待办: 完成标记生效(仍在列表)", doneT.find(x => x.dynId === "m1").done === true);
  const ignT = buildTodoItems(comps, id => st[id] || { status: "未投递" }, dyn, [], ["m2"], now);
  t("待办: 忽略项保留并带标记(回收站)", ignT.find(x => x.dynId === "m2") && ignT.find(x => x.dynId === "m2").ignored === true);
  t("待办: done/ignored 不占去重键(status 待办回归)", doneT.some(x => x.company === "乙公司" && x.source === "status"));
  const farT = buildTodoItems([], id => ({ status: "未投递" }),
    [{ id: "m9", type: "written", company: "远期公司", eventTime: "2026-09-25T10:00:00+08:00" }], [], [], now);  // 30天后
  t("待办: 远期邮件也进列表(later 组)", farT.length === 1 && farT[0].urgency === "later");
  if (groupTodos) {
    const gs = groupTodos([
      { urgency: "later", done: false, company: "A" },
      { urgency: "today", done: false, company: "B" },
      { urgency: "today", done: true, company: "C" }
    ]);
    t("待办分组: 已完成沉底", gs[gs.length - 1].key === "done" && gs[0].key === "today");
    t("待办分组: 空组不出现", !gs.some(g => g.key === "overdue"));
    const gs2 = groupTodos([
      { urgency: "today", done: false, company: "A" },
      { urgency: "today", done: false, ignored: true, company: "B" }
    ]);
    t("待办分组: 已忽略沉到最底", gs2[gs2.length - 1].key === "ignored");
  }
}

// matchFilters: 隐藏已截止（未投递）
if (matchFilters) {
  const pastC = { id: "past", name: "旧公司", jobs: [], location: "", category: [], note: "", deadline: "2020-01-01" };
  const doneC = { id: "pastOffer", name: "旧Offer公司", jobs: [], location: "", category: [], note: "", deadline: "2020-01-01" };
  const futureC = { id: "future", name: "新公司", jobs: [], location: "", category: [], note: "", deadline: "2099-01-01" };
  const getStPast = id => ({ status: id === "pastOffer" ? "Offer" : "未投递" });
  const baseF = { status: new Set(), starred: false, locations: new Set(), industries: new Set(), jobs: new Set(), keyword: "", hideExpired: true };
  t("隐藏已截止: 未投递+已截止被过滤", matchFilters(pastC, baseF, getStPast) === false);
  t("隐藏已截止: 已截止但有Offer不受影响", matchFilters(doneC, baseF, getStPast) === true);
  t("隐藏已截止: 未截止正常显示", matchFilters(futureC, baseF, getStPast) === true);
  t("隐藏已截止: 开关关闭时全部显示", matchFilters(pastC, { ...baseF, hideExpired: false }, getStPast) === true);
}

// ---------- v6 岗位级状态 ----------
section("v6 岗位级投递状态");
if (deriveCompanyStatus) {
  t("聚合: 无岗位回退 fallback", deriveCompanyStatus({}, "已投递") === "已投递");
  t("聚合: Offer 最高优先", deriveCompanyStatus({ "算法岗": "笔试中", "产品岗": "Offer" }, "未投递") === "Offer");
  t("聚合: 已拒绝+已投递 → 已投递", deriveCompanyStatus({ "算法岗": "已拒绝", "产品岗": "已投递" }, "未投递") === "已投递");
  t("聚合: 全部已拒绝 → 已拒绝", deriveCompanyStatus({ "算法岗": "已拒绝", "产品岗": "已拒绝" }, "未投递") === "已拒绝");
  t("聚合: 单岗位面试中", deriveCompanyStatus({ "研发岗": "面试中" }, "未投递") === "面试中");
}
if (upgradeToV3) {
  const v2 = { version: 2, companies: { shopee: { status: "已投递", starred: true, note: "8/5笔试", lastUpdate: 123 } } };
  const v3 = upgradeToV3(v2);
  t("迁移: version 升 3", v3.version === 3);
  t("迁移: 老字段无损", v3.companies.shopee.status === "已投递" && v3.companies.shopee.starred === true && v3.companies.shopee.note === "8/5笔试" && v3.companies.shopee.lastUpdate === 123);
  t("迁移: 补 jobs 空映射", v3.companies.shopee.jobs && Object.keys(v3.companies.shopee.jobs).length === 0);
  const v3b = upgradeToV3({ version: 3, companies: { xiaomi: { status: "未投递", starred: false, note: "", lastUpdate: null, jobs: { "算法岗": "笔试中" } } } });
  t("迁移: v3 幂等(已有 jobs 保留)", v3b.companies.xiaomi.jobs["算法岗"] === "笔试中");
}

if (getWeeklyStats) {
  const now = Date.now();
  const state = { companies: {
    a: { status: "已投递", lastUpdate: now },              // 本周新投递
    b: { status: "Offer", lastUpdate: now - 3600e3 },     // 本周 Offer
    c: { status: "笔试中", lastUpdate: now - 8 * 86400e3 }, // 上周（不算）
    d: { status: "未投递", lastUpdate: null }              // 无时间戳
  }};
  const stats = getWeeklyStats(state);
  t("周报: 本周更新计数", stats.touched === 2);
  t("周报: 新投递=1", stats.newApplied === 1);
  t("周报: Offer=1", stats.newOffer === 1);
  t("周报: 上周/无时间戳不计入", stats.newTest === 0);
  t("周报: 含公司名(byStatus)", Array.isArray(stats.byStatus["已投递"]) && stats.byStatus["已投递"].length >= 1);
}
if (extractCities) {
  const cities = extractCities([
    { location: "北京/上海/深圳" }, { location: "深圳/杭州" }, { location: "深圳" },
    { location: "全国多地" }, { location: "线上" }, { location: "" }
  ]);
  t("地点提取: 去重", cities.includes("北京") && cities.includes("深圳") && cities.includes("杭州") && cities.includes("上海"));
  t("地点提取: 排除全国多地/线上/空", !cities.includes("全国多地") && !cities.includes("线上"));
  t("地点提取: 按频次排序(深圳最前)", cities[0] === "深圳");
}
if (fmtNames) {
  t("公司名格式化: 3 家以内全列", fmtNames(["A", "B"]) === "A、B");
  t("公司名格式化: 超出显示等N家", fmtNames(["A", "B", "C", "D"]) === "A、B、C 等4家");
  t("公司名格式化: 空安全", fmtNames([]) === "");
}
if (shouldAlertToday) {
  t("提醒: 同一天不重复", shouldAlertToday("2026-08-02", "2026-08-02") === false);
  t("提醒: 新一天要提醒", shouldAlertToday("2026-08-01", "2026-08-02") === true);
  t("提醒: 从未提醒要提醒", shouldAlertToday(null, "2026-08-02") === true);
}
if (buildCompanyInfoText) {
  const txt = buildCompanyInfoText("shopee");
  t("一键复制: 含公司名", typeof txt === "string" && txt.includes("Shopee虾皮"));
  t("一键复制: 含内推码", typeof txt === "string" && txt.includes("DSkUucG8"));
  t("一键复制: 含岗位", typeof txt === "string" && txt.includes("研发岗"));
}

// ---------- 2d. v5 多条件筛选（搜索分词/岗位词/匹配逻辑/高亮） ----------
section("v5 多条件筛选");
if (splitKeywords) {
  t("分词: 单关键词", JSON.stringify(splitKeywords("算法")) === '["算法"]');
  t("分词: 多词空格分隔", JSON.stringify(splitKeywords("算法 深圳")) === '["算法","深圳"]');
  t("分词: 多余空格过滤", splitKeywords("  算法   研发  ").length === 2);
  t("分词: 空输入安全", splitKeywords("").length === 0);
}
if (extractStandardJobs) {
  const jobs = extractStandardJobs([
    { jobs: ["算法岗", "研发岗", "产品等八大类100+岗位"] },
    { jobs: ["算法", "算法类", "研究算法", "大量技术岗"] },
    { jobs: ["研发", "产品岗"] }
  ], 2);
  // 归一：算法岗/算法/算法类/研究算法 → 统一"算法"；噪音文本不产生任何词
  t("岗位归一: 算法变体合并为一个词", jobs.filter(j => j === "算法").length === 1);
  t("岗位归一: 研发变体合并", jobs.filter(j => j === "研发").length === 1);
  t("岗位归一: 噪音文本被过滤", !jobs.includes("产品等八大类100+岗位") && !jobs.includes("大量技术岗"));
  t("岗位归一: 频次≥2 才出现", jobs.includes("算法") && !jobs.includes("美术"));
}
if (groupCitiesByProvince) {
  const groups = groupCitiesByProvince(["深圳", "广州", "苏州", "杭州", "上海", "北京", "成都", "全国多地", "火星城"]);
  t("省份分组: 广东含深圳广州", groups.find(g => g.province === "广东").cities.includes("深圳") && groups.find(g => g.province === "广东").cities.includes("广州"));
  t("省份分组: 江苏含苏州", groups.find(g => g.province === "江苏").cities.includes("苏州"));
  t("省份分组: 直辖市独立(上海)", groups.find(g => g.province === "上海").cities.includes("上海"));
  t("省份分组: 未映射归其他", groups.find(g => g.province === "其他").cities.includes("火星城"));
  t("省份分组: 顺序(广东在前)", groups[0].province === "广东");
}
if (highlightText) {
  const hl = highlightText("Shopee虾皮 深圳", "虾皮");
  t("高亮: 命中词包 <mark>", hl.includes("<mark class=\"hl\">虾皮</mark>"));
  t("高亮: 未命中词原样", highlightText("ABC", "x") === "ABC");
  t("高亮: XSS 先转义", !highlightText("<script>", "s").includes("<script>"));
  t("高亮: 多词都高亮", (highlightText("算法 研发", "算法 研发").match(/<mark/g) || []).length === 2);
}
if (matchFilters) {
  const mkF = (o) => ({
    status: new Set(o.status || []), starred: !!o.starred,
    locations: new Set(o.locations || []), industries: new Set(o.industries || []),
    natures: new Set(o.natures || []),
    jobs: new Set(o.jobs || []), keyword: o.keyword || ""
  });
  const shopee = COMPANIES.find(c => c.id === "shopee");   // 已投递/星标/AI/深圳
  const baidu = COMPANIES.find(c => c.id === "baidu");     // 未投递/AI/北京
  const dji = COMPANIES.find(c => c.id === "dji");         // 未投递/智驾/深圳
  const st = (id) => stubState.companies[id];
  t("多选城市 OR: 深圳+北京 都命中", matchFilters(shopee, mkF({ locations: ["深圳", "北京"] }), st) && matchFilters(baidu, mkF({ locations: ["深圳", "北京"] }), st));
  t("跨维 AND: 行业互联网+地点深圳 只中虾皮", matchFilters(shopee, mkF({ industries: ["互联网"], locations: ["深圳"] }), st) && !matchFilters(dji, mkF({ industries: ["互联网"], locations: ["深圳"] }), st));
  t("状态多选: 已投递命中 未投递不命中", matchFilters(shopee, mkF({ status: ["已投递", "面试中"] }), st) && !matchFilters(baidu, mkF({ status: ["已投递", "面试中"] }), st));
  t("岗位包含: 岗位词命中", matchFilters(shopee, mkF({ jobs: ["算法"] }), st));
  t("关键词分词 AND: 双词都需命中", matchFilters(shopee, mkF({ keyword: "虾皮 深圳" }), st) && !matchFilters(baidu, mkF({ keyword: "百度 深圳" }), st));
  t("收藏开关", matchFilters(shopee, mkF({ starred: true }), st) && !matchFilters(baidu, mkF({ starred: true }), st));
  t("性质筛选: 外企中虾皮 不中百度", matchFilters(shopee, mkF({ natures: ["外企"] }), st) && !matchFilters(baidu, mkF({ natures: ["外企"] }), st));
  t("性质+行业跨维 AND", matchFilters(shopee, mkF({ natures: ["外企"], industries: ["互联网"] }), st) && !matchFilters(shopee, mkF({ natures: ["央企"], industries: ["互联网"] }), st));
  t("空条件: 全部通过", matchFilters(baidu, mkF({}), st));
}
if (formatFilterParts) {
  const f = {
    status: new Set(["笔试中"]), starred: true,
    locations: new Set(["深圳", "北京"]), industries: new Set(["游戏"]),
    jobs: new Set(), keyword: "算法"
  };
  const groups = formatFilterParts(f);
  t("条件条: 分组数量(收藏/状态/地点/行业/关键词)", groups.length === 5);
  t("条件条: 同维多值合并为一项", groups.find(g => g.dim === "locations").items.length === 2);
  t("条件条: 关键词组", groups[groups.length - 1].dim === "keyword" && groups[groups.length - 1].items[0].val === "算法");
  t("条件条: 空条件返回空数组", formatFilterParts({ status: new Set(), starred: false, locations: new Set(), industries: new Set(), jobs: new Set(), keyword: "" }).length === 0);
  const fN = { status: new Set(), starred: false, locations: new Set(), industries: new Set(), natures: new Set(["央企", "国企"]), jobs: new Set(), keyword: "" };
  const groupsN = formatFilterParts(fN);
  t("条件条: 性质维度分组", groupsN.length === 1 && groupsN[0].dim === "natures" && groupsN[0].items.length === 2);
}
if (countFiltered) {
  const f = { status: new Set(["未投递"]), starred: false, locations: new Set(), industries: new Set(), jobs: new Set(), keyword: "" };
  const cnt = countFiltered(f);
  t("结果计数: 未投递数量正确", cnt > 0 && cnt <= COMPANIES.length);
  const fAll = { status: new Set(), starred: false, locations: new Set(), industries: new Set(), jobs: new Set(), keyword: "" };
  t("结果计数: 无条件=全部", countFiltered(fAll) === COMPANIES.length);
}
if (groupCitiesByProvince) {
  const groups2 = groupCitiesByProvince(["上海", "深圳", "北京", "成都", "广州", "全国多地", "火星城"]);
  t("省份分组2: 广东含深圳广州", groups2.find(g => g.province === "广东") && groups2.find(g => g.province === "广东").cities.includes("深圳") && groups2.find(g => g.province === "广东").cities.includes("广州"));
  t("省份分组2: 上海直辖市独立", groups2.find(g => g.province === "上海") && groups2.find(g => g.province === "上海").cities.includes("上海"));
  t("省份分组2: 未映射归其他", groups2.find(g => g.province === "其他") && groups2.find(g => g.province === "其他").cities.includes("火星城"));
  t("省份分组2: 顺序(广东在前)", groups2[0].province === "广东");
}
if (groupJobsByDirection) {
  const groups = groupJobsByDirection(["算法", "研发", "产品", "市场", "测试", "神秘职位"]);
  t("方向分组: 算法研发归技术类", groups.find(g => g.dir === "技术类").jobs.includes("算法") && groups.find(g => g.dir === "技术类").jobs.includes("研发"));
  t("方向分组: 产品归产品运营", groups.find(g => g.dir === "产品/运营").jobs.includes("产品"));
  t("方向分组: 市场归市场职能", groups.find(g => g.dir === "市场/职能").jobs.includes("市场"));
  t("方向分组: 未匹配归其他", groups.find(g => g.dir === "其他").jobs.includes("神秘职位"));
  // 标准词不重复：同一词只在一个方向
  const allJobs = groups.flatMap(g => g.jobs);
  t("方向分组: 无重复词", new Set(allJobs).size === allJobs.length);
}
if (groupIndustries) {
  const gs = groupIndustries(["互联网", "银行", "券商/基金/期货", "未知行业"]);
  t("行业分组: 金融组含银行+券商基金", gs.find(g => g.group === "金融").values.join(",") === "银行,券商/基金/期货");
  t("行业分组: 只保留实际出现的行业", !gs.some(g => g.values.includes("游戏")));
  t("行业分组: 未入组归其他", gs.find(g => g.group === "其他").values.includes("未知行业"));
  t("行业分组: 组顺序按词表", gs[0].group === "金融");
}
if (scopedIndustries) {
  const inds = scopedIndustries([{ category: ["新发现", "互联网"] }, { category: ["活动"] }, { category: ["游戏"] }]);
  t("行业提取: 剔除新发现/活动", !inds.includes("新发现") && !inds.includes("活动") && inds.includes("互联网") && inds.includes("游戏"));
}
if (scopedNatures) {
  const ns = scopedNatures([{ nature: "民企" }, { nature: "央企" }, { nature: "民企" }, {}]);
  t("性质提取: 去重+按词表序+容错空值", ns.join(",") === "央企,民企");
}

// ---------- 2e. v8.2 行业/性质 taxonomy 完整性 ----------
section("行业/性质 taxonomy (v8.2)");
(function() {
  const GROUPS = window.INDUSTRY_GROUPS || {};
  const NATURES = window.NATURES || [];
  const VALID = Object.values(GROUPS).flat().concat(["活动"]);
  t("INDUSTRY_GROUPS 已定义且 5 组", Object.keys(GROUPS).length === 5);
  t("NATURES 已定义且 5 值", NATURES.length === 5 && ["央企", "国企", "民企", "外企", "合资"].every(n => NATURES.includes(n)));
  t("行业组内无重复值", new Set(Object.values(GROUPS).flat()).size === Object.values(GROUPS).flat().length);
  const allValid = COMPANIES.every(c => c.category.every(cat => VALID.includes(cat)));
  t("分类全部在合法集内", allValid);
  t("每家公司至少 1 分类", COMPANIES.every(c => c.category.length >= 1));
  t("每家公司性质合法", COMPANIES.every(c => NATURES.includes(c.nature)),
    COMPANIES.filter(c => !NATURES.includes(c.nature)).map(c => c.id).join(","));
  // 归属抽查：Shopee→互联网、大疆→智能硬件、百度→互联网、讯飞→AI/机器人
  const cat = id => COMPANIES.find(c => c.id === id).category[0];
  t("归属: Shopee=互联网", cat("shopee") === "互联网");
  t("归属: 大疆=智能硬件", cat("dji") === "智能硬件");
  t("归属: 百度=互联网", cat("baidu") === "互联网");
  t("归属: 讯飞=AI/机器人", cat("iflytek") === "AI/机器人");
  t("归属: 汇川=工业/制造/能源", cat("inovance") === "工业/制造/能源");
  t("归属: 招银网络=金融科技", COMPANIES.find(c => c.id === "cmbnt").category.includes("金融科技"));
  t("性质抽查: 招银网络=央企", COMPANIES.find(c => c.id === "cmbnt").nature === "央企");
  t("性质抽查: Shopee=外企", COMPANIES.find(c => c.id === "shopee").nature === "外企");
  t("性质抽查: 百度=民企", COMPANIES.find(c => c.id === "baidu").nature === "民企");
})();


// ---------- 3. 状态迁移（模拟 v1 → v2） ----------
section("状态迁移 (v1 → v2)");
(function() {
  const nameToId = {};
  COMPANIES.forEach(c => { nameToId[c.name] = c.id; });
  const v1 = { version: 1, companies: {
    "Shopee虾皮": { status: "已投递", starred: true, note: "8/5笔试" },
    "科大讯飞": { status: "面试中", starred: false, note: "二面过了" },
    "DJI大疆": { status: "Offer", starred: true, note: "" }
  }};
  let migrated = 0;
  const companies = {};
  Object.keys(v1.companies).forEach(name => {
    const id = nameToId[name];
    if (id) {
      const st = v1.companies[name] || {};
      companies[id] = { status: st.status || "未投递", starred: !!st.starred, note: st.note || "" };
      migrated++;
    }
  });
  // 模拟 app.js migrateV1：迁移结果合并 defaultState（全量默认 + 迁移覆盖）
  const merged = {};
  COMPANIES.forEach(c => { merged[c.id] = { status: "未投递", starred: false, note: "" }; });
  Object.assign(merged, companies);
  t("迁移 3/3 条", migrated === 3);
  t("虾皮状态保留", merged.shopee && merged.shopee.status === "已投递" && merged.shopee.starred && merged.shopee.note === "8/5笔试");
  t("讯飞状态保留", merged.iflytek && merged.iflytek.status === "面试中");
  t("大疆状态保留", merged.dji && merged.dji.status === "Offer" && merged.dji.starred);
  t("迁移结果合并默认状态(全公司覆盖)", Object.keys(merged).length === COMPANIES.length);
  t("新公司默认初始化", merged.baidu && merged.baidu.status === "未投递");
})();

// ---------- 4. 同步码编解码（UTF-8 中文安全） ----------
section("同步码编解码");
(function() {
  // 模拟浏览器 escape/unescape 语义（字节级 %XX）
  function unescapeLike(s) { return s.replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))); }
  function escapeLike(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      out += code < 128 ? s[i] : "%" + code.toString(16).toUpperCase().padStart(2, "0");
    }
    return out;
  }
  const enc = (c) => Buffer.from(unescapeLike(encodeURIComponent(JSON.stringify({ v: 2, c }))), "binary").toString("base64");
  const dec = (code) => JSON.parse(decodeURIComponent(escapeLike(Buffer.from(code, "base64").toString("binary"))));

  const state = { shopee: { status: "已投递", starred: true, note: "中文备注🎉" }, iflytek: { status: "面试中", starred: false, note: "" } };
  const decoded = dec(enc(state));
  t("中文+emoji 往返一致", decoded.v === 2 && decoded.c.shopee.note === "中文备注🎉" && decoded.c.iflytek.status === "面试中");
})();

// ---------- 5. 快照去重（B4） ----------
section("快照去重逻辑");
(function() {
  // 模拟 saveState 的去重判断
  let snapshots = [];
  const MAX = 3;
  function pushSnapshot(raw) {
    const last = snapshots[snapshots.length - 1];
    if (!last || last.raw !== raw) {
      snapshots.push({ time: Date.now(), raw, data: JSON.parse(raw) });
      snapshots = snapshots.slice(-MAX);
    }
  }
  pushSnapshot("{\"v\":1}"); pushSnapshot("{\"v\":1}"); pushSnapshot("{\"v\":2}"); pushSnapshot("{\"v\":2}"); pushSnapshot("{\"v\":3}");
  t("连续相同状态只存一份", snapshots.length === 3);
  t("保留最新 3 份", snapshots[0].raw === "{\"v\":1}" && snapshots[2].raw === "{\"v\":3}");
})();

// ---------- v7.4 修复回归（jsArg 转义 / 采纳防回退 / 二维码瘦身） ----------
section("v7.4 安全与合并修复");

t("jsArg 已提取", typeof jsArg === "function");
t("shouldAdoptStatus 已提取", typeof shouldAdoptStatus === "function");
t("buildSlimCompanies 已提取", typeof buildSlimCompanies === "function");

if (jsArg) {
  // 关键性质：HTML 属性解码后必须是合法 JS 字符串字面量（\' 保留、\\ 保留、换行变 \n）
  t("jsArg: 单引号 → \\&#39; (解码后为 \\')", jsArg("it's") === "it\\&#39;s");
  t("jsArg: 反斜杠加倍", jsArg("a\\b") === "a\\\\b");
  t("jsArg: 换行转义", jsArg("a\nb") === "a\\nb");
  t("jsArg: 中文/常规字符不变", jsArg("百度-算法岗") === "百度-算法岗");
}

if (shouldAdoptStatus) {
  t("采纳: 无旧状态允许", shouldAdoptStatus(null, "笔试中") === true);
  t("采纳: 前进允许", shouldAdoptStatus("笔试中", "面试中") === true);
  t("采纳: 同级允许(刷新时间戳)", shouldAdoptStatus("面试中", "面试中") === true);
  t("采纳: 回退拒绝", shouldAdoptStatus("面试中", "笔试中") === false);
  t("采纳: Offer 不被覆盖", shouldAdoptStatus("Offer", "面试中") === false);
  t("采纳: 拒信终态放行(非回退)", shouldAdoptStatus("已投递", "已拒绝") === true && shouldAdoptStatus("面试中", "已拒绝") === true);
}

if (buildSlimCompanies) {
  const full = {
    a: { status: "未投递", starred: false, note: "", jobs: {}, history: [] },
    b: { status: "面试中", starred: false, note: "", jobs: { "算法岗": "面试中" }, history: [], lastUpdate: 1 },
    c: { status: "未投递", starred: true, note: "", jobs: {}, history: [] },
    d: { status: "未投递", starred: false, note: "留意", jobs: {}, history: [] }
  };
  const slim = buildSlimCompanies(full);
  t("瘦身: 全默认公司被剔除", !slim.a);
  t("瘦身: 有进度/收藏/备注的保留", !!(slim.b && slim.c && slim.d));
  t("瘦身: 空输入不炸", Object.keys(buildSlimCompanies(null)).length === 0);
}

// ---------- dynamics.json schema + 隐私规则（CI 门禁，防外部工具写入违规字段） ----------
section("dynamics.json 邮件动态校验");
(function() {
  let dyn;
  try { dyn = JSON.parse(fs.readFileSync(path.join(ROOT, "dynamics.json"), "utf8")); }
  catch(e) { t("dynamics.json 可解析", false, e.message); return; }
  const items = dyn.items || [];
  const TYPES = ["offer", "written", "interview", "deadline", "reject", "evaluation", "other"];
  const SS = ["未投递", "已投递", "笔试中", "面试中", "Offer", "已拒绝"];
  const knownIds = new Set(COMPANIES.map(c => c.id));
  t("dynamics: items 为数组且非空", Array.isArray(items) && items.length > 0);
  t("dynamics: id 唯一", new Set(items.map(i => i.id)).size === items.length);
  t("dynamics: 必填字段齐全(id/type/company/time)", items.every(i => i.id && i.type && i.company && i.time));
  t("dynamics: type 在白名单", items.every(i => TYPES.includes(i.type)),
    items.filter(i => !TYPES.includes(i.type)).map(i => i.id).join(","));
  t("dynamics: companyId 为 null 或存在于 data.js", items.every(i => !i.companyId || knownIds.has(i.companyId)),
    items.filter(i => i.companyId && !knownIds.has(i.companyId)).map(i => i.companyId).join(","));
  t("dynamics: time 可解析", items.every(i => !isNaN(new Date(i.time))));
  t("dynamics: dueDate 格式合法(如有)", items.every(i => !i.dueDate || /^\d{4}-\d{2}-\d{2}$/.test(i.dueDate)));
  t("dynamics: eventTime 可解析(如有)", items.every(i => !i.eventTime || !isNaN(new Date(i.eventTime))));
  t("dynamics: suggestStatus 合法(如有)", items.every(i => !i.suggestStatus || SS.includes(i.suggestStatus)));
  // 隐私规则（README 明文约定，仓库公开部署）：链接/附件一律不入库
  t("隐私: link 一律为空", items.every(i => !i.link), items.filter(i => i.link).map(i => i.id).join(","));
  t("隐私: actionUrl 一律为空", items.every(i => !i.actionUrl), items.filter(i => i.actionUrl).map(i => i.id).join(","));
  t("隐私: 无附件字段", items.every(i => !i.attachment && !i.attachments));
})();

// ---------- v7.5 官网清单 + 爬虫候选池 ----------
section("v7.5 official-sites / discovered 候选池");

const normalizeCompanyName = extractFn("normalizeCompanyName");
const discoveredToCompany = extractFn("discoveredToCompany");

// 官网固定清单（official-sites.js）
let OFFICIAL_SITES = null;
try {
  require(path.join(ROOT, "official-sites.js"));
  OFFICIAL_SITES = window.OFFICIAL_SITES;
} catch(e) { /* 下方断言会报 */ }
t("OFFICIAL_SITES 已加载", OFFICIAL_SITES && typeof OFFICIAL_SITES === "object");
if (OFFICIAL_SITES) {
  const entries = Object.entries(OFFICIAL_SITES);
  const knownIds = new Set(COMPANIES.map(c => c.id));
  t("官网清单: 覆盖 ≥ 70 家", entries.length >= 70, "当前 " + entries.length);
  t("官网清单: id 都存在于 data.js", entries.every(([id]) => knownIds.has(id)),
    entries.filter(([id]) => !knownIds.has(id)).map(([id]) => id).join(","));
  t("官网清单: URL 均为 http/https", entries.every(([, u]) => /^https?:\/\//i.test(u)));
  t("官网清单: 不含内推/追踪参数", entries.every(([, u]) =>
    !/recommendCode|shareId|shareSource|inviter_code|pushCode|referralCode|external_referral_code|campusShareCode|acotycoCode|introduceId/i.test(u)),
    entries.filter(([, u]) => /recommendCode|shareId|inviter_code|pushCode|referralCode|campusShareCode|acotycoCode/i.test(u)).map(([id]) => id).join(","));
}

// 爬虫候选池 discovered.json schema
(function() {
  let disc;
  try { disc = JSON.parse(fs.readFileSync(path.join(ROOT, "discovered.json"), "utf8")); }
  catch(e) { t("discovered.json 可解析", false, e.message); return; }
  t("discovered: schemaVersion = 2", disc.schemaVersion === 2);
  const items = disc.items || [];
  t("discovered: items 为数组", Array.isArray(items));
  if (!items.length) return;
  const knownIds = new Set(COMPANIES.map(c => c.id));
  const knownNames = new Set(COMPANIES.map(c => normalizeCompanyName(c.name)));
  t("discovered: 必填字段齐全(id/name/source/foundAt)", items.every(i => i.id && i.name && i.source && i.foundAt));
  t("discovered: id 格式合法", items.every(i => /^[a-z0-9-]+$/.test(i.id)));
  t("discovered: id 唯一", new Set(items.map(i => i.id)).size === items.length);
  t("discovered: 与 data.js 无 id 撞车", items.every(i => !knownIds.has(i.id)),
    items.filter(i => knownIds.has(i.id)).map(i => i.id).join(","));
  t("discovered: 与 data.js 无公司名撞车(归一化)", items.every(i => !knownNames.has(normalizeCompanyName(i.name))),
    items.filter(i => knownNames.has(normalizeCompanyName(i.name))).map(i => i.name).join(","));
  t("discovered: officialLink 为 http/https(如有)", items.every(i => !i.officialLink || /^https?:\/\//i.test(i.officialLink)));
  // v8.1: 跨文件查重——校招池入口不得与内推清单官网重复（防灵犀互娱式同公司两份跟踪）
  if (OFFICIAL_SITES) {
    const siteUrls = new Set(Object.values(OFFICIAL_SITES));
    t("discovered: 官网入口不与内推清单重复", items.every(i => !i.officialLink || !siteUrls.has(i.officialLink)),
      items.filter(i => i.officialLink && siteUrls.has(i.officialLink)).map(i => i.id).join(","));
  }
  t("discovered: deadline 格式合法(如有)", items.every(i => !i.deadline || /^\d{4}-\d{2}-\d{2}$/.test(i.deadline)));
  // v8.2: taxonomy 合法性——行业在 INDUSTRY_GROUPS 词表内，性质在 NATURES 内
  const VALID_IND = new Set(Object.values(window.INDUSTRY_GROUPS || {}).flat());
  const VALID_NAT = new Set(window.NATURES || []);
  t("discovered: 行业全部在词表内", items.every(i => Array.isArray(i.category) && i.category.length >= 1 && i.category.every(k => VALID_IND.has(k))),
    items.filter(i => !Array.isArray(i.category) || !i.category.every(k => VALID_IND.has(k))).map(i => i.id).join(","));
  t("discovered: 性质全部合法", items.every(i => VALID_NAT.has(i.nature)),
    items.filter(i => !VALID_NAT.has(i.nature)).map(i => i.id).join(","));
  // v8.2: 跨来源碎片化检测——同一行业值在内推+校招池合计至少 2 家（防一次性发明分类）
  const freqAll = {};
  COMPANIES.forEach(c => c.category.forEach(k => { if (k !== "活动") freqAll[k] = (freqAll[k] || 0) + 1; }));
  items.forEach(i => (i.category || []).forEach(k => { freqAll[k] = (freqAll[k] || 0) + 1; }));
  t("跨来源无碎片化行业(合计≥2家)", Object.keys(freqAll).every(k => freqAll[k] >= 2), JSON.stringify(freqAll));
  t("discovered: quota 为正整数(如有)", items.every(i => !i.quota || (Number.isInteger(i.quota) && i.quota > 0)),
    items.filter(i => i.quota && !(Number.isInteger(i.quota) && i.quota > 0)).map(i => i.id).join(","));
  t("discovered: parent 指向已存在的条目(如有)", items.every(i => !i.parent || items.some(p => p.id === i.parent)),
    items.filter(i => i.parent && !items.some(p => p.id === i.parent)).map(i => i.id).join(","));
  t("隐私: 不含邮件相关字段", items.every(i => !i.mailId && !i.email && !i.subject));
})();

// 纯函数
if (normalizeCompanyName) {
  t("名归一化: 大小写/空格/括号不敏感", normalizeCompanyName("字节跳动") === normalizeCompanyName("字节跳动 ")
    && normalizeCompanyName("Shopee虾皮") === normalizeCompanyName("shopee虾皮"));
  t("名归一化: 公司后缀剥离", normalizeCompanyName("某某科技有限公司") === normalizeCompanyName("某某科技"));
}
if (discoveredToCompany) {
  const dc = discoveredToCompany({ id: "x-corp", name: "某公司", officialLink: "https://x.com/campus", jobs: "算法、测试", location: "北京", deadline: "2026-10-01", source: "nowcoder" });
  t("候选映射: 基本字段", dc.id === "x-corp" && dc.discovered === true && dc.link === "https://x.com/campus" && dc.category[0] === "新发现");
  t("候选映射: jobs 文本拆分数组", Array.isArray(dc.jobs) && dc.jobs.length === 2);
  t("候选映射: 缺省字段兜底", discoveredToCompany({ id: "y", name: "y" }).jobs.length === 0 && discoveredToCompany({ id: "y", name: "y" }).deadline === null);
  t("候选映射: parent/quota 透传", (() => { const g = discoveredToCompany({ id: "z", name: "z", parent: "alibaba", quota: 2 }); return g.parent === "alibaba" && g.quota === 2; })());
  t("候选映射: nature 透传/缺省兜底", (() => { const g = discoveredToCompany({ id: "w", name: "w", nature: "央企" }); const h = discoveredToCompany({ id: "v", name: "v" }); return g.nature === "央企" && h.nature === ""; })());
}

// v7.7: 来源分页（内推 / 校招池）
const filterBySource = extractFn("filterBySource");
if (filterBySource) {
  const list = [{ id: "a" }, { id: "b", discovered: true }, { id: "c", discovered: true }];
  t("来源过滤: 内推只剩非 discovered", filterBySource(list, "referral").map(c => c.id).join(",") === "a");
  t("来源过滤: 校招池只剩 discovered", filterBySource(list, "pool").map(c => c.id).join(",") === "b,c");
  t("来源过滤: 全集无 discovered 时校招池为空", filterBySource([{ id: "x" }], "pool").length === 0);
}

// v8.1: debounce 必须透传事件参数（丢参曾导致搜索框输入必抛 TypeError）
t("debounce: 事件参数透传", /function\s+debounce[\s\S]*?fn\.apply\(this,\s*args\)/.test(appJs));

// ---------- 6. 缓存戳一致性（防止发版忘改 ?v= 导致用户拿到旧缓存） ----------
section("index.html 缓存戳一致性");
(function() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const refs = [...html.matchAll(/(?:src|href)="(style\.css|data\.js|official-sites\.js|js\/[\w-]+\.js)\?v=([\w.]+)"/g)];
  t("本地资源均带缓存戳", refs.length >= 8, "实际 " + refs.length + " 处");
  const versions = new Set(refs.map(m => m[2]));
  t("缓存戳版本号统一", versions.size === 1, versions.size > 1 ? "不一致: " + [...versions].join(", ") : "");
  // v7.3 结构检查
  t("待办视图入口存在", html.includes('id="todoViewBtn"') && html.includes('id="todoView"'));
  t("来源分页 tab 存在", html.includes('id="tabReferral"') && html.includes('id="tabPool"') && html.includes('id="listViewToggle"'));
  t("筛选面板分区默认收起", (html.match(/class="fp-sec collapsed"/g) || []).length === 4 && html.includes('id="fpNat"'));
  t("导航行结构存在", html.includes('class="nav-row"'));
  // v8.3: 移动端 tab 防重叠修复必须保留（44px 规则曾致 min-width 压缩重叠）
  const css8 = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");
  t("移动端 tab 禁止压缩(flex:0 0 auto)", /\.source-tabs button\s*\{[^}]*flex:\s*0 0 auto/.test(css8));
  // v8.0: 安全——脚本全部本地化，禁止任何第三方脚本源（防 CDN 劫持跳转赌博站）
  t("无第三方脚本源", !/<script[^>]+src="https?:/i.test(html),
    (html.match(/<script[^>]+src="https?:[^"]*/gi) || []).join(","));
  const jsAll = ["js/core.js", "js/views.js", "js/features.js", "js/export-sync.js", "js/main.js"]
    .map(f => { try { return fs.readFileSync(path.join(ROOT, f), "utf8"); } catch(e) { return ""; } }).join("\n");
  t("动态加载脚本不走外部 URL", !/loadScript\(\s*["']https?:/.test(jsAll));
  t("待办横带容器存在", html.includes('id="todoBar"'));
  t("看板已移除", !html.includes("kanban"));
  t("隐藏已截止开关存在", html.includes('id="hideExpiredCb"'));
  t("进度历史容器存在", html.includes('id="jobModalHistory"'));
})();

// ---------- v8.6 账号系统（Supabase GoTrue + RLS 隔离） ----------
section("v8.6 账号与云同步");
const isHttpsUrl = extractFn("isHttpsUrl");
const sbErrorMessage = extractFn("sbErrorMessage");
const validateCredential = extractFn("validateCredential");
const parseAuthResponse = extractFn("parseAuthResponse");

t("isHttpsUrl 已提取", typeof isHttpsUrl === "function");
if (isHttpsUrl) {
  t("https 通过", isHttpsUrl("https://abc.supabase.co") === true);
  t("http/空值拒绝", isHttpsUrl("http://abc.supabase.co") === false && isHttpsUrl("") === false && isHttpsUrl(null) === false);
}
t("sbErrorMessage 已提取", typeof sbErrorMessage === "function");
if (sbErrorMessage) {
  t("无效凭据 → 密码错误", sbErrorMessage({ error: "invalid_grant", error_description: "Invalid login credentials" }) === "邮箱或密码错误");
  t("已注册提示", sbErrorMessage({ msg: "User already registered" }) === "该邮箱已注册，请直接登录");
  t("邮箱未验证提示", /邮箱未验证/.test(sbErrorMessage({ error: "email_not_confirmed", msg: "Email not confirmed" })));
  t("表不存在提示", /建表 SQL/.test(sbErrorMessage({ code: "42P01", message: "relation does not exist" })));
  t("RLS 拒绝提示", /RLS/.test(sbErrorMessage({ code: "42501", message: "row-level security policy violation" })));
  t("未知错误回退 fallback", sbErrorMessage({ code: "xxx" }, "自定义") === "自定义");
}
t("validateCredential 已提取", typeof validateCredential === "function");
if (validateCredential) {
  t("合法邮箱+密码通过", validateCredential("a@qq.com", "abc123") === null);
  t("非邮箱拒绝", /邮箱/.test(validateCredential("jason", "abc123")));
  t("邮箱含空格拒绝", /邮箱/.test(validateCredential("a b@qq.com", "abc123")));
  t("密码过短拒绝", /6 位/.test(validateCredential("a@qq.com", "abc")));
}
t("parseAuthResponse 已提取", typeof parseAuthResponse === "function");
if (parseAuthResponse) {
  const s = parseAuthResponse({ access_token: "tok", refresh_token: "ref", expires_in: 3600, user: { id: "u1", email: "a@qq.com" } }, "a@qq.com");
  t("会话解析: 字段齐全", s && s.uid === "u1" && s.accessToken === "tok" && s.refreshToken === "ref" && s.email === "a@qq.com" && s.expiresAt > Date.now());
  t("会话解析: 无 session 返回 null", parseAuthResponse({ user: { id: "u1" } }, "a@qq.com") === null);
}
// 结构检查：弹窗账号区 + Supabase 凭据折叠 + 样式 + 旧 LeanCloud 残留清零
(function() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");
  const src = fs.readFileSync(path.join(ROOT, "js", "export-sync.js"), "utf8");
  t("弹窗账号区存在", html.includes('id="cloudAccount"'));
  t("Supabase 凭据折叠为高级选项", /<details class="cloud-adv">/.test(html) && html.includes('id="cloudUrl"') && html.includes('id="cloudAnonKey"'));
  t("旧 LeanCloud 输入框已移除", !html.includes("cloudAppId") && !html.includes("cloudServer"));
  t("账号样式存在", css.includes(".cloud-logged") && css.includes(".cloud-adv"));
  t("内置凭据位存在", appJs.includes("BUILTIN_CLOUD"));
  t("内置凭据已填写", /BUILTIN_CLOUD\s*=\s*\{\s*url:\s*"https:\/\/[\w-]+\.supabase\.co",\s*anonKey:\s*"eyJ/.test(src));
  t("LeanCloud 接口残留清零", !/X-LC-|\/1\.1\/(classes|login|users)/.test(src));
  // 密码不落盘：saveAuth 的存储值只允许 uid/email/accessToken/refreshToken/expiresAt
  t("密码不落盘", /setItem\(AUTH_KEY,\s*JSON\.stringify\(\{\s*uid:\s*a\.uid,\s*email:\s*a\.email,\s*accessToken:\s*a\.accessToken,\s*refreshToken:\s*a\.refreshToken,\s*expiresAt:\s*a\.expiresAt\s*\}\)\)/.test(src));
  // 数据隔离由服务端 RLS 强制：不再依赖客户端拼 ACL/where
  t("客户端不再自拼 ACL", !src.includes("buildUserACL") && !src.includes("buildOwnerWhere"));
  t("未登录不上传", /async function cloudPush\(\) \{[\s\S]*?if \(!getAuth\(\)\) return;/.test(src));
})();

// ---------- v8.9 themeBtn 全页护盾修复 + 同步码入口收编 ----------
section("v8.9 指针事件与入口收敛");
(function() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");
  // 回归：#themeBtn::after 是 absolute inset:0，若按钮无 position:relative 会铺开成全页隐形护盾
  // （曾截获全页面指针事件，邮件动态条 hover 每秒翻转十余次）
  t("themeBtn 伪元素限定在按钮内(position:relative)", /#themeBtn\s*\{[^}]*position:\s*relative/.test(css));
  // 无定位祖先的 absolute inset:0 伪元素全局扫描：不允许再出现同类问题
  // （豁免：pointer-events:none 不截获事件 / position:fixed 本就设计为全页背景）
  t("无其他失控的 inset:0 伪元素", (() => {
    const bad = [...css.matchAll(/([\w#.:-]+)::(after|before)\s*\{([^}]*)inset:\s*0([^}]*)\}/g)]
      .filter(m => {
        const body = m[3] + m[4];
        if (/pointer-events:\s*none/.test(body)) return false;
        if (/position:\s*fixed/.test(body)) return false;
        const sel = m[1];
        const rule = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}", "g");
        const base = [...css.matchAll(rule)].find(r => !r[0].includes("::"));
        return !(base && /position:\s*relative/.test(base[1]));
      });
    return bad.length === 0;
  })());
  // 入口收敛：顶部不再有独立 📱 按钮，同步码收进云同步弹窗的备用折叠区
  t("顶部已移除独立同步码按钮", !/<button[^>]*>📱<\/button>/.test(html));
  t("云弹窗含无账号同步备用区", html.includes("无账号同步（备用）") && (html.match(/openSyncModal\('/g) || []).length === 2);
})();

// ---------- 结果 ----------
console.log("\n══════════════════════════════");
console.log("  结果: " + pass + " 通过 / " + fail + " 失败");
console.log("══════════════════════════════");
if (fail > 0) {
  console.log("\n失败项:");
  failures.forEach(f => console.log("  ✗ " + f));
  process.exit(1);
}
