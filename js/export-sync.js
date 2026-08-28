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
// v8.1: status 白名单归一——不在 STATUS_OPTIONS 内的值归为「未投递」（防脏数据/恶意同步码）
function normalizeStatus(v) {
  return STATUS_OPTIONS.includes(v) ? v : "未投递";
}

function mergeIncoming(incoming) {
  if (!incoming || typeof incoming !== "object") return 0;
  let merged = 0;
  Object.keys(incoming).forEach(id => {
    if (!COMPANY_IDS.has(id)) return;
    const st = incoming[id] || {};
    const jobs = {};
    if (st.jobs && typeof st.jobs === "object") {
      Object.keys(st.jobs).forEach(k => {
        if (k === "__proto__" || k === "constructor" || k === "prototype") return;
        jobs[k] = normalizeStatus(st.jobs[k]);
      });
    }
    const norm = {
      status: normalizeStatus(st.status),
      starred: !!st.starred,
      note: st.note || "",
      lastUpdate: st.lastUpdate === undefined ? null : st.lastUpdate,
      jobs,
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

// ============================================================
// v8.4: 账号系统（LeanCloud _User）——用户名+密码登录，云端状态按账号隔离（ACL 仅本人读写）
// 安全模型：密码只出现在登录/注册请求体里，全程 HTTPS，不落盘、不进日志；
//          登录后只保存 sessionToken；云端对象挂 ACL，他人持 AppKey 也读不到你的进度
// ============================================================
const AUTH_KEY = "qiuzhao2027.auth";

// 维护方可在此内置应用凭据，用户即免填（机密性不靠这两个值——BaaS 惯例，等同 Supabase anon key）
const BUILTIN_CLOUD = { appId: "", appKey: "", serverURL: DEFAULT_SERVER };

function getAuth() {
  try {
    const a = JSON.parse(localStorage.getItem(AUTH_KEY));
    if (a && a.uid && a.sessionToken) return a;
  } catch(e) {}
  return null;
}
function saveAuth(a) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify({ uid: a.uid, username: a.username, sessionToken: a.sessionToken })); } catch(e) {}
}
function clearAuth() {
  try { localStorage.removeItem(AUTH_KEY); } catch(e) {}
}

// 纯函数（可测）：对象 ACL——仅本人可读写，其余人（含匿名）全禁
function buildUserACL(uid) {
  if (!/^[a-zA-Z0-9]{6,32}$/.test(uid || "")) throw new Error("uid 格式非法");
  return { "*": { read: false, write: false }, [uid]: { read: true, write: true } };
}
// 纯函数（可测）：按属主查询条件
function buildOwnerWhere(uid) {
  if (!/^[a-zA-Z0-9]{6,32}$/.test(uid || "")) throw new Error("uid 格式非法");
  return { ownerUid: uid };
}
// 纯函数（可测）：强制 HTTPS（防降级到明文 http 泄露 sessionToken）
function isHttpsUrl(u) { return /^https:\/\//i.test(u || ""); }
// 纯函数（可测）：LeanCloud 错误码 → 中文提示
function lcErrorMessage(code, fallback) {
  const map = {
    200: "用户名为空", 201: "密码为空", 202: "用户名已被占用", 203: "邮箱已被占用",
    204: "邮箱不能为空", 205: "邮箱未验证",
    210: "用户名或密码错误", 211: "用户不存在或登录已过期",
    214: "手机号已注册", 216: "邮箱未验证", 219: "登录失败次数过多，请稍后再试"
  };
  return map[code] || fallback || "云端服务错误";
}

function getCloudConfig() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(CLOUD_KEY)) || {}; } catch(e) {}
  return {
    appId: c.appId || BUILTIN_CLOUD.appId,
    appKey: c.appKey || BUILTIN_CLOUD.appKey,
    serverURL: c.serverURL || BUILTIN_CLOUD.serverURL || DEFAULT_SERVER,
    enabled: c.enabled !== false
  };
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
    // v8.1 原型链防护：计算键赋值跳过危险键，防止恶意同步码注入 __proto__ 等
    if (id === "__proto__" || id === "constructor" || id === "prototype") return;
    const l = local.companies[id];
    const r = remote.companies[id];
    if (!l) { out[id] = r; return; }
    if (!r) { out[id] = l; return; }
    // v8.1 修复：双侧 lastUpdate 均空（如二维码不含时间戳）时不再无脑平局取本地——
    // 本地仍是默认「未投递」而外来侧已有进度时，取外来侧为基准，避免导入静默丢状态
    let base = (l.lastUpdate || 0) >= (r.lastUpdate || 0) ? l : r;
    if (!l.lastUpdate && !r.lastUpdate
      && (!l.status || l.status === "未投递")
      && r.status && r.status !== "未投递") {
      base = r;
    }
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
  if (!isHttpsUrl(cfg.serverURL)) throw new Error("云同步地址必须是 https");  // v8.4: 防明文泄露 sessionToken
  const auth = getAuth();
  // v8.1: 15s 超时，弱网挂起时不再永久卡「同步中」
  // 兼容：AbortSignal.timeout 不可用时手动 AbortController + setTimeout
  let signal;
  let timer = null;
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    signal = AbortSignal.timeout(15000);
  } else {
    const controller = new AbortController();
    signal = controller.signal;
    timer = setTimeout(() => controller.abort(), 15000);
  }
  let res;
  try {
    res = await fetch(cfg.serverURL + path, {
      ...opts,
      signal,
      headers: {
        "X-LC-Id": cfg.appId,
        "X-LC-Key": cfg.appKey,
        "Content-Type": "application/json",
        // v8.4: 登录后所有请求带会话（opts.auth === false 时跳过，如登录/注册本身）
        ...(auth && opts.auth !== false ? { "X-LC-Session": auth.sessionToken } : {}),
        ...(opts.headers || {})
      }
    });
  } catch(e) {
    if (e && (e.name === "AbortError" || e.name === "TimeoutError")) {
      setCloudStatus("error");
      showToast("云同步超时，请检查网络");
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
  // v8.4: 先读错误体拿 LeanCloud 错误码，友好提示；401/211 = 会话失效 → 自动登出
  if (!res.ok) {
    let code = 0, msg = "";
    try { const ej = await res.json(); code = ej.code || 0; msg = ej.error || ""; } catch(e2) {}
    if ((res.status === 401 || code === 211) && auth && opts.auth !== false) {
      clearAuth();
      setCloudStatus("error");
      updateCloudBadge();
      showToast("☁️ 登录已过期，请重新登录");
      throw new Error("登录已过期");
    }
    throw new Error(lcErrorMessage(code, msg || ("云同步 HTTP " + res.status)));
  }
  return res.json();
}

async function cloudGetObject() {
  // v8.4: 登录后只查本人对象（ownerUid 过滤 + 服务端 ACL 双保险）；匿名模式维持旧行为
  // v8.1: 多取几条以检测多云对象分叉（同账号多设备各建一个对象时会分叉且无收敛）；
  // 仍只使用最新一条，检测到分叉仅 console.warn 提示，不做自动合并删除（太危险）
  let path = `/1.1/classes/${CLOUD_CLASS}?limit=5&order=-updatedAt`;
  const auth = getAuth();
  if (auth) path += "&where=" + encodeURIComponent(JSON.stringify(buildOwnerWhere(auth.uid)));
  const list = await cloudFetch(path);
  if (list.results && list.results.length > 0 && list.results[0].state) {
    if (list.results.length > 1) {
      console.warn(`检测到 ${list.results.length} 个云端状态对象（多设备分叉），仅使用最新一条，请到 LeanCloud 控制台手动清理多余对象`);
    }
    return { id: list.results[0].objectId, state: JSON.parse(list.results[0].state) };
  }
  return null;
}

async function cloudCreateObject() {
  const auth = getAuth();
  const body = { state: JSON.stringify(userState), lastSync: new Date().toISOString() };
  if (auth) {  // v8.4: 账号对象挂属主 + ACL（仅本人读写）
    body.ownerUid = auth.uid;
    body.ACL = buildUserACL(auth.uid);
  }
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

// ============================================================
// v8.4: 登录 / 注册 / 登出
// ============================================================
function validateCredential(username, password) {  // 纯函数（可测）
  const u = (username || "").trim();
  if (u.length < 2 || u.length > 32) return "用户名需 2~32 个字符";
  if (/\s/.test(u)) return "用户名不能含空格";
  if ((password || "").length < 6) return "密码至少 6 位";
  return null;
}

async function cloudAuthSubmit(path, username, password) {
  const r = await cloudFetch(path, { method: "POST", auth: false, body: JSON.stringify({ username, password }) });
  saveAuth({ uid: r.objectId, username: r.username || username, sessionToken: r.sessionToken });
  updateCloudBadge();
  return r;
}

// 弹窗按钮入口（带防重复提交）
let authBusy = false;
async function cloudLoginUI() { await authUI("login"); }
async function cloudRegisterUI() { await authUI("register"); }
async function authUI(mode) {
  if (authBusy) return;
  const uEl = document.getElementById("cloudUser");
  const pEl = document.getElementById("cloudPass");
  const username = (uEl.value || "").trim();
  const password = pEl.value || "";
  const err = validateCredential(username, password);
  if (err) { showToast(err); return; }
  authBusy = true;
  try {
    await cloudAuthSubmit(mode === "login" ? "/1.1/login" : "/1.1/users", username, password);
    pEl.value = "";  // 密码用完即清，不留 DOM
    renderCloudAccount();
    showToast(mode === "login" ? "☁️ 登录成功，开始同步..." : "☁️ 注册成功，已自动登录");
    cloudPull();  // 拉取本人云端状态并合并
  } catch(e) {
    showToast("☁️ " + (e.message || "操作失败"), 4000);
  } finally {
    authBusy = false;
  }
}

function cloudLogout() {
  if (!confirm("退出登录后本设备不再云同步（本地进度保留）。确定退出？")) return;
  clearAuth();
  setCloudStatus("off");
  renderCloudAccount();
  showToast("已退出登录");
}

// 弹窗账号区渲染（登录态/未登录态两副面孔）
function renderCloudAccount() {
  const box = document.getElementById("cloudAccount");
  if (!box) return;
  const a = getAuth();
  if (a) {
    box.innerHTML = `<div class="cloud-logged">✅ 已登录 <strong>${escapeHtml(a.username)}</strong> · 进度仅本账号可读写，其他设备登录同一账号自动同步
      <button class="btn" onclick="cloudLogout()">退出登录</button></div>`;
  } else {
    box.innerHTML = `
      <label class="cloud-label" for="cloudUser">账号</label>
      <input type="text" id="cloudUser" class="job-input" placeholder="用户名" autocomplete="username" autocapitalize="off">
      <label class="cloud-label" for="cloudPass">密码</label>
      <input type="password" id="cloudPass" class="job-input" placeholder="密码（至少 6 位）" autocomplete="current-password">
      <div style="margin:8px 0">
        <button class="btn btn-primary" onclick="cloudLoginUI()">登录</button>
        <button class="btn" onclick="cloudRegisterUI()">注册新账号</button>
      </div>
      <p class="modal-hint">密码只随登录/注册请求加密传输，本机不保存；云端状态仅本人账号可读写（ACL 隔离）。</p>`;
  }
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
  const auth = getAuth();
  if (!cfg.appId || !cfg.appKey) {
    btn.className = "icon-btn cloud-off";
    btn.title = "☁️ 云同步未配置（点击配置）";
    return;
  }
  const who = auth ? `（${auth.username}）` : "（未登录）";
  if (cloudStatus === "syncing") { btn.className = "icon-btn cloud-syncing"; btn.title = "☁️ 同步中..." + who; }
  else if (cloudStatus === "error") { btn.className = "icon-btn cloud-err"; btn.title = "☁️ 同步失败（点击查看）" + who; }
  else { btn.className = "icon-btn cloud-ok"; btn.title = "☁️ 云同步" + who + "（点击管理）"; }
}

// 云同步设置弹窗
function openCloudModal() {
  const cfg = getCloudConfig();
  const modal = document.getElementById("cloudModal");
  document.getElementById("cloudModalTitle").textContent = "☁️ 云同步与账号";
  renderCloudAccount();  // v8.4: 账号区（登录/注册/已登录）
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
  if (!isHttpsUrl(cfg.serverURL)) { showToast("ServerURL 必须是 https 地址"); return; }
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
    // v8.1: 合并前确认预览，避免误粘贴覆盖本机状态
    if (!confirm(`将合并 ${Object.keys(payload.c).length} 家公司的状态，继续？`)) return;
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
      await loadScript("vendor/html5-qrcode.min.js");  // v8.0: 本地化，不再走第三方 CDN（防劫持/防篡改）
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
        // v8.1 一次性守卫：stopQrScanner 先同步置空 qrScanner 再异步 stop，
        // 停止完成前同码多次回调直接忽略，防止重复触发 mergeSync
        if (!qrScanner) return;
        try {
          const payload = decodeSyncCode(decodedText);
          if (payload && (payload.v === 2 || payload.v === 3) && payload.c) {
            // v8.1: 合并前确认预览，避免误扫覆盖本机状态
            if (!confirm(`将合并 ${Object.keys(payload.c).length} 家公司的状态，继续？`)) return;
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
