/* ============================================================
 * qiuzhao-tracker · 视图层：仪表盘·截止日期·三视图·今日待办·本周动态
 * 由 app.js v6.0 重构拆分（勿手工编辑此说明）
 * ============================================================ */
// ============================================================
// 仪表盘
// ============================================================
function renderDashboard() {
  const stats = { total: 0, applied: 0, test: 0, interview: 0, offer: 0, rejected: 0, starred: 0, pending: 0 };
  // v9.2: 仪表盘=全局进度总览，跨内推+校招池合并统计（COMPANIES 单数组 + CI 唯一性约束，天然去重，
  // 同一家公司内推/校招链接不同也只算一条）；点击卡片统一下钻到「全部」tab，保证数字与结果口径一致
  filterBySource(COMPANIES, "all").forEach(c => {
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
// v7.8: 待办视图下点击卡片先切回当前来源的列表视图，再应用筛选（口径与卡片数字一致）
function ensureListView() {
  if (currentView === "todo") switchView(preferredListView || "table");
}

// v9.2: 仪表盘数字是全局口径，点击卡片统一下钻到「全部」tab 展示合并结果
function ensureAllSource() {
  if (currentSource !== "all") switchTab("all");
}

function viewByStatus(status) {
  ensureListView();
  ensureAllSource();
  if (filters.status.has(status)) filters.status.delete(status);
  else { filters.status.clear(); filters.status.add(status); }
  refreshFilterUI();
  applyFilters();
}

function viewStarred() {
  ensureListView();
  ensureAllSource();
  filters.starred = !filters.starred;
  refreshFilterUI();
  applyFilters();
}

function viewAll() {
  ensureListView();
  ensureAllSource();
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
  // v8.2: 企业性质 + 行业标签（"新发现"/"活动"是标记值，不展示）
  const natureTag = c.nature ? `<span class="nature-tag nature-${escapeHtml(c.nature)}">${escapeHtml(c.nature)}</span>` : "";
  const catTags = c.category.filter(x => x !== "新发现" && x !== "活动")
    .map(x => `<span class="cat-tag">${highlightText(x, filters.keyword)}</span>`).join("");
  const refHTML = c.refCode
    ? `<span class="ref-code" onclick="copyCode(this,'${c.id}')" title="点击复制">${escapeHtml(c.refCode)}</span>`
    : `<span class="ref-none">${c.discovered ? "官网投递" : "链接即内推"}</span>`;
  return { s, statusOptions, jobTags, programTag, natureTag, catTags, refHTML };
}

// ============================================================
// 渲染 —— 表格视图
// ============================================================
// v7.5: 公司名渲染——有官网清单则链接化，爬虫发现的公司带 🆕 徽章
function nameWithSite(c, keyword) {
  const inner = highlightText(c.name, keyword);
  const badge = c.discovered ? `<span class="disc-badge" title="爬虫新发现，设状态即开始跟踪">🆕</span> ` : "";
  const gradBadge = c.inPool ? `<span class="disc-badge" title="已入内推清单，校招池与内推 tab 共享同一跟踪状态">🔗</span> ` : "";
  const quota = Number.isInteger(c.quota) ? `<span class="quota-tag" title="该集团/批次可投递的岗位数上限">可投${c.quota}岗</span>` : "";
  const url = (window.OFFICIAL_SITES || {})[c.id] || (c.discovered ? c.link : "");
  const safe = url ? escapeHtml(safeLink(url)) : "";
  const nameHtml = (safe && safe !== "#")
    ? `<a class="company-site" href="${safe}" target="_blank" rel="noopener" title="官网校招页">${inner}</a>`
    : inner;
  return badge + gradBadge + nameHtml + quota;
}

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
    const { s, statusOptions, jobTags, programTag, natureTag, catTags, refHTML } = buildCommonHTML(c);
    const starredClass = s.starred ? "favorited" : "";
    const starIcon = s.starred ? "⭐" : "☆";

    return `
    <tr class="${starredClass}">
      <td><button class="star-btn ${s.starred ? "active" : ""}" onclick="toggleStar('${c.id}')" data-star-id="${c.id}" aria-pressed="${s.starred}" aria-label="收藏 ${escapeHtml(c.name)}">${starIcon}</button></td>
      <td><strong>${nameWithSite(c, filters.keyword)}</strong></td>
      <td><span class="type-tag ${escapeHtml(c.type)}">${escapeHtml(c.type)}</span>${programTag}${natureTag}</td>
      <td><div class="job-tags">${jobTags}</div></td>
      <td class="location">${highlightText(c.location, filters.keyword) || "—"}</td>
      <td>${deadlineHTML(c.deadline)}</td>
      <td>${refHTML}</td>
      <td>
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
          ${c.link ? `<a href="${escapeHtml(safeLink(c.link))}" target="_blank" rel="noopener" class="link-btn">投递</a>` : ""}
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
    const { s, statusOptions, jobTags, programTag, natureTag, catTags, refHTML } = buildCommonHTML(c);
    const starredClass = s.starred ? "favorited" : "";
    const starIcon = s.starred ? "⭐" : "☆";

    return `
    <div class="job-card ${starredClass}">
      <div class="card-header">
        <h3>${nameWithSite(c, filters.keyword)}</h3>
        <button class="star-btn ${s.starred ? "active" : ""}" onclick="toggleStar('${c.id}')" data-star-id="${c.id}" aria-pressed="${s.starred}" aria-label="收藏 ${escapeHtml(c.name)}">${starIcon}</button>
      </div>
      <div class="card-body">
        <span class="type-tag ${escapeHtml(c.type)}">${escapeHtml(c.type)}</span>${programTag}${natureTag}${catTags}
        ${c.location ? `<span style="margin-left:6px;font-size:12px;color:var(--text-secondary)">📍 ${highlightText(c.location, filters.keyword)}</span>` : ""}
        <span style="margin-left:6px">${deadlineHTML(c.deadline)}</span>
      </div>
      <div class="card-jobs">${jobTags}</div>
      ${Object.keys(s.jobs).length ? `<div class="card-applied-jobs">${Object.keys(s.jobs).map(n => `<span class="job-chip" data-status="${escapeHtml(s.jobs[n])}">${escapeHtml(n)}·${escapeHtml(s.jobs[n])}</span>`).join("")}</div>` : ""}
      <div class="card-info">${escapeHtml(c.note)}</div>
      <div class="card-footer">
        ${refHTML}
        ${c.link ? `<a href="${escapeHtml(safeLink(c.link))}" target="_blank" rel="noopener" class="link-btn">投递</a>` : ""}
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
// v9.3: resetPage 默认 true——筛选/排序/搜索/切 tab 都回到第 1 页；
// 仅翻页（goPage）和表格/卡片视图切换（switchView）传 false 保持页码
function applyFilters(resetPage) {
  saveUIPrefs();  // v7.2: 所有筛选/排序/视图操作都汇聚到这里，顺带持久化
  if (resetPage !== false) currentPage = 1;
  // v7.7: 先按来源分页（内推/校招池），再多条件筛选（同维 OR / 跨维 AND），纯函数 matchFilters 驱动
  let filtered = filterBySource(COMPANIES, currentSource).filter(c => matchFilters(c, filters, getState));

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
  } else if (currentSource === "pool") {
    // v7.7: 校招池默认按集团分组（阿里系等子集团聚在一起），组内按名称
    filtered.sort((a, b) => {
      const ga = a.parent || a.id, gb = b.parent || b.id;
      if (ga !== gb) return ga.localeCompare(gb, "zh-CN");
      return (a.parent ? 1 : 0) - (b.parent ? 1 : 0) || a.name.localeCompare(b.name, "zh-CN");
    });
  } else {
    // v5.3: 默认排序按批次类型（稳定可预期；收藏只做标记不参与排序，避免与局部更新矛盾）
    filtered.sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9));
  }

  // v9.3: 分页切片（待办视图不分页，它有自己的完整面板）
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const pageItems = currentView === "todo" ? filtered
    : filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (currentView === "table") renderTable(pageItems);
  else if (currentView === "todo") renderTodoView();
  else renderCards(pageItems);
  renderPagination(total, totalPages);

  // 无结果提示带搜索词（避免用户困惑"怎么没反应"）
  const noRes = document.getElementById("noResults");
  if (noRes) {
    if (currentView === "todo") noRes.style.display = "none";  // v7.4: 待办视图有自己的空态
    noRes.querySelector("p").textContent = filtered.length === 0 && filters.keyword
      ? `没有找到与"${filters.keyword}"匹配的企业 😕`
      : "没有找到匹配的企业 😕";
  }
}

// v9.3: 页码窗口（纯函数可测）：当前页 ±2 + 首尾页
function pageWindow(current, totalPages) {
  const pages = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - current) <= 2) pages.push(p);
  }
  return pages;
}

// v9.3: 分页条（超过 1 页才显示）
function renderPagination(total, totalPages) {
  const el = document.getElementById("pagination");
  if (!el) return;
  if (currentView === "todo" || totalPages <= 1) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  el.classList.remove("hidden");
  const pages = pageWindow(currentPage, totalPages);
  let last = 0;
  const nums = pages.map(p => {
    const gap = last && p - last > 1 ? `<span class="pg-gap">…</span>` : "";
    last = p;
    return gap + `<button class="pg-num ${p === currentPage ? "active" : ""}" onclick="goPage(${p})" ${p === currentPage ? 'aria-current="page"' : ""}>${p}</button>`;
  }).join("");
  el.innerHTML =
    `<button class="pg-nav" onclick="goPage(${currentPage - 1})" ${currentPage === 1 ? "disabled" : ""} aria-label="上一页">‹</button>` +
    nums +
    `<button class="pg-nav" onclick="goPage(${currentPage + 1})" ${currentPage === totalPages ? "disabled" : ""} aria-label="下一页">›</button>` +
    `<span class="pg-info">第 ${currentPage}/${totalPages} 页 · 共 ${total} 家</span>`;
}

function goPage(p) {
  const total = filterBySource(COMPANIES, currentSource).filter(c => matchFilters(c, filters, getState)).length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.min(Math.max(1, p), totalPages);
  applyFilters(false);
  const anchor = document.querySelector(".nav-row");
  if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
}


// ============================================================
// 待办（v7.3：横带=2天内紧急事项+入口；✅待办 视图承载全部事项含远期）
// 状态模型：邮件事项在动态条分诊（新到→采纳/忽略出动态条）；待办视图里 活跃↔完成 可往返，忽略彻底隐藏
// ============================================================
// 统一待办构建（纯函数可测）
// 来源：全部邮件动态（忽略的不进）+ 公司全部未来投递截止 + 进行中状态
function buildTodoItems(companies, getSt, dynAll, doneIds, ignoredIds, now) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const done = new Set(doneIds || []);
  const ignored = new Set(ignoredIds || []);
  const items = [];
  const mailKeys = new Set();  // 状态来源去重：同公司同类型已有邮件待办则不重复
  const addTimeInfo = (obj, when) => {
    if (!when) { obj.urgency = "none"; obj.days = null; obj.sortKey = Number.MAX_SAFE_INTEGER; return; }
    const wd = new Date(when); wd.setHours(0, 0, 0, 0);  // days 按日历日差计算（23:59 截止不算多一天）
    obj.days = Math.round((wd - today) / 86400000);
    obj.sortKey = when.getTime();
    obj.urgency = obj.days < 0 ? "overdue" : obj.days === 0 ? "today" : obj.days <= 3 ? "soon" : obj.days <= 7 ? "week" : "later";
  };
  (dynAll || []).forEach(it => {
    if (!["offer", "written", "interview", "deadline"].includes(it.type)) return;
    let when = null;
    if (it.eventTime) { const t = new Date(it.eventTime); if (!isNaN(t)) when = t; }
    else if (it.dueDate) { const t = parseLocalDate(it.dueDate); if (t) { t.setHours(23, 59, 0, 0); when = t; } }
    const obj = {
      source: "mail", dynId: it.id, companyId: it.companyId || null,
      company: it.company, jobName: it.jobName || "",
      kind: (it.type === "interview" || it.type === "written") ? "event" : "action",
      type: it.type,
      label: (DYN_TYPE_LABEL[it.type] || it.type) + (it.round ? "·" + it.round : ""),
      summary: it.summary || it.title || "",
      actionUrl: it.actionUrl || it.link || "",
      eventTime: it.eventTime || null, dueDate: it.dueDate || null,
      done: done.has(it.id),
      ignored: ignored.has(it.id)   // v7.4: 忽略项保留进列表（待办视图底部回收站分组），不再直接剔除
    };
    addTimeInfo(obj, when);
    if (!obj.done && !obj.ignored) mailKeys.add((it.companyId || it.company) + "|" + it.type);  // v7.4: done/ignored 不占去重键
    items.push(obj);
  });
  (companies || []).forEach(c => {
    const s = getSt(c.id);
    if (DONE_STATUSES.includes(s.status)) return;
    if (c.deadline) {
      const dl = parseLocalDate(c.deadline);
      if (dl) {
        dl.setHours(23, 59, 0, 0);
        const wd = new Date(dl); wd.setHours(0, 0, 0, 0);
        const d = Math.round((wd - today) / 86400000);
        if (d >= 0) {  // v7.3: 全部未来截止都进待办视图（横带只挑 ≤2 天）
          const obj = { source: "company", companyId: c.id, company: c.name, jobName: "", kind: "action", type: "deadline", label: "投递截止", summary: "", actionUrl: c.link || "", eventTime: null, dueDate: c.deadline, done: false };
          addTimeInfo(obj, dl);
          items.push(obj);
        }
      }
    }
    if (s.status === "笔试中" || s.status === "面试中") {
      const type = s.status === "笔试中" ? "written" : "interview";
      if (mailKeys.has(c.id + "|" + type) || mailKeys.has(c.name + "|" + type)) return;  // 邮件已覆盖（id 或公司名兜底），避免重复
      const obj = { source: "status", companyId: c.id, company: c.name, jobName: "", kind: "event", type, label: s.status + "", summary: "", actionUrl: "", eventTime: null, dueDate: null, done: false, ignored: false };
      addTimeInfo(obj, null);
      items.push(obj);
    }
  });
  return items.sort((a, b) => a.sortKey - b.sortKey || String(a.company).localeCompare(String(b.company), "zh-CN"));
}

// 待办时间文案（纯函数可测）：今天 17:00 / 今天截止 / 2天后 / 已逾期1天
function fmtTodoWhen(it) {
  if (it.days === null || it.days === undefined) return "";
  if (it.days < 0) return `已逾期${-it.days}天`;
  if (it.days === 0 && it.eventTime) {
    const t = new Date(it.eventTime);
    return `今天 ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  }
  if (it.days === 0) return "今天截止";
  return `${it.days}天后`;
}

// 分组（纯函数可测）：已忽略/已完成沉底，其余按紧急度
const TODO_GROUPS = [
  { key: "overdue", label: "⚠️ 已逾期" }, { key: "today", label: "🔴 今天" },
  { key: "soon", label: "🟠 3天内" }, { key: "week", label: "🟡 本周" },
  { key: "later", label: "🟢 更晚" }, { key: "none", label: "⚪ 无明确时间" },
  { key: "done", label: "✅ 已完成" }, { key: "ignored", label: "🗑 已忽略（可恢复）" }
];
function groupTodos(items) {
  const map = {};
  TODO_GROUPS.forEach(g => { map[g.key] = []; });
  (items || []).forEach(it => map[it.ignored ? "ignored" : it.done ? "done" : (it.urgency || "none")].push(it));
  return TODO_GROUPS.filter(g => map[g.key].length).map(g => ({ ...g, items: map[g.key] }));
}

let todoItemsCache = [];  // 全量待办（排序序），供横带统计
let todoViewOrder = [];   // v7.4: 待办视图渲染展平顺序（分组重排后），供 todoAction 按索引取回对象

function refreshTodos() {
  todoItemsCache = buildTodoItems(COMPANIES, getState, window.__dynAll || [], getDynDone(), getDynIgnored(), new Date());
  renderTodo();
  if (typeof updateNavUI === "function") updateNavUI();  // v7.7: 待办 tab 紧急角标
  if (currentView === "todo") renderTodoView();
}

// 顶部横带：2天内紧急项摘要 + 入口按钮（点击跳 ✅待办 视图）
function renderTodo() {
  const bar = document.getElementById("todoBar");
  const active = todoItemsCache.filter(t => !t.done && !t.ignored);
  if (active.length === 0) { bar.classList.add("hidden"); bar.innerHTML = ""; return; }
  bar.classList.remove("hidden");
  const urgent = active.filter(t => t.days !== null && t.days <= 2);  // 已逾期/今天/明天/后天
  const briefs = urgent.slice(0, 4).map(t =>
    `<span class="todo-item ${t.days <= 0 ? "urgent" : ""}">${escapeHtml(t.company)}·${escapeHtml(t.label)} ${escapeHtml(fmtTodoWhen(t))}</span>`
  ).join("");
  bar.innerHTML = urgent.length
    ? `⏰ <strong>紧急待办 ${urgent.length} 项</strong>：${briefs}${urgent.length > 4 ? " …" : ""} <button class="todo-more" onclick="switchView('todo')">全部 ${active.length} 项 ▸</button>`
    : `📋 <strong>待办 ${active.length} 项</strong>（2天内无紧急事项） <button class="todo-more" onclick="switchView('todo')">查看全部 ▸</button>`;
}

// 待办视图：分组渲染全部事项（含远期），操作：📅导出日历 / ✓完成 / ↩恢复 / ✕忽略
function renderTodoView() {
  const view = document.getElementById("todoView");
  if (!view) return;
  const groups = groupTodos(todoItemsCache);
  todoViewOrder = [];  // v7.4: 展平顺序与渲染严格一致，按钮索引不会错位
  if (groups.length === 0) {
    view.innerHTML = `<div class="todo-empty">🎉 暂无待办事项</div>`;
    return;
  }
  view.innerHTML = groups.map(g => `
    <div class="todo-group">
      <div class="todo-group-head">${g.label} <span class="todo-group-count">${g.items.length}</span></div>
      ${g.items.map(t => { const i = todoViewOrder.push(t) - 1; return `
        <div class="todo-row urgency-${t.ignored ? "ignored" : t.done ? "done" : t.urgency}">
          <span class="todo-kind">${t.kind === "event" ? "🗓" : "✋"}</span>
          <div class="todo-main">
            <div><strong>${escapeHtml(t.company)}</strong>${t.jobName ? ` · ${escapeHtml(t.jobName)}` : ""} · ${escapeHtml(t.label)}
              ${fmtTodoWhen(t) ? `<span class="todo-when ${t.days !== null && t.days <= 0 ? "urgent" : ""}">${escapeHtml(fmtTodoWhen(t))}</span>` : ""}</div>
            ${t.summary ? `<div class="todo-sum">${escapeHtml(t.summary)}</div>` : ""}
          </div>
          <div class="todo-acts">
            ${t.ignored ? `<button class="btn" onclick="todoAction(${i},'unignore')">↩ 恢复</button>` : ""}
            ${!t.ignored && t.actionUrl && escapeHtml(safeLink(t.actionUrl)) !== "#" ? `<a class="link-btn" href="${escapeHtml(safeLink(t.actionUrl))}" target="_blank" rel="noopener">🔗 打开</a>` : ""}
            ${!t.ignored && !t.done && (t.eventTime || t.dueDate) ? `<button class="copy-mini" onclick="todoAction(${i},'ics')" title="导出日历 (.ics)" aria-label="导出日历">📅</button>` : ""}
            ${!t.ignored && t.dynId && !t.done ? `<button class="btn btn-primary dyn-apply" onclick="todoAction(${i},'done')">✓ 完成</button>` : ""}
            ${!t.ignored && t.dynId && t.done ? `<button class="btn" onclick="todoAction(${i},'undo')">↩ 恢复</button>` : ""}
            ${!t.ignored && t.dynId && !t.done ? `<button class="job-row-del" onclick="todoAction(${i},'ignore')" aria-label="忽略">✕</button>` : ""}
          </div>
        </div>`; }).join("")}
    </div>`).join("");
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
  // v4.5: 带上公司名，避免"只有数字不知道是哪几家"的无效信息（公司名过 escapeHtml 防注入）
  const parts = [];
  if (stats.newApplied) parts.push(`新投递 ${escapeHtml(fmtNames(stats.byStatus["已投递"]))}`);
  if (stats.newTest) parts.push(`进笔试 ${escapeHtml(fmtNames(stats.byStatus["笔试中"]))}`);
  if (stats.newInterview) parts.push(`进面试 ${escapeHtml(fmtNames(stats.byStatus["面试中"]))}`);
  if (stats.newOffer) parts.push(`Offer ${escapeHtml(fmtNames(stats.byStatus["Offer"]))}`);
  bar.innerHTML = `📊 <strong>本周动态</strong>（${stats.touched} 家）：${parts.join(" · ")}`;
}
