
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
  keyword: ""              // 搜索词（空格分词 AND）
};

let currentSort = { field: null, asc: true };
let currentView = (window.innerWidth <= 768) ? "card" : "table";
let userState = null;

// ============================================================
// 工具函数
// ============================================================
function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function showToast(msg, duration = 2000) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const t = document.createElement("div");
  t.className = "toast";
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
    companies[c.id] = { status: "未投递", starred: false, note: "", lastUpdate: null, jobs: {} };
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
      jobs: st.jobs && typeof st.jobs === "object" ? st.jobs : {}
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
  }
  scheduleCloudPush();  // v7: 本地变更后防抖云同步
}

function getState(id) {
  if (!userState.companies[id]) {
    userState.companies[id] = { status: "未投递", starred: false, note: "", lastUpdate: null };
  }
  // 兼容老数据：缺 lastUpdate 字段补 null
  if (userState.companies[id].lastUpdate === undefined) userState.companies[id].lastUpdate = null;
  // v6 兼容：缺 jobs 映射补空对象
  if (userState.companies[id].jobs === undefined) userState.companies[id].jobs = {};
  return userState.companies[id];
}

// 记录状态变更时间戳（v2.1）
function touchState(id) {
  getState(id).lastUpdate = Date.now();
}

// ============================================================
// 仪表盘
// ============================================================
function renderDashboard() {
  const stats = { total: 0, applied: 0, test: 0, interview: 0, offer: 0, rejected: 0, starred: 0, pending: 0 };
  COMPANIES.forEach(c => {
    const s = getState(c.id);
    stats.total++;
    if (s.starred) stats.starred++;
    if (s.status === "未投递") stats.pending++;
    if (s.status === "已投递") stats.applied++;
    if (s.status === "笔试中") stats.test++;
    if (s.status === "面试中") stats.interview++;
    if (s.status === "Offer") stats.offer++;
    if (s.status === "已拒绝") stats.rejected++;
  });
  const inProgress = stats.applied + stats.test + stats.interview;

  // v5.3: 仪表盘 = 概览视图（点击查看对应状态/收藏，状态单选切换，不做多选组合）
  const dashCards = [
    { filter: "all", icon: "🏢", num: stats.total, label: "企业总数", cls: "", fn: "viewAll()" },
    { filter: "未投递", icon: "⏳", num: stats.pending, label: "未投递", cls: "", fn: "viewByStatus('未投递')" },
    { filter: "已投递", icon: "📝", num: stats.applied, label: "已投递", cls: "applied", fn: "viewByStatus('已投递')" },
    { filter: "笔试中", icon: "✏️", num: stats.test, label: "笔试中", cls: "test", fn: "viewByStatus('笔试中')" },
    { filter: "面试中", icon: "🎤", num: stats.interview, label: "面试中", cls: "interview", fn: "viewByStatus('面试中')" },
    { filter: "Offer", icon: "🎉", num: stats.offer, label: "Offer", cls: "offer", fn: "viewByStatus('Offer')" },
    { filter: "已拒绝", icon: "🚫", num: stats.rejected, label: "已拒绝", cls: "", fn: "viewByStatus('已拒绝')" },
    { filter: "starred", icon: "⭐", num: stats.starred, label: "已收藏", cls: "", fn: "viewStarred()" }
  ];
  document.getElementById("dashboard").innerHTML = dashCards.map(d =>
    `<div class="dash-card ${d.cls}" data-filter="${d.filter}" role="button" tabindex="0" onclick="${d.fn}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${d.fn}}" title="查看 ${d.label}">
      <div class="dash-icon">${d.icon}</div><div class="dash-num">${d.num}</div><div class="dash-label">${d.label}</div>
    </div>`
  ).join("");
  // 高亮由 refreshFilterUI 统一管理
}

// v5.3: 概览查看——状态单选切换（再点同状态 = 取消回全部）
function viewByStatus(status) {
  if (filters.status.has(status)) filters.status.delete(status);
  else { filters.status.clear(); filters.status.add(status); }
  refreshFilterUI();
  applyFilters();
}

function viewStarred() {
  filters.starred = !filters.starred;
  refreshFilterUI();
  applyFilters();
}

function viewAll() {
  filters.status.clear();
  filters.starred = false;
  refreshFilterUI();
  applyFilters();
}

// ============================================================
// 截止日期
// ============================================================
function getDaysLeft(deadline) {
  if (!deadline) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dl = parseLocalDate(deadline);
  if (!dl) return null;
  dl.setHours(0, 0, 0, 0);
  return Math.round((dl - now) / (1000 * 60 * 60 * 24));
}

function deadlineHTML(deadline) {
  if (!deadline) return "<span class='deadline' style='color:var(--text-muted)'>—</span>";
  const days = getDaysLeft(deadline);
  if (days === null) return "—";
  if (days < 0) return `<span class="deadline past">已截止</span>`;
  if (days === 0) return `<span class="deadline urgent">今天!</span>`;
  if (days <= 3) return `<span class="deadline urgent">⚠️ ${days}天</span>`;
  if (days <= 7) return `<span class="deadline soon">${days}天</span>`;
  return `<span class="deadline">${days}天</span>`;
}

// ============================================================
// 渲染 —— 公共片段（表格/卡片复用，消除重复）
// ============================================================
function buildCommonHTML(c) {
  const s = getState(c.id);
  const statusOptions = STATUS_OPTIONS.map(opt =>
    `<option value="${opt}" ${s.status === opt ? "selected" : ""}>${opt}</option>`
  ).join("");
  const jobTags = c.jobs.map(j => `<span class="job-tag">${highlightText(j, filters.keyword)}</span>`).join("");
  const programTag = c.program ? `<span class="program-tag">${escapeHtml(c.program)}</span>` : "";
  const refHTML = c.refCode
    ? `<span class="ref-code" onclick="copyCode(this,'${c.id}')" title="点击复制">${escapeHtml(c.refCode)}</span>`
    : `<span class="ref-none">链接即内推</span>`;
  return { s, statusOptions, jobTags, programTag, refHTML };
}

// ============================================================
// 渲染 —— 表格视图
// ============================================================
function renderTable(data) {
  const tbody = document.getElementById("tableBody");
  const noResults = document.getElementById("noResults");
  if (data.length === 0) {
    tbody.innerHTML = "";
    noResults.style.display = "block";
    return;
  }
  noResults.style.display = "none";

  tbody.innerHTML = data.map(c => {
    const { s, statusOptions, jobTags, programTag, refHTML } = buildCommonHTML(c);
    const starredClass = s.starred ? "favorited" : "";
    const starIcon = s.starred ? "⭐" : "☆";

    return `
    <tr class="${starredClass}">
      <td><button class="star-btn ${s.starred ? "active" : ""}" onclick="toggleStar('${c.id}')" data-star-id="${c.id}" aria-pressed="${s.starred}" aria-label="收藏 ${escapeHtml(c.name)}">${starIcon}</button></td>
      <td><strong>${highlightText(c.name, filters.keyword)}</strong></td>
      <td><span class="type-tag ${escapeHtml(c.type)}">${escapeHtml(c.type)}</span>${programTag}</td>
      <td><div class="job-tags">${jobTags}</div></td>
      <td class="location">${highlightText(c.location, filters.keyword) || "—"}</td>
      <td>${deadlineHTML(c.deadline)}</td>
      <td>${refHTML}</td>
      <td>
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
          ${c.link ? `<a href="${safeLink(c.link)}" target="_blank" rel="noopener" class="link-btn">投递</a>` : ""}
          <button class="copy-mini" onclick="copyCompany(this,'${c.id}')" title="复制整条投递信息" aria-label="复制整条信息">📋</button>
        </div>
      </td>
      <td>
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
          <select class="status-select" data-status="${escapeHtml(s.status)}" aria-label="投递状态" onchange="setStatus('${c.id}', this.value, this)">${statusOptions}</select>
          <button class="job-mini" onclick="openJobModal('${c.id}')" title="管理投递岗位" aria-label="管理投递岗位">📎<span class="job-count">${Object.keys(s.jobs).length || ""}</span></button>
        </div>
      </td>
      <td><input type="text" class="note-input" placeholder="点击添加..." aria-label="个人备注" value="${escapeHtml(s.note)}" onblur="setNote('${c.id}', this.value)"></td>
    </tr>`;
  }).join("");
}

// ============================================================
// 渲染 —— 卡片视图
// ============================================================
function renderCards(data) {
  const container = document.getElementById("cardView");
  const noResults = document.getElementById("noResults");
  if (data.length === 0) {
    container.innerHTML = "";
    noResults.style.display = "block";
    return;
  }
  noResults.style.display = "none";

  container.innerHTML = data.map(c => {
    const { s, statusOptions, jobTags, programTag, refHTML } = buildCommonHTML(c);
    const starredClass = s.starred ? "favorited" : "";
    const starIcon = s.starred ? "⭐" : "☆";

    return `
    <div class="job-card ${starredClass}">
      <div class="card-header">
        <h3>${highlightText(c.name, filters.keyword)}</h3>
        <button class="star-btn ${s.starred ? "active" : ""}" onclick="toggleStar('${c.id}')" data-star-id="${c.id}" aria-pressed="${s.starred}" aria-label="收藏 ${escapeHtml(c.name)}">${starIcon}</button>
      </div>
      <div class="card-body">
        <span class="type-tag ${escapeHtml(c.type)}">${escapeHtml(c.type)}</span>${programTag}
        ${c.location ? `<span style="margin-left:6px;font-size:12px;color:var(--text-secondary)">📍 ${highlightText(c.location, filters.keyword)}</span>` : ""}
        <span style="margin-left:6px">${deadlineHTML(c.deadline)}</span>
      </div>
      <div class="card-jobs">${jobTags}</div>
      ${Object.keys(s.jobs).length ? `<div class="card-applied-jobs">${Object.keys(s.jobs).map(n => `<span class="job-chip" data-status="${escapeHtml(s.jobs[n])}">${escapeHtml(n)}·${escapeHtml(s.jobs[n])}</span>`).join("")}</div>` : ""}
      <div class="card-info">${escapeHtml(c.note)}</div>
      <div class="card-footer">
        ${refHTML}
        ${c.link ? `<a href="${safeLink(c.link)}" target="_blank" rel="noopener" class="link-btn">投递</a>` : ""}
        <button class="copy-mini" onclick="copyCompany(this,'${c.id}')" title="复制整条投递信息" aria-label="复制整条信息">📋</button>
        <button class="job-mini" onclick="openJobModal('${c.id}')" title="管理投递岗位" aria-label="管理投递岗位">📎<span class="job-count">${Object.keys(s.jobs).length || ""}</span></button>
        <select class="status-select" data-status="${escapeHtml(s.status)}" aria-label="投递状态" onchange="setStatus('${c.id}', this.value, this)">${statusOptions}</select>
      </div>
      <input type="text" class="note-input" style="margin-top:8px" placeholder="个人备注..." aria-label="个人备注" value="${escapeHtml(s.note)}" onblur="setNote('${c.id}', this.value)">
    </div>`;
  }).join("");
}

// ============================================================
// 筛选 + 搜索 + 排序
// ============================================================
function applyFilters() {
  // v5: 多条件筛选（同维 OR / 跨维 AND），纯函数 matchFilters 驱动
  let filtered = COMPANIES.filter(c => matchFilters(c, filters, getState));

  // 排序：字段为主（纯净）；默认收藏优先 → 批次类型（收藏局部更新，无跳行问题）
  if (currentSort.field) {
    filtered.sort((a, b) => {
      let valA, valB;
      switch (currentSort.field) {
        case "company": valA = a.name; valB = b.name; break;
        case "type": valA = TYPE_ORDER[a.type] ?? 9; valB = TYPE_ORDER[b.type] ?? 9; break;
        case "location": valA = a.location || "zzz"; valB = b.location || "zzz"; break;
        case "status": valA = STATUS_OPTIONS.indexOf(getState(a.id).status); valB = STATUS_OPTIONS.indexOf(getState(b.id).status); break;
        case "deadline": valA = a.deadline || "9999-12-31"; valB = b.deadline || "9999-12-31"; break;
        default: return 0;
      }
      let cmp;
      if (typeof valA === "string") cmp = valA.localeCompare(valB, "zh-CN");
      else cmp = valA - valB;
      return currentSort.asc ? cmp : -cmp;
    });
  } else {
    // v5.3: 默认排序按批次类型（稳定可预期；收藏只做标记不参与排序，避免与局部更新矛盾）
    filtered.sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9));
  }

  if (currentView === "table") renderTable(filtered);
  else if (currentView === "kanban") renderKanban(filtered);
  else renderCards(filtered);

  // 无结果提示带搜索词（避免用户困惑"怎么没反应"）
  const noRes = document.getElementById("noResults");
  if (noRes) {
    noRes.querySelector("p").textContent = filtered.length === 0 && filters.keyword
      ? `没有找到与"${filters.keyword}"匹配的企业 😕`
      : "没有找到匹配的企业 😕";
  }
}

// ============================================================
// 看板视图（按状态分组，三视图之一）
// ============================================================
const KANBAN_COLS = [
  { status: "未投递", label: "待投递" },
  { status: "已投递", label: "已投递" },
  { status: "笔试中", label: "笔试中" },
  { status: "面试中", label: "面试中" },
  { status: "Offer", label: "Offer" },
  { status: "已拒绝", label: "已拒绝" }
];

// 纯函数：按状态分组（可测试）
function groupByStatus(data) {
  const groups = {};
  KANBAN_COLS.forEach(col => { groups[col.status] = []; });
  data.forEach(c => {
    const st = getState(c.id).status;
    if (!groups[st]) groups[st] = [];
    groups[st].push(c);
  });
  return groups;
}

function renderKanban(data) {
  const container = document.getElementById("kanbanView");
  const noResults = document.getElementById("noResults");
  if (data.length === 0) {
    container.innerHTML = "";
    noResults.style.display = "block";
    return;
  }
  noResults.style.display = "none";

  const groups = groupByStatus(data);
  container.innerHTML = KANBAN_COLS.map(col => {
    const items = groups[col.status] || [];
    const cards = items.map(c => {
      const s = getState(c.id);
      const statusOptions = STATUS_OPTIONS.map(opt =>
        `<option value="${opt}" ${s.status === opt ? "selected" : ""}>${opt}</option>`
      ).join("");
      return `
      <div class="kanban-card ${s.starred ? "favorited" : ""}">
        <div class="kanban-card-head">
          <strong>${escapeHtml(c.name)}</strong>
          <button class="star-btn ${s.starred ? "active" : ""}" onclick="toggleStar('${c.id}')" data-star-id="${c.id}" aria-pressed="${s.starred}" aria-label="收藏 ${escapeHtml(c.name)}">${s.starred ? "⭐" : "☆"}</button>
        </div>
        <div class="kanban-card-meta">
          ${deadlineHTML(c.deadline)}
          ${c.location ? `<span>📍 ${escapeHtml(c.location)}</span>` : ""}
        </div>
        <div class="kanban-card-actions">
          ${c.refCode ? `<span class="ref-code" onclick="copyCode(this,'${c.id}')">${escapeHtml(c.refCode)}</span>` : ""}
          ${c.link ? `<a href="${safeLink(c.link)}" target="_blank" rel="noopener" class="link-btn">投递</a>` : ""}
        </div>
        ${Object.keys(s.jobs).length ? `<div class="card-applied-jobs">${Object.keys(s.jobs).map(n => `<span class="job-chip" data-status="${escapeHtml(s.jobs[n])}">${escapeHtml(n)}·${escapeHtml(s.jobs[n])}</span>`).join("")}</div>` : ""}
        <div style="display:flex;gap:4px;align-items:center">
          <select class="status-select" data-status="${escapeHtml(s.status)}" aria-label="投递状态" onchange="setStatus('${c.id}', this.value, this)">${statusOptions}</select>
          <button class="job-mini" onclick="openJobModal('${c.id}')" title="管理投递岗位" aria-label="管理投递岗位">📎<span class="job-count">${Object.keys(s.jobs).length || ""}</span></button>
        </div>
      </div>`;
    }).join("");
    return `
    <div class="kanban-col">
      <div class="kanban-col-head" data-status="${col.status}">
        <span>${col.label}</span>
        <span class="kanban-count">${items.length}</span>
      </div>
      <div class="kanban-col-body">${cards || `<div class="kanban-empty">空</div>`}</div>
    </div>`;
  }).join("");
}

// ============================================================
// 今日待办（聚合截止日期紧迫 + 进行中事项）
// ============================================================
function getTodoItems() {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const todo = [];
  COMPANIES.forEach(c => {
    const s = getState(c.id);
    if (DONE_STATUSES.includes(s.status)) return; // 已结束的不提醒
    if (c.deadline) {
      const dl = parseLocalDate(c.deadline);
      if (dl) {
        dl.setHours(0, 0, 0, 0);
        const days = Math.round((dl - now) / 86400000);
        if (days >= 0 && days <= 3) {
          todo.push({ c, type: "deadline", days, label: days === 0 ? "今天截止" : days + "天后截止" });
        }
      }
    }
    if (s.status === "笔试中" || s.status === "面试中") {
      todo.push({ c, type: "active", days: null, label: s.status === "笔试中" ? "笔试进行中" : "面试进行中" });
    }
  });
  return todo;
}

function renderTodo() {
  const bar = document.getElementById("todoBar");
  const todo = getTodoItems();
  if (todo.length === 0) { bar.classList.add("hidden"); bar.innerHTML = ""; return; }
  bar.classList.remove("hidden");
  const urgent = todo.filter(t => t.type === "deadline" && t.days <= 1);
  const items = todo.slice(0, 6).map(t =>
    `<span class="todo-item ${t.type === "deadline" && t.days <= 1 ? "urgent" : ""}">${escapeHtml(t.c.name)} · ${t.label}</span>`
  ).join("");
  bar.innerHTML = `⏰ <strong>今日待办 ${todo.length} 项</strong>${urgent.length ? ` <span class="todo-urgent-tag">${urgent.length} 项紧急</span>` : ""}：${items}`;
}

// ============================================================
// 本周动态（基于 lastUpdate 时间戳，v2.1）
// ============================================================
const WEEK_MS = 7 * 24 * 3600 * 1000;

// 纯函数：统计最近 7 天动作，并收集每类动作的公司名（可测试）
function getWeeklyStats(state) {
  const stats = { touched: 0, newApplied: 0, newTest: 0, newInterview: 0, newOffer: 0, byStatus: {} };
  const cutoff = Date.now() - WEEK_MS;
  const idToName = {};
  COMPANIES.forEach(c => { idToName[c.id] = c.name; });
  Object.keys(state.companies).forEach(id => {
    const st = state.companies[id] || {};
    if (!st.lastUpdate || st.lastUpdate < cutoff) return;
    stats.touched++;
    const name = idToName[id] || id;
    if (st.status === "已投递") { stats.newApplied++; pushName(stats.byStatus, "已投递", name); }
    else if (st.status === "笔试中") { stats.newTest++; pushName(stats.byStatus, "笔试中", name); }
    else if (st.status === "面试中") { stats.newInterview++; pushName(stats.byStatus, "面试中", name); }
    else if (st.status === "Offer") { stats.newOffer++; pushName(stats.byStatus, "Offer", name); }
  });
  return stats;
}

function pushName(map, key, name) {
  if (!map[key]) map[key] = [];
  map[key].push(name);
}

// 公司名列表格式化：最多显示 3 家，超出显示"等 N 家"
function fmtNames(names, max = 3) {
  if (!names || names.length === 0) return "";
  if (names.length <= max) return names.join("、");
  return names.slice(0, max).join("、") + ` 等${names.length}家`;
}

function renderWeekly() {
  const bar = document.getElementById("weeklyBar");
  const stats = getWeeklyStats(userState);
  if (stats.touched === 0) { bar.classList.add("hidden"); bar.innerHTML = ""; return; }
  bar.classList.remove("hidden");
  // v4.5: 带上公司名，避免"只有数字不知道是哪几家"的无效信息
  const parts = [];
  if (stats.newApplied) parts.push(`新投递 ${fmtNames(stats.byStatus["已投递"])}`);
  if (stats.newTest) parts.push(`进笔试 ${fmtNames(stats.byStatus["笔试中"])}`);
  if (stats.newInterview) parts.push(`进面试 ${fmtNames(stats.byStatus["面试中"])}`);
  if (stats.newOffer) parts.push(`Offer ${fmtNames(stats.byStatus["Offer"])}`);
  bar.innerHTML = `📊 <strong>本周动态</strong>（${stats.touched} 家）：${parts.join(" · ")}`;
}

// ============================================================
// 到期提醒（页面打开时，每天一次防打扰）
// ============================================================
const ALERT_KEY = "qiuzhao2027.lastAlert";

// 纯函数：是否应提醒（同一天只提醒一次，可测试）
function shouldAlertToday(lastAlertDate, todayStr) {
  return lastAlertDate !== todayStr;
}

function checkDeadlineAlert() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const last = localStorage.getItem(ALERT_KEY);
    if (!shouldAlertToday(last, todayStr)) return;

    const soon = [];
    COMPANIES.forEach(c => {
      const s = getState(c.id);
      if (DONE_STATUSES.includes(s.status) || !c.deadline) return;
      const dl = parseLocalDate(c.deadline);
      if (!dl) return;
      dl.setHours(0, 0, 0, 0);
      const days = Math.round((dl - today) / 86400000);
      if (days >= 0 && days <= 3) soon.push({ c, days });
    });

    if (soon.length > 0) {
      const list = soon.map(x => `${x.c.name}(${x.days === 0 ? "今天" : x.days + "天"})`).join("、");
      showToast(`⚠️ ${soon.length} 家公司即将截止：${list}`, 5000);
    }
    localStorage.setItem(ALERT_KEY, todayStr);
  } catch(e) { /* 隐私模式等场景静默 */ }
}

// ============================================================
// 一键复制整条投递信息
// ============================================================
function buildCompanyInfoText(id) {
  const c = COMPANIES.find(x => x.id === id);
  if (!c) return "";
  const s = getState(c.id);
  const lines = [
    `【${c.name}】`,
    `批次：${c.type}${c.program ? " · " + c.program : ""}`,
    `岗位：${c.jobs.join("、")}`,
    c.location ? `地点：${c.location}` : null,
    c.refCode ? `内推码：${c.refCode}` : null,
    c.link ? `链接：${c.link}` : null,
    s.status !== "未投递" ? `我的状态：${s.status}` : null
  ].filter(Boolean);
  return lines.join("\n");
}

function copyCompany(el, id) {
  const text = buildCompanyInfoText(id);
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    el.classList.add("copied");
    const orig = el.textContent;
    el.textContent = "✓ 已复制";
    setTimeout(() => { el.classList.remove("copied"); el.textContent = orig; }, 1500);
  }).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("✅ 整条信息已复制");
  });
}

// ============================================================
// v5: 多条件筛选入口 + chips 渲染 + 已选条件条
// ============================================================

// 城市提取：按出现频次排序（纯函数可测）
function extractCities(companies) {
  const freq = {};
  companies.forEach(c => (c.location || "").split("/").forEach(l => {
    l = l.trim();
    if (l && l !== "全国多地" && l !== "线上") freq[l] = (freq[l] || 0) + 1;
  }));
  return Object.keys(freq).sort((a, b) => (freq[b] || 0) - (freq[a] || 0) || a.localeCompare(b, "zh-CN"));
}

// 通用筛选切换：dim = status | starred | locations | industries | jobs
function toggleFilter(dim, value) {
  if (dim === "starred") filters.starred = !filters.starred;
  else {
    const set = filters[dim];
    if (!set) return;
    if (set.has(value)) set.delete(value); else set.add(value);
  }
  refreshFilterUI();
  applyFilters();
}

function clearFilters() {
  filters.status.clear();
  filters.starred = false;
  filters.locations.clear();
  filters.industries.clear();
  filters.jobs.clear();
  filters.keyword = "";
  const input = document.getElementById("searchInput");
  if (input) input.value = "";
  refreshFilterUI();
  applyFilters();
}

// 刷新所有筛选 UI 的选中态 + 筛选按钮角标 + 已选条件条
function refreshFilterUI() {
  // 筛选面板 checkbox 选中态（地点/行业/岗位；状态由顶部仪表盘承担）
  document.querySelectorAll(".fp-opt input[data-dim]").forEach(cb => {
    const dim = cb.dataset.dim;
    cb.checked = !!filters[dim] && filters[dim].has(cb.dataset.value);
  });
  // 仪表盘卡片高亮（概览查看语义）
  document.querySelectorAll(".dash-card[data-filter]").forEach(c => {
    const f = c.dataset.filter;
    let active = false;
    if (f === "all") active = filters.status.size === 0 && !filters.starred;
    else if (f === "starred") active = filters.starred;
    else active = filters.status.has(f);
    c.classList.toggle("active", active);
  });
  // 筛选按钮角标（已选条件数）
  const badge = document.getElementById("filterBadge");
  if (badge) {
    const n = filters.locations.size + filters.industries.size + filters.jobs.size;
    badge.textContent = n;
    badge.classList.toggle("hidden", n === 0);
  }
  renderFilterSummary();
}

// v5.3: 条件条分组格式化（同维合并用"或"，跨维用"+"）——纯函数可测
function formatFilterParts(f) {
  const groups = [];
  if (f.starred) groups.push({ dim: "starred", items: [{ text: "⭐收藏", dim: "starred", val: "" }] });
  if (f.status.size) groups.push({ dim: "status", items: [...f.status].map(v => ({ text: v, dim: "status", val: v })) });
  if (f.locations.size) groups.push({ dim: "locations", items: [...f.locations].map(v => ({ text: v, dim: "locations", val: v })) });
  if (f.industries.size) groups.push({ dim: "industries", items: [...f.industries].map(v => ({ text: v, dim: "industries", val: v })) });
  if (f.jobs.size) groups.push({ dim: "jobs", items: [...f.jobs].map(v => ({ text: v, dim: "jobs", val: v })) });
  if (f.keyword) groups.push({ dim: "keyword", items: [{ text: `搜索“${f.keyword}”`, dim: "keyword", val: f.keyword }] });
  return groups;
}

// 结果计数：当前条件下命中多少家（纯函数可测）
function countFiltered(f) {
  return COMPANIES.filter(c => matchFilters(c, f, getState)).length;
}

// 移除单个筛选条件（按维度+值）
function removeFilterItem(dim, val) {
  if (dim === "keyword") {
    filters.keyword = "";
    const inp = document.getElementById("searchInput");
    if (inp) inp.value = "";
  } else if (dim === "starred") {
    filters.starred = false;
  } else {
    filters[dim].delete(val);
  }
  refreshFilterUI();
  applyFilters();
}

// 已选条件条：同维"或" / 跨维"+" / 结果计数 / 单条件 ✕
function renderFilterSummary() {
  const bar = document.getElementById("filterSummary");
  const groups = formatFilterParts(filters);
  if (groups.length === 0) { bar.classList.add("hidden"); bar.innerHTML = ""; return; }
  bar.classList.remove("hidden");
  const count = countFiltered(filters);
  const groupHTML = groups.map(g =>
    g.items.map(it =>
      `<span class="fs-item" data-dim="${it.dim}">${escapeHtml(it.text)}<button class="fs-x" onclick="removeFilterItem('${it.dim}','${escapeHtml(it.val)}')" aria-label="移除 ${escapeHtml(it.text)}">✕</button></span>`
    ).join("<span class='fs-or'>或</span>")
  ).join("<span class='fs-plus'>+</span>");
  bar.innerHTML = `已选：${groupHTML} <span class="fs-count">共 ${count} 家 / ${COMPANIES.length}</span> <button class="fs-clear" onclick="clearFilters()">清除全部</button>`;
}

// ============================================================
// v5.6: 分级目录筛选（省份→城市 / 方向→标准岗位 树形折叠）
// ============================================================

// 城市 → 省份 映射（公开常识，用户要求按省份分级）
const CITY_PROVINCE = {
  "深圳": "广东", "广州": "广东", "东莞": "广东",
  "苏州": "江苏", "无锡": "江苏", "南京": "江苏",
  "杭州": "浙江", "合肥": "安徽",
  "上海": "上海", "北京": "北京",
  "成都": "四川", "郑州": "河南", "西安": "陕西", "重庆": "重庆",
  "武汉": "湖北", "长沙": "湖南",
  "全国多地": "全国", "线上": "线上"
};

// 岗位标准化关键词表（从原始岗位文本提取，消灭"算法岗/算法/算法类"变体与噪音）
const JOB_KEYWORDS = [
  "算法", "研发", "开发", "后端", "前端", "客户端", "测试", "运维", "安全",
  "数据", "大模型", "推荐", "音视频", "游戏引擎", "嵌入式", "硬件", "软件", "机械", "电气",
  "产品", "运营", "项目管理", "用户体验", "策划", "美术", "设计",
  "市场", "销售", "供应链", "质量", "人力资源", "管培", "发行", "职能", "综合"
];

// 岗位方向分组（标准词 → 方向）
const JOB_DIRS = [
  { dir: "技术类", keys: ["算法", "研发", "开发", "后端", "前端", "客户端", "测试", "运维", "安全", "数据", "大模型", "推荐", "音视频", "游戏引擎", "嵌入式", "硬件", "软件", "机械", "电气"] },
  { dir: "产品/运营", keys: ["产品", "运营", "项目管理", "用户体验", "策划", "发行"] },
  { dir: "市场/职能", keys: ["市场", "销售", "设计", "美术", "供应链", "质量", "人力资源", "管培", "职能", "综合"] }
];

// 城市按省份分组（纯函数可测）
function groupCitiesByProvince(cities) {
  const map = {};
  cities.forEach(city => {
    const province = CITY_PROVINCE[city] || "其他";
    if (!map[province]) map[province] = [];
    map[province].push(city);
  });
  const order = ["广东", "江苏", "浙江", "上海", "北京", "安徽", "四川", "河南", "陕西", "重庆", "湖北", "湖南", "全国", "线上", "其他"];
  return order.filter(p => map[p]).map(p => ({ province: p, cities: map[p] }));
}

// 岗位标准化提取：扫描原始岗位文本，命中标准词则计数（≥min 次才进筛选，自动去噪）
function extractStandardJobs(companies, min = 2) {
  const freq = {};
  companies.forEach(c => (c.jobs || []).forEach(j => {
    JOB_KEYWORDS.forEach(kw => {
      if (j.includes(kw)) freq[kw] = (freq[kw] || 0) + 1;
    });
  }));
  return Object.keys(freq).filter(k => freq[k] >= min);
}

// 岗位按方向分组（纯函数可测；基于标准词，无变体重复）
function groupJobsByDirection(jobs) {
  const groups = JOB_DIRS.map(g => ({ dir: g.dir, jobs: [] }));
  const other = { dir: "其他", jobs: [] };
  jobs.forEach(j => {
    const hit = JOB_DIRS.find(g => g.keys.includes(j));
    if (hit) groups.find(g => g.dir === hit.dir).jobs.push(j);
    else other.jobs.push(j);
  });
  const out = groups.filter(g => g.jobs.length > 0);
  if (other.jobs.length) out.push(other);
  return out;
}

// 树形分组渲染（分级目录：组头可折叠，默认收起，叶子 checkbox 多选）
function treeHTML(groups, dim, keyField) {
  return groups.map(g =>
    `<div class="fp-group collapsed">
      <button type="button" class="fp-group-head" onclick="this.parentNode.classList.toggle('collapsed')">
        <span class="fp-caret">▾</span>${escapeHtml(g[keyField])}<span class="fp-group-count">${(g.cities || g.jobs).length}</span>
      </button>
      <div class="fp-group-body">
        ${(g.cities || g.jobs).map(v =>
          `<label class="fp-opt"><input type="checkbox" data-dim="${dim}" data-value="${escapeHtml(v)}" onchange="toggleFilter('${dim}','${escapeHtml(v)}')"> <span>${escapeHtml(v)}</span></label>`
        ).join("")}
      </div>
    </div>`
  ).join("");
}

// v5.6: 筛选下拉面板（分级目录：地点按省份、岗位按方向，行业纵向平铺）
function renderFilterPanel() {
  const optsHTML = (values, dim) => values.map(v =>
    `<label class="fp-opt"><input type="checkbox" data-dim="${dim}" data-value="${escapeHtml(v)}" onchange="toggleFilter('${dim}','${escapeHtml(v)}')"> <span>${escapeHtml(v)}</span></label>`
  ).join("");
  document.getElementById("fpLoc").innerHTML = treeHTML(groupCitiesByProvince(extractCities(COMPANIES)), "locations", "province");
  document.getElementById("fpInd").innerHTML = optsHTML(
    [...new Set(COMPANIES.flatMap(c => c.category))].filter(c => c !== "活动"), "industries"
  );
  document.getElementById("fpJob").innerHTML = treeHTML(groupJobsByDirection(extractStandardJobs(COMPANIES, 2)), "jobs", "dir");
}

// 开关筛选面板 + 点击外部 / Esc 关闭
function toggleFilterPanel() {
  const panel = document.getElementById("filterPanel");
  const btn = document.getElementById("filterToggleBtn");
  const isOpen = !panel.classList.contains("hidden");
  panel.classList.toggle("hidden", isOpen);
  btn.setAttribute("aria-expanded", String(!isOpen));
}

document.addEventListener("click", function(e) {
  const wrap = document.getElementById("filterPanel");
  const btn = document.getElementById("filterToggleBtn");
  if (!wrap || wrap.classList.contains("hidden")) return;
  if (!wrap.contains(e.target) && !btn.contains(e.target)) {
    wrap.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
  }
});

document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    const panel = document.getElementById("filterPanel");
    if (panel && !panel.classList.contains("hidden")) {
      panel.classList.add("hidden");
      document.getElementById("filterToggleBtn").setAttribute("aria-expanded", "false");
    }
  }
});

// ============================================================
// 事件绑定
// ============================================================
document.getElementById("searchInput").addEventListener("input", debounce(function(e) {
  filters.keyword = e.target.value.trim();
  refreshFilterUI();
  applyFilters();
}, 200));

// 回车 = 确认搜索（阻止默认行为 + 立即执行 + 明确反馈）
document.getElementById("searchInput").addEventListener("keydown", function(e) {
  // 中文输入法（IME）组合期间的回车是"确认候选词"，不是用户要搜索——必须跳过
  if (e.key !== "Enter" || e.isComposing) return;
  e.preventDefault();
  filters.keyword = this.value.trim();
  refreshFilterUI();
  applyFilters();
  const n = countFiltered(filters);
  showToast(filters.keyword
    ? (n > 0 ? `找到 ${n} 家与"${filters.keyword}"匹配` : `没有找到与"${filters.keyword}"匹配的企业`)
    : "搜索已清空", 4000);  // 4 秒，避免一闪而过没看到
});

document.querySelectorAll("thead th[data-sort]").forEach(th => {
  th.addEventListener("click", function() {
    const field = this.dataset.sort;
    if (currentSort.field === field) currentSort.asc = !currentSort.asc;
    else { currentSort.field = field; currentSort.asc = true; }
    document.querySelectorAll("thead th").forEach(h => h.classList.remove("sorted"));
    this.classList.add("sorted");
    this.querySelector(".sort-icon").textContent = currentSort.asc ? "↑" : "↓";
    applyFilters();
  });
});

function switchView(view) {
  currentView = view;
  document.getElementById("tableView").classList.toggle("hidden", view !== "table");
  document.getElementById("cardView").classList.toggle("hidden", view !== "card");
  const kb = document.getElementById("kanbanView");
  if (kb) kb.classList.toggle("hidden", view !== "kanban");  // 看板入口已移除（v4.5），代码预留
  document.getElementById("tableViewBtn").classList.toggle("active", view === "table");
  document.getElementById("cardViewBtn").classList.toggle("active", view === "card");
  applyFilters();
}

// ============================================================
// 状态操作（以稳定 ID 为参数，避免注入）
// ============================================================
function toggleStar(id) {
  getState(id).starred = !getState(id).starred;
  touchState(id);
  saveState();
  renderDashboard();
  renderTodo();
  renderWeekly();
  // P1-8: 局部更新星标（不重建列表，保持焦点/滚动位置）
  const st = getState(id);
  document.querySelectorAll(`[data-star-id="${id}"]`).forEach(btn => {
    btn.textContent = st.starred ? "⭐" : "☆";
    btn.classList.toggle("active", st.starred);
    btn.setAttribute("aria-pressed", String(st.starred));
  });
  // 特例：在"收藏"筛选下取消收藏 → 该行应消失，需全量刷新
  if (filters.starred && !st.starred) {
    applyFilters();
  }
}

function setStatus(id, status, el) {
  const s = getState(id);
  // v6: 已记录投递岗位时，公司总状态由岗位自动聚合，禁止手动覆盖
  if (Object.keys(s.jobs).length > 0) {
    el.value = deriveCompanyStatus(s.jobs, s.status);
    showToast("已记录投递岗位，总进度由岗位自动聚合（点 📎 管理）");
    return;
  }
  const prev = s.status;
  s.status = status;
  touchState(id);
  el.setAttribute("data-status", status);
  saveState();
  renderDashboard();
  renderTodo();
  renderWeekly();
  // P2-3: 状态变更视觉反馈
  if (prev !== status) {
    const c = COMPANIES.find(x => x.id === id);
    showToast(`${c ? c.name : id}：${prev} → ${status}`);
  }
}

// ============================================================
// v6: 岗位级投递管理（一个公司可投多个岗位，各自独立进度）
// ============================================================
let jobModalId = null;

function refreshAll() {
  renderDashboard();
  renderTodo();
  renderWeekly();
  refreshFilterUI();
  applyFilters();
}

// 添加投递岗位（自由填写，去重/trim/限长防注入）
function addAppliedJob(id) {
  const input = document.getElementById("jobInput");
  const name = (input.value || "").trim().slice(0, 30);
  if (!name) { showToast("请输入岗位名"); return; }
  const s = getState(id);
  if (s.jobs[name]) { showToast("该岗位已在列表"); return; }
  s.jobs[name] = "已投递";
  s.status = deriveCompanyStatus(s.jobs, s.status);  // 聚合写回
  touchState(id);
  saveState();
  renderJobModal(id);
  refreshAll();
  input.value = "";
  input.focus();
}

function removeAppliedJob(id, name) {
  const s = getState(id);
  delete s.jobs[name];
  s.status = deriveCompanyStatus(s.jobs, s.status);  // 聚合写回
  touchState(id);
  saveState();
  renderJobModal(id);
  refreshAll();
}

function setJobStatus(id, name, status) {
  const s = getState(id);
  s.jobs[name] = status;
  s.status = deriveCompanyStatus(s.jobs, s.status);  // 聚合写回
  touchState(id);
  saveState();
  renderJobModal(id);
  refreshAll();
}

function openJobModal(id) {
  jobModalId = id;
  const modal = document.getElementById("jobModal");
  modal.style.display = "flex";
  renderJobModal(id);
  setTimeout(() => {
    const inp = document.getElementById("jobInput");
    if (inp) inp.focus();
  }, 50);
}

function closeJobModal() {
  document.getElementById("jobModal").style.display = "none";
  jobModalId = null;
}

function renderJobModal(id) {
  const c = COMPANIES.find(x => x.id === id);
  if (!c) return;
  const s = getState(id);
  document.getElementById("jobModalTitle").textContent = `${c.name} · 投递岗位`;
  const agg = deriveCompanyStatus(s.jobs, s.status);
  document.getElementById("jobModalAgg").textContent = `总进度：${agg}（由各岗位自动聚合）`;
  const rows = Object.keys(s.jobs).map(name =>
    `<div class="job-row">
      <span class="job-row-name">${escapeHtml(name)}</span>
      <select class="status-select" aria-label="岗位 ${escapeHtml(name)} 状态" onchange="setJobStatus('${id}','${escapeHtml(name)}',this.value)">
        ${STATUS_OPTIONS.map(o => `<option value="${o}" ${s.jobs[name] === o ? "selected" : ""}>${o}</option>`).join("")}
      </select>
      <button class="job-row-del" onclick="removeAppliedJob('${id}','${escapeHtml(name)}')" aria-label="删除岗位 ${escapeHtml(name)}">✕</button>
    </div>`
  ).join("");
  document.getElementById("jobModalList").innerHTML = rows || `<div class="job-empty">还没记录投递岗位，输入岗位名添加 👇</div>`;
  // 同步输入框回车添加
  const inp = document.getElementById("jobInput");
  if (inp) inp.onkeydown = function(e) {
    if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); addAppliedJob(id); }
  };
}

function setNote(id, note) {
  getState(id).note = note;
  touchState(id);
  saveState();
}

function copyCode(el, id) {
  const c = COMPANIES.find(x => x.id === id);
  if (!c || !c.refCode) return;
  const code = c.refCode;
  const orig = el.textContent; // 提前捕获，避免异步回调期间被二次点击覆盖
  navigator.clipboard.writeText(code).then(() => {
    el.classList.add("copied");
    el.textContent = "✓ 已复制";
    setTimeout(() => { el.classList.remove("copied"); el.textContent = orig; }, 1200);
  }).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = code;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("已复制: " + code);
  });
}

// ============================================================
// 主题
// ============================================================
function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  document.getElementById("themeBtn").textContent = next === "dark" ? "🌙" : "☀️";
  try { localStorage.setItem(THEME_KEY, next); } catch(e) {}
}
(function() {
  const saved = document.documentElement.getAttribute("data-theme");
  document.getElementById("themeBtn").textContent = saved === "dark" ? "🌙" : "☀️";
})();

// ============================================================
// 导出 CSV
// ============================================================
function exportCSV() {
  const rows = [["序号", "公司", "类型", "专项", "岗位", "地点", "截止日期", "内推码", "投递状态", "已投岗位", "个人备注"]];
  COMPANIES.forEach((c, i) => {
    const s = getState(c.id);
    const appliedJobs = Object.entries(s.jobs || {}).map(([n, st]) => `${n}:${st}`).join("|");
    rows.push([i + 1, c.name, c.type, c.program || "", c.jobs.join("、"), c.location, c.deadline || "", c.refCode || "链接即内推", s.status, appliedJobs, s.note]);
  });
  const csv = rows.map(r => r.map(csvSafe).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `秋招跟踪_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("CSV 已导出");
}

// ============================================================
// 导出/导入 JSON 备份
// ============================================================
function exportJSON() {
  const data = {
    exportDate: new Date().toISOString(),
    dataVersion: DATA_VERSION,
    stateVersion: 2,
    companies: COMPANIES,
    userState: userState
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `秋招备份_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("备份已导出");
}

// 合并外部状态（导入/同步共用）：只覆盖已知公司，未知 id 忽略
function mergeIncoming(incoming) {
  if (!incoming || typeof incoming !== "object") return 0;
  let merged = 0;
  Object.keys(incoming).forEach(id => {
    if (!COMPANY_IDS.has(id)) return;
    const st = incoming[id] || {};
    userState.companies[id] = { status: st.status || "未投递", starred: !!st.starred, note: st.note || "" };
    merged++;
  });
  if (merged > 0) {
    saveState();
    renderDashboard();
    applyFilters();
  }
  return merged;
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      // 兼容两种备份格式：{userState:{companies}} 或 {version:2,companies}
      const incoming = (data && data.userState && data.userState.companies)
        ? data.userState.companies
        : (data && data.version === 2 && data.companies) ? data.companies : null;
      if (incoming && mergeIncoming(incoming) > 0) {
        showToast("✅ 状态导入成功");
      } else {
        showToast("文件格式不正确或没有可导入的数据");
      }
    } catch(err) {
      showToast("导入失败: " + err.message);
    }
  };
  reader.readAsText(file);
}

// ============================================================
// 二维码跨设备同步（手机↔电脑）
// ============================================================
// ============================================================
// v7: 云同步（LeanCloud REST，纯前端免后端）
// ============================================================
const CLOUD_KEY = "qiuzhao2027.cloud";
const CLOUD_CLASS = "QiuzhaoState";
const DEFAULT_SERVER = "https://api.leancloud.cn";
let cloudTimer = null;
let cloudStatus = "off";  // off | syncing | synced | error

function getCloudConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(CLOUD_KEY)) || {};
    return { appId: c.appId || "", appKey: c.appKey || "", serverURL: c.serverURL || DEFAULT_SERVER, enabled: c.enabled !== false };
  } catch(e) { return { appId: "", appKey: "", serverURL: DEFAULT_SERVER, enabled: true }; }
}
function saveCloudConfig(cfg) {
  localStorage.setItem(CLOUD_KEY, JSON.stringify(cfg));
  updateCloudBadge();
}

// 公司级合并（纯函数可测）：同公司取 lastUpdate 较新者，单方有则用单方
function mergeCloudState(local, remote) {
  const out = {};
  const allIds = new Set([...Object.keys(local.companies || {}), ...Object.keys(remote.companies || {})]);
  allIds.forEach(id => {
    const l = local.companies[id];
    const r = remote.companies[id];
    if (!l) { out[id] = r; return; }
    if (!r) { out[id] = l; return; }
    out[id] = (l.lastUpdate || 0) >= (r.lastUpdate || 0) ? l : r;
  });
  return { version: 3, companies: out };
}

async function cloudFetch(path, opts = {}) {
  const cfg = getCloudConfig();
  if (!cfg.appId || !cfg.appKey) throw new Error("未配置云同步");
  const res = await fetch(cfg.serverURL + path, {
    ...opts,
    headers: {
      "X-LC-Id": cfg.appId,
      "X-LC-Key": cfg.appKey,
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });
  if (!res.ok) throw new Error("云同步 HTTP " + res.status);
  return res.json();
}

async function cloudGetObject() {
  const list = await cloudFetch(`/1.1/classes/${CLOUD_CLASS}?limit=1&order=-updatedAt`);
  if (list.results && list.results.length > 0 && list.results[0].state) {
    return { id: list.results[0].objectId, state: JSON.parse(list.results[0].state) };
  }
  return null;
}

async function cloudCreateObject() {
  const body = { state: JSON.stringify(userState), lastSync: new Date().toISOString() };
  const created = await cloudFetch(`/1.1/classes/${CLOUD_CLASS}`, { method: "POST", body: JSON.stringify(body) });
  return created.objectId;
}

// 上传：先拉云端做公司级合并（避免覆盖另一设备的修改）再整体写入
async function cloudPush() {
  const cfg = getCloudConfig();
  if (!cfg.enabled || !cfg.appId || !cfg.appKey) return;
  setCloudStatus("syncing");
  try {
    const remote = await cloudGetObject();
    let id = remote && remote.id;
    if (remote && remote.state) {
      const merged = mergeCloudState(userState, remote.state);
      userState = merged;
      saveStateRaw();
    } else if (!id) {
      id = await cloudCreateObject();
    }
    if (id) {
      await cloudFetch(`/1.1/classes/${CLOUD_CLASS}/${id}`, {
        method: "PUT",
        body: JSON.stringify({ state: JSON.stringify(userState), lastSync: new Date().toISOString() })
      });
    }
    setCloudStatus("synced");
  } catch(e) {
    setCloudStatus("error");
    console.warn("云同步上传失败", e);
  }
}

// 拉取：合并云端到本地（公司级），页面加载与手动触发
async function cloudPull() {
  const cfg = getCloudConfig();
  if (!cfg.enabled || !cfg.appId || !cfg.appKey) return;
  setCloudStatus("syncing");
  try {
    const remote = await cloudGetObject();
    if (remote && remote.state) {
      const merged = mergeCloudState(userState, remote.state);
      userState = merged;
      saveStateRaw();
      refreshAll();
      showToast("☁️ 已从云端同步");
    } else {
      await cloudCreateObject();
    }
    setCloudStatus("synced");
  } catch(e) {
    setCloudStatus("error");
    console.warn("云同步拉取失败", e);
  }
}

// 仅写本地（避免 cloudPull/cloudPush 合并时再次触发防抖上传形成循环）
function saveStateRaw() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(userState)); } catch(e) { console.warn("保存失败", e); }
}

// 本地变更 → 防抖 8 秒后自动上传
function scheduleCloudPush() {
  const cfg = getCloudConfig();
  if (!cfg.enabled || !cfg.appId || !cfg.appKey) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(cloudPush, 8000);
}

function setCloudStatus(s) {
  cloudStatus = s;
  updateCloudBadge();
}

function updateCloudBadge() {
  const btn = document.getElementById("cloudBtn");
  if (!btn) return;
  const cfg = getCloudConfig();
  if (!cfg.appId || !cfg.appKey) {
    btn.className = "icon-btn cloud-off";
    btn.title = "☁️ 云同步未配置（点击配置）";
    return;
  }
  if (cloudStatus === "syncing") { btn.className = "icon-btn cloud-syncing"; btn.title = "☁️ 同步中..."; }
  else if (cloudStatus === "error") { btn.className = "icon-btn cloud-err"; btn.title = "☁️ 同步失败（点击查看）"; }
  else { btn.className = "icon-btn cloud-ok"; btn.title = "☁️ 云同步正常（点击配置/立即同步）"; }
}

// 云同步设置弹窗
function openCloudModal() {
  const cfg = getCloudConfig();
  const modal = document.getElementById("cloudModal");
  document.getElementById("cloudModalTitle").textContent = "☁️ 云同步设置";
  document.getElementById("cloudAppId").value = cfg.appId;
  document.getElementById("cloudAppKey").value = cfg.appKey;
  document.getElementById("cloudServer").value = cfg.serverURL;
  document.getElementById("cloudEnabled").checked = cfg.enabled;
  const st = document.getElementById("cloudStatus");
  st.textContent = cfg.appId ? (cloudStatus === "synced" ? "✅ 已连接" : cloudStatus === "error" ? "⚠️ 上次同步失败" : cloudStatus === "syncing" ? "🔄 同步中" : "⚪ 待同步") : "未配置";
  modal.style.display = "flex";
}

function closeCloudModal() {
  document.getElementById("cloudModal").style.display = "none";
}

function saveCloudSettings() {
  const cfg = {
    appId: document.getElementById("cloudAppId").value.trim(),
    appKey: document.getElementById("cloudAppKey").value.trim(),
    serverURL: document.getElementById("cloudServer").value.trim() || DEFAULT_SERVER,
    enabled: document.getElementById("cloudEnabled").checked
  };
  if (!cfg.appId || !cfg.appKey) { showToast("请填写 AppID 和 AppKey"); return; }
  saveCloudConfig(cfg);
  cloudStatus = "off";
  closeCloudModal();
  showToast("☁️ 配置已保存，开始同步...");
  cloudPush();
}

async function testCloud() {
  const cfg = {
    appId: document.getElementById("cloudAppId").value.trim(),
    appKey: document.getElementById("cloudAppKey").value.trim(),
    serverURL: document.getElementById("cloudServer").value.trim() || DEFAULT_SERVER,
    enabled: document.getElementById("cloudEnabled").checked
  };
  if (!cfg.appId || !cfg.appKey) { showToast("请先填写 AppID 和 AppKey"); return; }
  const st = document.getElementById("cloudStatus");
  st.textContent = "🔄 测试中...";
  try {
    saveCloudConfig(cfg);
    await cloudGetObject();
    st.textContent = "✅ 连接成功";
    showToast("☁️ 连接成功");
  } catch(e) {
    st.textContent = "❌ 连接失败：" + e.message;
  }
}

function encodeSyncCode() {
  // v6: 同步码升级到 v3（含岗位级 jobs 映射）；兼容 v2 老码解码
  const payload = { v: 3, c: userState.companies };
  const json = JSON.stringify(payload);
  // UTF-8 安全 base64
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeSyncCode(code) {
  const json = decodeURIComponent(escape(atob(code.trim())));
  return JSON.parse(json);
}

function openSyncModal(mode) {
  const modal = document.getElementById("syncModal");
  const title = document.getElementById("syncTitle");
  const body = document.getElementById("syncBody");
  // P1-5: 记录触发按钮，关闭时还原焦点
  syncTriggerEl = document.activeElement;
  modal.style.display = "flex";
  document.addEventListener("keydown", syncModalKeydown);
  // P1-5: 焦点移入弹窗（等 body 渲染完成）
  setTimeout(() => {
    const first = modal.querySelector("button, [href], input, select, textarea");
    if (first) first.focus();
  }, 50);

  if (mode === "export") {
    title.textContent = "📤 导出状态 · 同步到另一设备";
    const code = encodeSyncCode();
    body.innerHTML = `
      <div class="sync-qr" id="qrBox"></div>
      <p style="font-size:12px;color:var(--text-secondary);text-align:center">手机打开本页面 → 点 📱 按钮 → 「扫描导入」扫这个码</p>
      <p style="font-size:12px;color:var(--text-secondary);margin-top:6px">也可以复制下面的码，在另一设备「粘贴导入」：</p>
      <textarea class="sync-code-text" readonly>${code}</textarea>
      <button class="btn btn-primary" onclick="copySyncText()">复制同步码</button>
    `;
    try {
      const qr = new QRCode(document.getElementById("qrBox"), {
        text: code, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M
      });
    } catch(e) {
      document.getElementById("qrBox").innerHTML = '<span style="color:#888;font-size:12px">二维码库加载失败，请用文本码同步</span>';
    }
  } else {
    title.textContent = "📥 扫描/粘贴导入";
    body.innerHTML = `
      <div id="qrReader"></div>
      <p style="font-size:12px;color:var(--text-secondary)">对准另一设备的二维码，或将同步码粘贴到下方：</p>
      <textarea class="sync-code-text" id="syncCodeInput" placeholder="粘贴同步码..."></textarea>
      <button class="btn btn-primary" onclick="importSyncFromText()">导入</button>
      <button class="btn" onclick="closeSyncModal()">取消</button>
      <p class="modal-hint">导入会合并状态：已有公司状态将被覆盖，其余保持不变</p>
    `;
    startQrScanner();
  }
}

function closeSyncModal() {
  document.getElementById("syncModal").style.display = "none";
  document.removeEventListener("keydown", syncModalKeydown);
  stopQrScanner();
  // P1-5: 焦点归还触发按钮
  if (syncTriggerEl && typeof syncTriggerEl.focus === "function") {
    try { syncTriggerEl.focus(); } catch(e) {}
  }
  syncTriggerEl = null;
}

// P1-5: 模态框键盘管理（Esc 关闭 + 焦点圈定在弹窗内）
let syncTriggerEl = null;

function syncModalKeydown(e) {
  const modal = document.getElementById("syncModal");
  if (modal.style.display === "none") return;
  if (e.key === "Escape") {
    closeSyncModal();
    return;
  }
  // Tab 焦点圈定（focus trap）
  if (e.key === "Tab") {
    const focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

function copySyncText() {
  const ta = document.querySelector("#syncBody textarea");
  if (!ta) return;
  navigator.clipboard.writeText(ta.value).then(() => showToast("同步码已复制"));
}

function importSyncFromText() {
  const ta = document.getElementById("syncCodeInput");
  if (!ta || !ta.value.trim()) { showToast("请先粘贴同步码"); return; }
  try {
    const payload = decodeSyncCode(ta.value);
    if (!payload || (payload.v !== 2 && payload.v !== 3) || !payload.c) throw new Error("格式错误");
    // v6: 兼容 v2 老码，统一升级到 v3 后合并
    mergeSync(upgradeToV3({ version: payload.v, companies: payload.c }).companies);
    showToast("✅ 状态同步完成");
    closeSyncModal();
  } catch(e) {
    showToast("同步码无效: " + e.message);
  }
}

function mergeSync(incoming) {
  mergeIncoming(incoming);
}

// 摄像头扫码（html5-qrcode，按需动态加载）
let qrScanner = null;

// 动态加载外部脚本（P0-2：避免首屏全量下载 ~300KB 扫码库）
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("script load failed"));
    document.head.appendChild(s);
  });
}

async function startQrScanner() {
  // 确保上一个实例彻底释放，避免重复 start 报错
  await stopQrScanner();
  if (typeof Html5Qrcode === "undefined") {
    try {
      await loadScript("https://cdn.staticfile.org/html5-qrcode/2.3.8/html5-qrcode.min.js");
    } catch(e) {
      const hint = document.querySelector(".modal-hint");
      if (hint) hint.textContent += "（摄像头组件加载失败，可用文本码同步）";
      return;
    }
  }
  if (typeof Html5Qrcode === "undefined") {
    const hint = document.querySelector(".modal-hint");
    if (hint) hint.textContent += "（摄像头组件加载失败，可用文本码同步）";
    return;
  }
  try {
    const scanner = new Html5Qrcode("qrReader");
    qrScanner = scanner;
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      function(decodedText) {
        try {
          const payload = decodeSyncCode(decodedText);
          if (payload && (payload.v === 2 || payload.v === 3) && payload.c) {
            // v6: 兼容 v2 老码，统一升级到 v3 后合并
            mergeSync(upgradeToV3({ version: payload.v, companies: payload.c }).companies);
            showToast("✅ 扫码同步成功");
            closeSyncModal();
          } else {
            showToast("不是有效的同步码");
          }
        } catch(e) {
          showToast("不是有效的同步码");
        }
      },
      function() {}
    );
  } catch(e) {
    qrScanner = null;
    showToast("无法开启摄像头，请用文本码");
  }
}

async function stopQrScanner() {
  const scanner = qrScanner;
  qrScanner = null;
  if (!scanner) return;
  try {
    await scanner.stop();
  } catch(e) {}
  try {
    scanner.clear();
  } catch(e) {}
}

// ============================================================
// 重置
// ============================================================
function resetData() {
  if (!confirm("确定要重置所有投递状态和备注吗？此操作不可撤销！")) return;
  userState = defaultState();
  saveState();
  renderDashboard();
  applyFilters();
  showToast("已重置所有状态");
}

// ============================================================
// 初始化
// ============================================================
userState = loadState();
renderDashboard();
validateCompanies();   // 数据完整性校验（A3）
renderFilterPanel();   // v5.4: 筛选下拉面板（地点/行业/岗位 checkbox）
refreshFilterUI();     // v5: 同步所有筛选选中态 + 已选条件条
renderTodo();          // 今日待办聚合
renderWeekly();        // 本周动态统计
switchView(currentView); // 同步初始视图（修复移动端首屏显示空表格的问题）
checkDeadlineAlert();  // 页面打开时的截止提醒（每天一次）
updateCloudBadge();    // v7: 云同步状态徽标
cloudPull();           // v7: 页面加载拉取云端并合并
