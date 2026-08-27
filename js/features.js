/* ============================================================
 * qiuzhao-tracker · 交互层：到期提醒·一键复制·分级筛选面板·事件绑定·状态操作·邮件动态·岗位管理·主题
 * 由 app.js v6.0 重构拆分（勿手工编辑此说明）
 * ============================================================ */
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
    // v7.4: 本地日期拼接（toISOString 是 UTC，本地午夜后会被算成前一天导致重复提醒）
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
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
  // v7.2: 隐藏已截止开关选中态
  const he = document.getElementById("hideExpiredCb");
  if (he) he.checked = filters.hideExpired;
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
      `<span class="fs-item" data-dim="${it.dim}">${escapeHtml(it.text)}<button class="fs-x" onclick="removeFilterItem('${jsArg(it.dim)}','${jsArg(it.val)}')" aria-label="移除 ${escapeHtml(it.text)}">✕</button></span>`
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
  const tv = document.getElementById("todoView");
  if (tv) tv.classList.toggle("hidden", view !== "todo");
  document.getElementById("tableViewBtn").classList.toggle("active", view === "table");
  document.getElementById("cardViewBtn").classList.toggle("active", view === "card");
  const tvBtn = document.getElementById("todoViewBtn");
  if (tvBtn) tvBtn.classList.toggle("active", view === "todo");
  applyFilters();
}

// v7.2: 隐藏已截止（未投递）开关
function toggleHideExpired(v) {
  filters.hideExpired = !!v;
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
  refreshTodos();
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
  if (prev !== status) recordHistory(id, { from: prev, to: status });  // v7.2 进度历史
  touchState(id);
  el.setAttribute("data-status", status);
  saveState();
  renderDashboard();
  refreshTodos();
  renderWeekly();
  // P2-3: 状态变更视觉反馈
  if (prev !== status) {
    const c = COMPANIES.find(x => x.id === id);
    showToast(`${c ? c.name : id}：${prev} → ${status}`);
  }
  applyFilters();  // v7.4: 状态筛选/排序下及时重排（此前只刷新横带，列表不更新）
}

// ============================================================
// v6.0: 邮件动态追踪（WorkBuddy 扫描邮箱 → dynamics.json → 网站确认应用）
// ============================================================
const DYN_SEEN_KEY = "qiuzhao2027.dynSeen";
const DYN_TYPE_LABEL = { interview: "面试", written: "笔试", offer: "Offer", reject: "拒信", evaluation: "评价", deadline: "截止", other: "线索" };

// 邮件分类（纯函数可测）：按标题+发件人识别秋招通知类型；营销邮件仅保留"新公司校招线索"
function classifyMail(title, from) {
  const t = String(title || "");
  const f = String(from || "").toLowerCase();
  if (/lietou-edm|zhaopin\.cn|wisdomore|智联|猎聘/.test(f)) {
    return /(校招|秋招).{0,6}(启动|开始)|空中宣讲会/.test(t) ? "other" : null;
  }
  if (/录取|报到须知|恭喜.*录/.test(t)) return "offer";
  if (/面试/.test(t)) return "interview";
  if (/笔试/.test(t)) return "written";
  if (/(逾期视为放弃|报名截止|投递截止)/.test(t)) return "deadline";
  if (/遗憾|未能通过|不匹配/.test(t)) return "reject";
  if (/评价邀请|满意度/.test(t)) return "evaluation";
  if (/校招|秋招|空中宣讲会/.test(t)) return "other";
  return null;
}

// 过滤已处理动态并按时间倒序（纯函数可测）
function filterNewDynamics(items, seenIds) {
  const seen = new Set(seenIds || []);
  return (items || []).filter(it => !seen.has(it.id)).sort((a, b) => String(b.time).localeCompare(String(a.time)));
}

function getDynSeen() {
  try { return JSON.parse(localStorage.getItem(DYN_SEEN_KEY)) || []; } catch(e) { return []; }
}
function markDynSeen(id) {
  const s = getDynSeen();
  if (!s.includes(id)) { s.push(id); try { localStorage.setItem(DYN_SEEN_KEY, JSON.stringify(s)); } catch(e) {} }
}

// v7.3: 待办三态——seen=已分诊(出动态条) / done=已完成(待办视图沉底) / ignored=彻底隐藏
const DYN_DONE_KEY = "qiuzhao2027.dynDone";
const DYN_IGNORED_KEY = "qiuzhao2027.dynIgnored";
function getDynDone() {
  try { return JSON.parse(localStorage.getItem(DYN_DONE_KEY)) || []; } catch(e) { return []; }
}
function markDynDone(id) {
  const s = getDynDone();
  if (!s.includes(id)) { s.push(id); try { localStorage.setItem(DYN_DONE_KEY, JSON.stringify(s)); } catch(e) {} }
  markDynSeen(id);  // 完成即出动态条
}
function unmarkDynDone(id) {
  const s = getDynDone().filter(x => x !== id);
  try { localStorage.setItem(DYN_DONE_KEY, JSON.stringify(s)); } catch(e) {}
}
function getDynIgnored() {
  try { return JSON.parse(localStorage.getItem(DYN_IGNORED_KEY)) || []; } catch(e) { return []; }
}
function markDynIgnored(id) {
  const s = getDynIgnored();
  if (!s.includes(id)) { s.push(id); try { localStorage.setItem(DYN_IGNORED_KEY, JSON.stringify(s)); } catch(e) {} }
  markDynSeen(id);  // 忽略即出动态条
}
function unmarkDynIgnored(id) {  // v7.4: 忽略回收站的恢复入口
  const s = getDynIgnored().filter(x => x !== id);
  try { localStorage.setItem(DYN_IGNORED_KEY, JSON.stringify(s)); } catch(e) {}
}

async function loadDynamics() {
  let data;
  try {
    const res = await fetch("dynamics.json?t=" + Date.now());
    if (!res.ok) return;
    data = await res.json();
  } catch(e) { return; }
  window.__dynAll = data.items || [];  // v7.3: 全量保留给待办视图（含远期事项）
  renderDynamicsBar(filterNewDynamics(window.__dynAll, getDynSeen()));
}

// ============================================================
// v7.5: 爬虫发现公司候选池（discovered.json → 合并进目录，🆕 徽章）
// 数据契约见 README：WorkBuddy 定时爬取 → 归一化去重 → 写 discovered.json → 推送
// ============================================================
async function loadDiscovered() {
  let data;
  try {
    const res = await fetch("discovered.json?t=" + Date.now());
    if (!res.ok) return;  // 404 属正常（爬虫还没产出过）
    data = await res.json();
  } catch(e) { return; }
  const items = Array.isArray(data && data.items) ? data.items : [];
  if (!items.length) return;
  const knownNames = new Set(COMPANIES.map(c => normalizeCompanyName(c.name)));
  const knownIds = new Set(COMPANIES.map(c => c.id));
  let added = 0;
  items.forEach(it => {
    if (!it || !it.id || !it.name) return;
    // 双保险去重（WorkBuddy 入库前已去重，这里再挡一次）：id 撞车 / 名归一化撞车都跳过
    if (knownIds.has(it.id) || knownNames.has(normalizeCompanyName(it.name))) return;
    const c = discoveredToCompany(it);
    COMPANIES.push(c);
    knownIds.add(c.id);
    knownNames.add(normalizeCompanyName(c.name));
    COMPANY_IDS.add(c.id);  // 让导出/导入/云同步认识这些 id
    added++;
  });
  if (added > 0) {
    renderDashboard();
    refreshFilterUI();
    refreshTodos();
    applyFilters();
    showToast(`🆕 新发现 ${added} 家公司，已加入列表（行业筛选可选「新发现」）`);
  }
}

function toggleDynList() {
  document.getElementById("dynList").classList.toggle("hidden");
}

function renderDynamicsBar(items) {
  const bar = document.getElementById("dynBar");
  if (!bar) return;
  if (!items.length) { bar.classList.add("hidden"); refreshTodos(); return; }
  bar.classList.remove("hidden");
  document.getElementById("dynCount").textContent = items.length;
  document.getElementById("dynList").innerHTML = items.map(it => {
    const safeType = DYN_TYPE_LABEL[it.type] ? it.type : "other";  // v7.4: type 白名单，防 class 属性注入
    return `<div class="dyn-item">
      <span class="dyn-type dyn-type-${safeType}">${DYN_TYPE_LABEL[safeType]}</span>
      <div class="dyn-main">
        <strong>${escapeHtml(it.company)}</strong>${it.jobName ? ` · ${escapeHtml(it.jobName)}` : ""}
        <div class="dyn-sum">${escapeHtml(it.summary || it.title)}</div>
      </div>
      ${it.suggestStatus ? `<button class="btn btn-primary dyn-apply" onclick="applyDynamic('${jsArg(it.id)}')">采纳</button>` : ""}
      <button class="job-row-del" onclick="ignoreDynamic('${jsArg(it.id)}')" aria-label="忽略该动态">✕</button>
    </div>`;
  }).join("");
  refreshTodos();  // 动态变化后重算待办（横带+待办视图）
}

// 采纳动态：按 id 从 __dynAll 取回对象；匹配到系统公司 → 岗位级状态更新；新公司 → 提示去表格添加
function applyDynamic(id) {
  const it = (window.__dynAll || []).find(x => x.id === id);
  if (!it || !it.suggestStatus) return;
  markDynSeen(id);
  const companyId = it.companyId;
  if (companyId && COMPANIES.some(x => x.id === companyId)) {
    const status = it.suggestStatus;
    const jobName = (it.jobName || "").trim().slice(0, 30) || "默认岗位";  // v7.4: 不再拿邮件标题当岗位名污染 jobs
    const s = getState(companyId);
    const prev = s.jobs[jobName] || null;
    if (!shouldAdoptStatus(prev, status)) {  // v7.4: 进度只前进不回退（晚到的旧邮件不覆盖新状态）
      showToast(`⏭️ ${it.company} · ${jobName} 已是「${prev}」，不回退为「${status}」`);
      loadDynamics();
      return;
    }
    s.jobs[jobName] = status;
    s.status = deriveCompanyStatus(s.jobs, s.status);
    if (prev !== status) recordHistory(companyId, { job: jobName, from: prev, to: status });  // v7.2 进度历史
    touchState(companyId);
    saveState();
    refreshAll();
    showToast(`✅ 已采纳：${it.company} · ${jobName} → ${status}`);
  } else {
    showToast(`📌 新公司「${it.company}」不在系统中，请加入腾讯文档总表后对我说"同步"`);
  }
  loadDynamics();
}

function ignoreDynamic(id) {
  markDynIgnored(id);  // v7.3: 忽略 = 出动态条 + 不进待办视图
  renderDynamicsBar(filterNewDynamics(window.__dynAll || [], getDynSeen()));
}

// ============================================================
// v7.3: 待办视图交互 + 日历导出（.ics）
// ============================================================
// 视图按钮统一入口：按索引从 todoViewOrder（渲染展平顺序）取回待办对象
function todoAction(i, act) {
  const it = todoViewOrder[i];  // v7.4: 分组渲染会重排（done/ignored 沉底），不能用 todoItemsCache 的排序序
  if (!it) return;
  if (act === "ics") { downloadICS(it); return; }
  if (act === "done") { markDynDone(it.dynId); showToast("✅ 已完成：" + it.company + " · " + it.label); }
  else if (act === "undo") { unmarkDynDone(it.dynId); }
  else if (act === "ignore") { markDynIgnored(it.dynId); showToast("🗑 已忽略，可在待办视图底部「已忽略」分组恢复"); }
  else if (act === "unignore") { unmarkDynIgnored(it.dynId); }
  else return;
  renderDynamicsBar(filterNewDynamics(window.__dynAll || [], getDynSeen()));  // 内部调 refreshTodos() 重算待办
}

// ICS 文本转义（纯函数）
function icsEscape(s) {
  return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// 生成 .ics 日历文件内容（纯函数可测）
// ev: { company, jobName, label, summary, actionUrl, eventTime?, dueDate?, dynId? }
function buildICS(ev) {
  const p2 = n => String(n).padStart(2, "0");
  // v7.4: 时间统一 UTC（RFC 5545 要求 DTSTAMP 用 UTC），跨时区导入日历不漂移
  const fmtUTC = d => `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}00Z`;
  const fmtD = d => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
  // v7.4: 稳定 UID（同一事项重复导入日历不产生重复事件；此前用 Date.now() 每次生成新事件）
  const uidSrc = ev.dynId || `${ev.company}|${ev.jobName || ""}|${ev.label}|${ev.eventTime || ev.dueDate || ""}`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//qiuzhao-tracker//CN", "BEGIN:VEVENT",
    "UID:" + icsEscape(uidSrc) + "@qiuzhao-tracker", "DTSTAMP:" + fmtUTC(new Date())];
  if (ev.eventTime) {
    const s = new Date(ev.eventTime);
    lines.push("DTSTART:" + fmtUTC(s), "DTEND:" + fmtUTC(new Date(s.getTime() + 3600000)));  // 默认 1 小时
  } else if (ev.dueDate) {
    const d = parseLocalDate(ev.dueDate);  // 全天事件
    if (d) lines.push("DTSTART;VALUE=DATE:" + fmtD(d));
  }
  lines.push("SUMMARY:" + icsEscape(`【秋招】${ev.company}${ev.jobName ? "·" + ev.jobName : ""} ${ev.label}`));
  if (ev.summary) lines.push("DESCRIPTION:" + icsEscape(ev.summary));
  if (ev.actionUrl && /^https?:\/\//i.test(ev.actionUrl)) lines.push("URL:" + ev.actionUrl);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadICS(ev) {
  const blob = new Blob([buildICS(ev)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ev.company}-${ev.label}.ics`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("📅 日历文件已下载，导入手机日历即可");
}

// ============================================================
// v6: 岗位级投递管理（一个公司可投多个岗位，各自独立进度）
// ============================================================
let jobModalId = null;

function refreshAll() {
  renderDashboard();
  refreshTodos();   // 必须先重算待办缓存，applyFilters 在待办视图会读它
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
  recordHistory(id, { job: name, from: null, to: "已投递" });  // v7.2 进度历史
  touchState(id);
  saveState();
  renderJobModal(id);
  refreshAll();
  input.value = "";
  input.focus();
}

function removeAppliedJob(id, name) {
  const s = getState(id);
  const prev = s.jobs[name];
  delete s.jobs[name];
  s.status = deriveCompanyStatus(s.jobs, s.status);  // 聚合写回
  recordHistory(id, { job: name, from: prev || null, to: null });  // v7.2 进度历史
  touchState(id);
  saveState();
  renderJobModal(id);
  refreshAll();
}

function setJobStatus(id, name, status) {
  const s = getState(id);
  const prev = s.jobs[name] || null;
  s.jobs[name] = status;
  s.status = deriveCompanyStatus(s.jobs, s.status);  // 聚合写回
  if (prev !== status) recordHistory(id, { job: name, from: prev, to: status });  // v7.2 进度历史
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
      <select class="status-select" aria-label="岗位 ${escapeHtml(name)} 状态" onchange="setJobStatus('${jsArg(id)}','${jsArg(name)}',this.value)">
        ${STATUS_OPTIONS.map(o => `<option value="${o}" ${s.jobs[name] === o ? "selected" : ""}>${o}</option>`).join("")}
      </select>
      <button class="job-row-del" onclick="removeAppliedJob('${jsArg(id)}','${jsArg(name)}')" aria-label="删除岗位 ${escapeHtml(name)}">✕</button>
    </div>`
  ).join("");
  document.getElementById("jobModalList").innerHTML = rows || `<div class="job-empty">还没记录投递岗位，输入岗位名添加 👇</div>`;
  // v7.2: 进度历史时间线（最近 10 条，新→旧）
  const histEl = document.getElementById("jobModalHistory");
  if (histEl) {
    const p2 = n => String(n).padStart(2, "0");
    const hist = (s.history || []).slice(-10).reverse();
    histEl.innerHTML = hist.length
      ? `<div class="tl-head">📜 进度历史</div>` + hist.map(h => {
          const d = new Date(h.time);
          const when = `${d.getMonth() + 1}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
          const text = h.job
            ? `${h.job}：${h.from || "新建"} → ${h.to || "已删除"}`
            : `${h.from || "—"} → ${h.to || "—"}`;
          return `<div class="tl-row"><span class="tl-time">${when}</span><span class="tl-text">${escapeHtml(text)}</span></div>`;
        }).join("")
      : "";
  }
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
