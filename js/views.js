/* ============================================================
 * qiuzhao-tracker · 视图层：仪表盘·截止日期·三视图·今日待办·本周动态
 * 由 app.js v6.0 重构拆分（勿手工编辑此说明）
 * ============================================================ */
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
  // v6.0: 邮箱动态中的待办（Offer 待回复 / 截止提醒 / 面试笔试动态）——无需采纳即可提醒
  (window.__dynItems || []).forEach(it => {
    if (!["offer", "written", "interview", "deadline"].includes(it.type)) return;
    let days = null;
    if (it.dueDate) {
      const dl = parseLocalDate(it.dueDate);
      if (dl) { dl.setHours(0, 0, 0, 0); days = Math.round((dl - now) / 86400000); }
    }
    const typeLabel = DYN_TYPE_LABEL[it.type] || it.type;
    todo.push({
      c: { name: it.company },
      type: it.type === "deadline" ? "deadline" : "active",
      days,
      label: `${typeLabel}${days !== null && days >= 0 ? ` · ${days === 0 ? "今天截止" : days + "天内需处理"}` : "进行中"}`
    });
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
