/* ============================================================
 * qiuzhao-tracker · 核心层：全局数据·校验·工具·筛选纯函数·用户状态层 v3
 * 由 app.js v6.0 重构拆分（勿手工编辑此说明）
 * ============================================================ */

// ============================================================
// 全局变量
// ============================================================
const COMPANIES = window.COMPANIES || [];
const DATA_VERSION = window.DATA_VERSION || 1;
document.getElementById("dataVer").textContent = DATA_VERSION;

const STATE_KEY = "qiuzhao2027.state.v2";
const SNAPSHOT_KEY = "qiuzhao2027.snapshots";
const THEME_KEY = "qiuzhao2027.theme";
const MAX_SNAPSHOTS = 3; // 快照瘦身：去重后保留最近 3 份

const STATUS_OPTIONS = ["未投递", "已投递", "笔试中", "面试中", "Offer", "已拒绝"];
const ACTIVE_STATUSES = ["已投递", "笔试中", "面试中"];
const DONE_STATUSES = ["Offer", "已拒绝"];
const TYPE_ORDER = { "技术提前批": 0, "提前批": 1, "秋招": 2, "活动": 3 };

// 公司 ID 索引（O(1) 查找，避免 importJSON/mergeSync 里的 O(n×m) 全表扫描）
const COMPANY_IDS = new Set(COMPANIES.map(c => c.id));

// ============================================================
// 数据完整性校验（启动时执行，字段拼错立即暴露而非静默失败）
// ============================================================
function validateCompanies() {
  const errors = [];
  const REQUIRED = ["id", "name", "type", "jobs"];
  const VALID_TYPES = ["秋招", "提前批", "技术提前批", "活动"];

  COMPANIES.forEach((c, i) => {
    if (!c || typeof c !== "object") { errors.push(`[${i}] 条目不是对象`); return; }
    REQUIRED.forEach(f => {
      if (c[f] === undefined || c[f] === null || c[f] === "") errors.push(`[${i}] ${c.name || "?"} 缺少字段 ${f}`);
    });
    if (c.jobs && !Array.isArray(c.jobs)) errors.push(`[${i}] ${c.name} 的 jobs 不是数组`);
    if (c.type && !VALID_TYPES.includes(c.type)) errors.push(`[${i}] ${c.name} 非法 type: ${c.type}`);
    if (c.id && !/^[a-z0-9-]+$/.test(c.id)) errors.push(`[${i}] ${c.name} 非法 id(仅小写字母/数字/连字符): ${c.id}`);
  });

  const ids = COMPANIES.map(c => c.id);
  const dupIds = ids.filter((id, idx) => ids.indexOf(id) !== idx);
  if (dupIds.length) errors.push(`重复 id: ${[...new Set(dupIds)].join(", ")}`);

  if (errors.length) {
    console.error("⚠️ 数据校验失败：", errors);
    const banner = document.createElement("div");
    banner.style.cssText = "position:fixed;bottom:0;left:0;right:0;background:#fb7185;color:#fff;padding:10px 16px;font-size:12px;z-index:9999;text-align:center";
    banner.textContent = `⚠️ 数据校验失败 ${errors.length} 项（详见控制台）— ${errors[0]}`;
    document.body.appendChild(banner);
  }
  return errors.length === 0;
}

// v5: 多条件筛选状态（同维 OR / 跨维 AND）
const filters = {
  status: new Set(),      // 状态多选：未投递/已投递/笔试中/面试中/Offer/已拒绝
  starred: false,          // 收藏开关
  locations: new Set(),    // 城市多选
  industries: new Set(),   // 行业多选
  jobs: new Set(),         // 岗位多选
  keyword: "",             // 搜索词（空格分词 AND）
  hideExpired: true        // v7.2: 隐藏已截止且未投递的公司（默认开）
};

let currentSort = { field: null, asc: true };
let currentView = (window.innerWidth <= 768) ? "card" : "table";
let currentSource = "referral";  // v7.7: 来源分页 referral=内推(data.js) / pool=校招池(discovered.json)
let preferredListView = currentView;  // v7.7: 从待办切回列表时恢复表格/卡片（初始跟随当前视图）
let userState = null;

// ============================================================
// 工具函数
// ============================================================
function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// inline onclick 字符串参数专用（v7.4）：先做 JS 字符串字面量转义（\' \\ \n），再做 HTML 属性转义。
// 只用 escapeHtml 的话，&#39; 会在属性解码时还原为 '，提前闭合 onclick 里的 JS 字符串。
function jsArg(s) {
  const js = String(s == null ? "" : s)
    .replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r/g, "").replace(/\n/g, "\\n");
  return escapeHtml(js);
}

function showToast(msg, duration = 2000) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.setAttribute("aria-live", "polite");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

function debounce(fn, ms) {
  let timer;
  return function() {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

// ============================================================
// v5 筛选纯函数（可测试）
// ============================================================

// 关键词分词：空格分隔，过滤空词（v5 搜索 AND 匹配基础）
function splitKeywords(kw) {
  return String(kw || "").toLowerCase().split(/\s+/).filter(Boolean);
}

// 岗位词提取：取出现 ≥ min 次的岗位名（去重、按频次排序）
function extractJobKeywords(companies, min = 2) {
  const freq = {};
  companies.forEach(c => (c.jobs || []).forEach(j => { freq[j] = (freq[j] || 0) + 1; }));
  return Object.keys(freq)
    .filter(j => freq[j] >= min)
    .sort((a, b) => (freq[b] || 0) - (freq[a] || 0) || a.localeCompare(b, "zh-CN"));
}

// 多条件匹配：同维 OR（Set 任意命中）、跨维 AND（每维都满足）
function matchFilters(c, f, getSt) {
  const s = getSt(c.id);
  if (f.starred && !s.starred) return false;
  if (f.status.size && !f.status.has(s.status)) return false;
  // v7.2: 已截止且未投递的公司默认隐藏（已投递/进行中的不受影响，避免漏跟进）
  if (f.hideExpired && s.status === "未投递" && c.deadline) {
    const dl = parseLocalDate(c.deadline);
    if (dl) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      dl.setHours(0, 0, 0, 0);
      if (dl < today) return false;
    }
  }
  if (f.locations.size && !(c.location || "").split("/").some(l => f.locations.has(l.trim()))) return false;
  if (f.industries.size && !c.category.some(cat => f.industries.has(cat))) return false;
  // v6: 岗位筛选匹配 公司招聘岗位 OR 已投递岗位
  if (f.jobs.size) {
    const applied = Object.keys(s.jobs || {});
    const matchRecruit = c.jobs.some(j => [...f.jobs].some(k => j.includes(k)));
    const matchApplied = applied.some(j => [...f.jobs].some(k => j.includes(k)));
    if (!matchRecruit && !matchApplied) return false;
  }
  if (f.keyword) {
    const words = splitKeywords(f.keyword);
    const haystack = `${c.name} ${c.jobs.join(" ")} ${c.location} ${c.category.join(" ")} ${c.note} ${c.refCode || ""} ${c.program || ""} ${Object.keys(s.jobs || {}).join(" ")}`.toLowerCase();
    if (!words.every(w => haystack.includes(w))) return false;  // 空格分词 AND
  }
  return true;
}

// 搜索命中高亮（先转义再包 <mark>，防 XSS）
function highlightText(text, keyword) {
  if (text == null) return "";
  let out = escapeHtml(text);
  if (!keyword) return out;
  splitKeywords(keyword).forEach(w => {
    if (!w) return;
    const re = new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    out = out.replace(re, "<mark class=\"hl\">$1</mark>");
  });
  return out;
}

// 链接协议白名单：只允许 http/https，防止 javascript: 等伪协议注入
function safeLink(url) {
  return /^https?:\/\//i.test(url || "") ? url : "#";
}

// ============================================================
// v7.5: 爬虫发现公司候选池（discovered.json）纯函数
// ============================================================
// 公司名归一化（纯函数可测）：用于 discovered 与 data.js 的去重比对
function normalizeCompanyName(name) {
  return String(name || "").toLowerCase()
    .replace(/[\s（）()·\-—_]/g, "")
    .replace(/(股份|有限|公司|集团)+$/g, "");
}

// 爬虫发现的公司 → 站点公司对象（纯函数可测）：discovered 标记驱动 UI 的 🆕 徽章
function discoveredToCompany(it) {
  const jobs = Array.isArray(it.jobs)
    ? it.jobs
    : String(it.jobs || "").split(/[、,，/;；]/).map(s => s.trim()).filter(Boolean);
  return {
    id: it.id,
    name: it.name,
    type: "秋招",
    program: it.program || "",
    category: ["新发现"].concat(Array.isArray(it.category) ? it.category : []),
    jobs: jobs.slice(0, 8),
    location: it.location || "",
    refCode: null,
    link: it.officialLink || "",
    note: it.note || "",
    deadline: it.deadline || null,
    parent: it.parent || null,
    quota: it.quota || null,
    discovered: true
  };
}

// v7.7: 来源分页过滤（纯函数可测）：referral=内推清单 / pool=校招池（discovered 标记驱动）
function filterBySource(list, source) {
  return list.filter(c => (source === "pool") === !!c.discovered);
}

// CSV 公式注入防护：以 = + - @ 开头的字段加前缀，防止 Excel 执行公式
function csvSafe(f) {
  let s = String(f == null ? "" : f);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

// 本地时区解析日期（避免 new Date("YYYY-MM-DD") 按 UTC 解析导致差一天）
function parseLocalDate(str) {
  const parts = String(str).split("-").map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

// ============================================================
// 用户状态层 v2.1 —— 防破坏核心
// 结构: { version: 2, companies: { <id>: {status, starred, note, lastUpdate} } }
// v2.1 新增: lastUpdate 时间戳（状态变更时间，供周报/统计用；老数据为 null，向后兼容）
// ============================================================
function defaultState() {
  const companies = {};
  COMPANIES.forEach(c => {
    companies[c.id] = { status: "未投递", starred: false, note: "", lastUpdate: null, jobs: {}, history: [] };
  });
  return { version: 3, companies };
}

// ============================================================
// v6: 岗位级投递状态（一个公司投多个岗位，各自独立进度）
// ============================================================
const JOB_STATUS_RANK = { "Offer": 6, "面试中": 5, "笔试中": 4, "已投递": 3, "已拒绝": 2, "未投递": 1 };

// 公司总状态聚合（纯函数可测）：无岗位回退 fallback；有岗位取最高优先级
function deriveCompanyStatus(jobsMap, fallback) {
  const vals = Object.values(jobsMap || {});
  if (vals.length === 0) return fallback || "未投递";
  let best = "未投递";
  vals.forEach(v => {
    if ((JOB_STATUS_RANK[v] || 0) > (JOB_STATUS_RANK[best] || 0)) best = v;
  });
  return best;
}

// v7.4: 采纳邮件状态时的回退防护（纯函数可测）：进度只前进/同级更新，不回退
function shouldAdoptStatus(prev, next) {
  if (!prev) return true;
  return (JOB_STATUS_RANK[next] || 0) >= (JOB_STATUS_RANK[prev] || 0);
}

// v2 → v3 无损迁移（纯函数可测）：老状态保留，补 jobs 空映射
function upgradeToV3(state) {
  const v = { version: 3, companies: {} };
  Object.keys(state.companies || {}).forEach(id => {
    const st = state.companies[id] || {};
    v.companies[id] = {
      status: st.status || "未投递",
      starred: !!st.starred,
      note: st.note || "",
      lastUpdate: st.lastUpdate === undefined ? null : st.lastUpdate,
      jobs: st.jobs && typeof st.jobs === "object" ? st.jobs : {},
      history: Array.isArray(st.history) ? st.history : []
    };
  });
  return v;
}

function loadState() {
  let raw = null;
  try { raw = localStorage.getItem(STATE_KEY); } catch(e) {}

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // v3 格式直接使用
      if (parsed && parsed.version === 3 && parsed.companies) {
        return parsed;
      }
      // v2 格式 → v3 迁移（补 jobs 映射，老数据无损）
      if (parsed && parsed.version === 2 && parsed.companies) {
        return upgradeToV3(parsed);
      }
      // 旧格式（v1：无 version 字段，companies 以公司名为 key）→ 自动迁移
      if (parsed && parsed.companies && typeof parsed.companies === "object") {
        return upgradeToV3(migrateV1(parsed));
      }
      // 更旧的格式（直接 {name: {status...}} 无 companies 包裹）
      if (parsed && typeof parsed === "object" && !parsed.companies && !parsed.version) {
        return upgradeToV3(migrateBare(parsed));
      }
    } catch(e) {
      console.warn("状态数据损坏，尝试回滚快照", e);
    }
  }

  // 主数据损坏/缺失 → 尝试快照回滚
  const snapshots = readSnapshots();
  if (snapshots.length > 0) {
    const newest = snapshots[snapshots.length - 1];
    if (newest && newest.data && newest.data.companies) {
      showToast("⚠️ 状态已从最近备份自动恢复");
      return upgradeToV3(newest.data);
    }
  }
  return defaultState();
}

// v1 迁移：旧格式 { version:1 或 无, companies: { "公司名": {status, starred, note} } }
function migrateV1(old) {
  const nameToId = {};
  COMPANIES.forEach(c => { nameToId[c.name] = c.id; });
  const companies = {};
  let migrated = 0;
  Object.keys(old.companies).forEach(name => {
    const id = nameToId[name];
    if (id) {
      const st = old.companies[name] || {};
      companies[id] = { status: st.status || "未投递", starred: !!st.starred, note: st.note || "" };
      migrated++;
    }
  });
  const state = { version: 2, companies };
  // 用迁移结果合并默认状态（保证新公司有默认值）
  const merged = defaultState();
  Object.assign(merged.companies, companies);
  if (migrated > 0) showToast("✅ 已自动迁移你的历史状态");
  return merged;
}

// 裸格式迁移：{ "公司名": {status...} }
function migrateBare(old) {
  const nameToId = {};
  COMPANIES.forEach(c => { nameToId[c.name] = c.id; });
  const companies = {};
  Object.keys(old).forEach(name => {
    const id = nameToId[name];
    if (id && old[name] && typeof old[name] === "object") {
      companies[id] = { status: old[name].status || "未投递", starred: !!old[name].starred, note: old[name].note || "" };
    }
  });
  const state = { version: 2, companies };
  const merged = defaultState();
  Object.assign(merged.companies, companies);
  return merged;
}

function readSnapshots() {
  try {
    const s = localStorage.getItem(SNAPSHOT_KEY);
    const arr = s ? JSON.parse(s) : [];
    return Array.isArray(arr) ? arr : [];
  } catch(e) { return []; }
}

function saveSnapshots(arr) {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(arr.slice(-MAX_SNAPSHOTS))); } catch(e) {}
}

// 每次保存前自动备份旧状态（与上一份相同的快照跳过，避免连续操作刷屏）
function saveState() {
  try {
    const current = localStorage.getItem(STATE_KEY);
    if (current) {
      const snapshots = readSnapshots();
      const last = snapshots[snapshots.length - 1];
      if (!last || last.raw !== current) {
        snapshots.push({ time: Date.now(), raw: current, data: JSON.parse(current) });
        saveSnapshots(snapshots);
      }
    }
    localStorage.setItem(STATE_KEY, JSON.stringify(userState));
  } catch(e) {
    console.warn("保存失败", e);
    showToast("⚠️ 状态保存失败（存储可能已满），请立即 💾 导出备份", 4000);
  }
  scheduleCloudPush();  // v7: 本地变更后防抖云同步
}

function getState(id) {
  if (!userState.companies[id]) {
    userState.companies[id] = { status: "未投递", starred: false, note: "", lastUpdate: null, jobs: {}, history: [] };
  }
  // 兼容老数据：缺 lastUpdate 字段补 null
  if (userState.companies[id].lastUpdate === undefined) userState.companies[id].lastUpdate = null;
  // v6 兼容：缺 jobs 映射补空对象
  if (userState.companies[id].jobs === undefined) userState.companies[id].jobs = {};
  // v7.2 兼容：缺 history 补空数组
  if (!Array.isArray(userState.companies[id].history)) userState.companies[id].history = [];
  return userState.companies[id];
}

// 记录状态变更时间戳（v2.1）
function touchState(id) {
  getState(id).lastUpdate = Date.now();
}

// v7.2: 进度历史——每次状态/岗位变更追加一条，每公司封顶 50 条
// entry: { job?: 岗位名, from: 原状态|null, to: 新状态|null }
function recordHistory(id, entry) {
  const s = getState(id);
  s.history.push({ time: Date.now(), job: entry.job || null, from: entry.from || null, to: entry.to || null });
  if (s.history.length > 50) s.history = s.history.slice(-50);
}

// ============================================================
// v7.2: UI 偏好持久化（视图/排序/筛选/隐藏已截止，刷新不丢）
// ============================================================
const UI_KEY = "qiuzhao2027.ui";

// 序列化（纯函数可测）：Set → 数组
function serializeUIPrefs(f, sort, view) {
  return JSON.stringify({
    v: 1, view, sort,
    f: {
      status: [...f.status], starred: !!f.starred,
      locations: [...f.locations], industries: [...f.industries], jobs: [...f.jobs],
      keyword: f.keyword || "", hideExpired: f.hideExpired !== false
    }
  });
}

// 反序列化（纯函数可测）：数组 → 数组（交给 loadUIPrefs 组装 Set），非法输入返回 null
function deserializeUIPrefs(json) {
  try {
    const p = JSON.parse(json);
    if (!p || p.v !== 1 || !p.f) return null;
    return {
      view: ["table", "card", "todo"].includes(p.view) ? p.view : null,
      sort: p.sort && typeof p.sort === "object" ? p.sort : { field: null, asc: true },
      f: {
        status: Array.isArray(p.f.status) ? p.f.status : [],
        starred: !!p.f.starred,
        locations: Array.isArray(p.f.locations) ? p.f.locations : [],
        industries: Array.isArray(p.f.industries) ? p.f.industries : [],
        jobs: Array.isArray(p.f.jobs) ? p.f.jobs : [],
        keyword: typeof p.f.keyword === "string" ? p.f.keyword : "",
        hideExpired: p.f.hideExpired !== false
      }
    };
  } catch(e) { return null; }
}

function saveUIPrefs() {
  try { localStorage.setItem(UI_KEY, serializeUIPrefs(filters, currentSort, currentView)); } catch(e) {}
}

// 启动时恢复：视图/排序/筛选/搜索词（移动端未存偏好时仍默认卡片视图）
function loadUIPrefs() {
  let p = null;
  try { p = deserializeUIPrefs(localStorage.getItem(UI_KEY)); } catch(e) {}
  if (!p) return;
  filters.status = new Set(p.f.status);
  filters.starred = p.f.starred;
  filters.locations = new Set(p.f.locations);
  filters.industries = new Set(p.f.industries);
  filters.jobs = new Set(p.f.jobs);
  filters.keyword = p.f.keyword;
  filters.hideExpired = p.f.hideExpired;
  currentSort = p.sort;
  if (p.view) currentView = p.view;
  const input = document.getElementById("searchInput");
  if (input && p.f.keyword) input.value = p.f.keyword;
}
