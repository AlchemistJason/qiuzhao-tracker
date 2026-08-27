/* ============================================================
 * qiuzhao-tracker · 导出与同步层：CSV·JSON备份·同步码·LeanCloud云同步·重置
 * 由 app.js v6.0 重构拆分（勿手工编辑此说明）
 * ============================================================ */
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
    stateVersion: 3,
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
// v7.2 修复：之前只保留 status/starred/note，岗位级 jobs/lastUpdate/history 在导入时丢失
// v7.4 修复：不再整包覆盖——与本机状态按公司级合并（复用 mergeCloudState：lastUpdate 较新侧为基准，
// jobs/history/starred 并集），避免扫旧二维码/导旧备份把本机新进度冲掉
function mergeIncoming(incoming) {
  if (!incoming || typeof incoming !== "object") return 0;
  let merged = 0;
  Object.keys(incoming).forEach(id => {
    if (!COMPANY_IDS.has(id)) return;
    const st = incoming[id] || {};
    const norm = {
      status: st.status || "未投递",
      starred: !!st.starred,
      note: st.note || "",
      lastUpdate: st.lastUpdate === undefined ? null : st.lastUpdate,
      jobs: st.jobs && typeof st.jobs === "object" ? st.jobs : {},
      history: Array.isArray(st.history) ? st.history : []
    };
    userState.companies[id] = mergeCloudState(
      { companies: { [id]: userState.companies[id] } },
      { companies: { [id]: norm } }
    ).companies[id];
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
  event.target.value = "";  // v7.4: 重置 input，允许连续两次导入同一文件（change 只在值变化时触发）
  if (!file) return;
  if (!confirm("导入将与本机状态按公司合并（冲突时取较新一侧）。继续导入？")) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      // 兼容备份格式：{userState:{companies}} 或顶层 {version:2|3, companies}
      const incoming = (data && data.userState && data.userState.companies)
        ? data.userState.companies
        : (data && (data.version === 2 || data.version === 3) && data.companies) ? data.companies : null;
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

// 岗位级合并（纯函数可测）：公司取 lastUpdate 较新侧为基准
// jobs 按 key 取并集（同 key 冲突取较新侧），再从并集聚合回写 status ——
// 避免多设备各投不同岗位/各改不同岗位进度时整包互覆（v7.1 修复）
// 已知取舍：一侧删除岗位、另一侧未动时，并集会复活该岗位（无岗位级时间戳，宁可不丢投递记录）
function mergeCloudState(local, remote) {
  const out = {};
  const allIds = new Set([...Object.keys(local.companies || {}), ...Object.keys(remote.companies || {})]);
  allIds.forEach(id => {
    const l = local.companies[id];
    const r = remote.companies[id];
    if (!l) { out[id] = r; return; }
    if (!r) { out[id] = l; return; }
    const base = (l.lastUpdate || 0) >= (r.lastUpdate || 0) ? l : r;
    const other = base === l ? r : l;
    const jobs = { ...(other.jobs || {}), ...(base.jobs || {}) };  // 展开顺序保证较新侧覆盖同 key
    // 历史记录取双侧并集：按 (time,job,from,to) 去重、按时间排序、封顶 50 条
    const seen = new Set();
    const history = [...(base.history || []), ...(other.history || [])]
      .filter(h => {
        const k = `${h.time}|${h.job || ""}|${h.from || ""}|${h.to || ""}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => (a.time || 0) - (b.time || 0))
      .slice(-50);
    out[id] = {
      status: deriveCompanyStatus(jobs, base.status),
      starred: !!(base.starred || other.starred),   // 收藏取并集：任一侧收藏即保留
      note: base.note || other.note || "",          // 备注：较新侧为空时保留另一侧，防丢
      lastUpdate: Math.max(l.lastUpdate || 0, r.lastUpdate || 0) || null,
      jobs,
      history
    };
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

// v7.4: 二维码瘦身（纯函数可测）：剔除全默认状态的公司（未投递+无收藏+无备注+无岗位+无历史）。
// 否则 76 家全量状态 base64 ≈10KB，远超单张 QR 容量（M 级纠错 ≈2.3KB）必生成失败；
// 默认态在导入端本来就是初值，无需传输。
function buildSlimCompanies(companies) {
  const slim = {};
  Object.keys(companies || {}).forEach(id => {
    const s = companies[id] || {};
    const isDefault = (!s.status || s.status === "未投递") && !s.starred && !s.note
      && (!s.jobs || Object.keys(s.jobs).length === 0)
      && (!s.history || s.history.length === 0);
    if (!isDefault) slim[id] = s;
  });
  return slim;
}

function encodeSyncCode() {
  // v6: 同步码升级到 v3（含岗位级 jobs 映射）；兼容 v2 老码解码
  // v7.4: 只编码非默认公司（buildSlimCompanies 瘦身）
  const payload = { v: 3, c: buildSlimCompanies(userState.companies) };
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
      if (code.length > 2200) throw new Error("too-long");  // v7.4: 超单张 QR 容量（M 级 ≈2.3KB）直接走文本码
      const qr = new QRCode(document.getElementById("qrBox"), {
        text: code, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M
      });
    } catch(e) {
      document.getElementById("qrBox").innerHTML = '<span style="color:#888;font-size:12px">数据量较大，二维码放不下，请用下方文本码同步</span>';
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
