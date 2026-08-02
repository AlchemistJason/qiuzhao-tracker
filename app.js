
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

let currentFilter = "all";
let currentSearch = "";
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
// 用户状态层 v2 —— 防破坏核心
// 结构: { version: 2, companies: { <id>: {status, starred, note} } }
// ============================================================
function defaultState() {
  const companies = {};
  COMPANIES.forEach(c => {
    companies[c.id] = { status: "未投递", starred: false, note: "" };
  });
  return { version: 2, companies };
}

function loadState() {
  let raw = null;
  try { raw = localStorage.getItem(STATE_KEY); } catch(e) {}

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // v2 格式直接使用
      if (parsed && parsed.version === 2 && parsed.companies) {
        return parsed;
      }
      // 旧格式（v1：无 version 字段，companies 以公司名为 key）→ 自动迁移
      if (parsed && parsed.companies && typeof parsed.companies === "object") {
        return migrateV1(parsed);
      }
      // 更旧的格式（直接 {name: {status...}} 无 companies 包裹）
      if (parsed && typeof parsed === "object" && !parsed.companies && !parsed.version) {
        return migrateBare(parsed);
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
      return newest.data;
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
}

function getState(id) {
  if (!userState.companies[id]) {
    userState.companies[id] = { status: "未投递", starred: false, note: "" };
  }
  return userState.companies[id];
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

  document.getElementById("dashboard").innerHTML = `
    <div class="dash-card"><div class="dash-icon">🏢</div><div class="dash-num">${stats.total}</div><div class="dash-label">企业总数</div></div>
    <div class="dash-card applied"><div class="dash-icon">📝</div><div class="dash-num">${stats.applied}</div><div class="dash-label">已投递</div></div>
    <div class="dash-card test"><div class="dash-icon">✏️</div><div class="dash-num">${stats.test}</div><div class="dash-label">笔试中</div></div>
    <div class="dash-card interview"><div class="dash-icon">🎤</div><div class="dash-num">${stats.interview}</div><div class="dash-label">面试中</div></div>
    <div class="dash-card offer"><div class="dash-icon">🎉</div><div class="dash-num">${stats.offer}</div><div class="dash-label">Offer</div></div>
    <div class="dash-card"><div class="dash-icon">⭐</div><div class="dash-num">${stats.starred}</div><div class="dash-label">已收藏</div></div>
    <div class="dash-card"><div class="dash-icon">⏳</div><div class="dash-num">${stats.pending}</div><div class="dash-label">未投递</div></div>
    <div class="dash-card"><div class="dash-icon">🔄</div><div class="dash-num">${inProgress}</div><div class="dash-label">进行中</div></div>
  `;

  // 筛选器计数
  document.getElementById("cAll").textContent = COMPANIES.length;
  document.getElementById("cStar").textContent = stats.starred;
  document.getElementById("cPending").textContent = stats.pending;
  document.getElementById("cActive").textContent = inProgress;
  document.getElementById("cDone").textContent = stats.offer + stats.rejected;
  document.getElementById("cGame").textContent = COMPANIES.filter(c => c.category.includes("游戏")).length;
  document.getElementById("cAI").textContent = COMPANIES.filter(c => c.category.includes("AI")).length;
  document.getElementById("cAuto").textContent = COMPANIES.filter(c => c.category.includes("智能驾驶")).length;
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
  const jobTags = c.jobs.map(j => `<span class="job-tag">${escapeHtml(j)}</span>`).join("");
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
      <td><button class="star-btn ${s.starred ? "active" : ""}" onclick="toggleStar('${c.id}')" aria-pressed="${s.starred}" aria-label="收藏 ${escapeHtml(c.name)}">${starIcon}</button></td>
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td><span class="type-tag ${escapeHtml(c.type)}">${escapeHtml(c.type)}</span>${programTag}</td>
      <td><div class="job-tags">${jobTags}</div></td>
      <td class="location">${escapeHtml(c.location) || "—"}</td>
      <td>${deadlineHTML(c.deadline)}</td>
      <td>${refHTML}</td>
      <td>${c.link ? `<a href="${safeLink(c.link)}" target="_blank" rel="noopener" class="link-btn">投递</a>` : "—"}</td>
      <td><select class="status-select" data-status="${escapeHtml(s.status)}" aria-label="投递状态" onchange="setStatus('${c.id}', this.value, this)">${statusOptions}</select></td>
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
        <h3>${escapeHtml(c.name)}</h3>
        <button class="star-btn ${s.starred ? "active" : ""}" onclick="toggleStar('${c.id}')" aria-pressed="${s.starred}" aria-label="收藏 ${escapeHtml(c.name)}">${starIcon}</button>
      </div>
      <div class="card-body">
        <span class="type-tag ${escapeHtml(c.type)}">${escapeHtml(c.type)}</span>${programTag}
        ${c.location ? `<span style="margin-left:6px;font-size:12px;color:var(--text-secondary)">📍 ${escapeHtml(c.location)}</span>` : ""}
        <span style="margin-left:6px">${deadlineHTML(c.deadline)}</span>
      </div>
      <div class="card-jobs">${jobTags}</div>
      <div class="card-info">${escapeHtml(c.note)}</div>
      <div class="card-footer">
        ${refHTML}
        ${c.link ? `<a href="${safeLink(c.link)}" target="_blank" rel="noopener" class="link-btn">投递</a>` : ""}
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
  let filtered = [...COMPANIES];

  if (currentFilter === "starred") filtered = filtered.filter(c => getState(c.id).starred);
  else if (currentFilter === "pending") filtered = filtered.filter(c => getState(c.id).status === "未投递");
  else if (currentFilter === "active") filtered = filtered.filter(c => ACTIVE_STATUSES.includes(getState(c.id).status));
  else if (currentFilter === "done") filtered = filtered.filter(c => DONE_STATUSES.includes(getState(c.id).status));
  else if (currentFilter !== "all") filtered = filtered.filter(c => c.category.includes(currentFilter));

  if (currentSearch) {
    filtered = filtered.filter(c => {
      const searchStr = `${c.name} ${c.jobs.join(" ")} ${c.location} ${c.category.join(" ")} ${c.note} ${c.refCode || ""} ${c.program || ""}`.toLowerCase();
      return searchStr.includes(currentSearch);
    });
  }

  // 排序：字段为主，收藏作为同值 tie-breaker（收藏优先）
  if (currentSort.field) {
    filtered.sort((a, b) => {
      const sa = getState(a.id).starred ? 1 : 0;
      const sb = getState(b.id).starred ? 1 : 0;
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
      if (cmp !== 0) return currentSort.asc ? cmp : -cmp;
      // 同值 → 收藏优先
      return sb - sa;
    });
  } else {
    // 默认排序：收藏优先 + 批次类型
    filtered.sort((a, b) => {
      const sa = getState(a.id).starred ? 1 : 0;
      const sb = getState(b.id).starred ? 1 : 0;
      if (sb !== sa) return sb - sa;
      return (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
    });
  }

  if (currentView === "table") renderTable(filtered);
  else renderCards(filtered);
}

// ============================================================
// 事件绑定
// ============================================================
document.getElementById("searchInput").addEventListener("input", debounce(function(e) {
  currentSearch = e.target.value.toLowerCase();
  applyFilters();
}, 200));

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", function() {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    this.classList.add("active");
    currentFilter = this.dataset.filter;
    applyFilters();
  });
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
  document.getElementById("tableViewBtn").classList.toggle("active", view === "table");
  document.getElementById("cardViewBtn").classList.toggle("active", view === "card");
  applyFilters();
}

// ============================================================
// 状态操作（以稳定 ID 为参数，避免注入）
// ============================================================
function toggleStar(id) {
  getState(id).starred = !getState(id).starred;
  saveState();
  renderDashboard();
  applyFilters();
}

function setStatus(id, status, el) {
  getState(id).status = status;
  el.setAttribute("data-status", status);
  saveState();
  renderDashboard();
}

function setNote(id, note) {
  getState(id).note = note;
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
  const rows = [["序号", "公司", "类型", "专项", "岗位", "地点", "截止日期", "内推码", "投递状态", "个人备注"]];
  COMPANIES.forEach((c, i) => {
    const s = getState(c.id);
    rows.push([i + 1, c.name, c.type, c.program || "", c.jobs.join("、"), c.location, c.deadline || "", c.refCode || "链接即内推", s.status, s.note]);
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
function encodeSyncCode() {
  const payload = { v: 2, c: userState.companies };
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
  modal.style.display = "flex";

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
  stopQrScanner();
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
    if (!payload || payload.v !== 2 || !payload.c) throw new Error("格式错误");
    mergeSync(payload.c);
    showToast("✅ 状态同步完成");
    closeSyncModal();
  } catch(e) {
    showToast("同步码无效: " + e.message);
  }
}

function mergeSync(incoming) {
  mergeIncoming(incoming);
}

// 摄像头扫码（html5-qrcode）
let qrScanner = null;

async function startQrScanner() {
  // 确保上一个实例彻底释放，避免重复 start 报错
  await stopQrScanner();
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
          if (payload && payload.v === 2 && payload.c) {
            mergeSync(payload.c);
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
switchView(currentView); // 同步初始视图（修复移动端首屏显示空表格的问题）
