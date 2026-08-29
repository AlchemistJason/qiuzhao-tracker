/* ============================================================
 * qiuzhao-tracker · 导出与同步层：CSV·JSON备份·同步码·Supabase云同步·重置
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
// v7: 云同步（纯前端免自建后端）
// v8.6: 后端迁移到 Supabase（LeanCloud 已于 2026-01 停止新注册、2027-01 全面停服）
//   - 认证：GoTrue 邮箱+密码（/auth/v1/signup、/auth/v1/token）
//   - 存储：PostgREST（/rest/v1/qiuzhao_state），行级安全 RLS 服务端强制隔离，
//           他人即使拿到 anon key 也读不到你的进度（select/insert/update 策略均限定 auth.uid()）
// ============================================================
const CLOUD_KEY = "qiuzhao2027.cloud";
const CLOUD_TABLE = "qiuzhao_state";
let cloudTimer = null;
let cloudStatus = "off";  // off | syncing | synced | error

// ============================================================
// v8.6: 账号系统（Supabase GoTrue）——邮箱+密码登录，云端状态按账号隔离（RLS）
// 安全模型：密码只出现在登录/注册请求体里，全程 HTTPS，不落盘、不进日志；
//          登录后只保存 access/refresh token；数据隔离由服务端 RLS 强制（不依赖客户端自觉）
// ============================================================
const AUTH_KEY = "qiuzhao2027.auth";

// 维护方内置的应用凭据（anon key 可公开——Supabase 官方设计，安全靠 RLS 不靠密钥保密）
const BUILTIN_CLOUD = { url: "https://xwubfsvmkdvnahobrnic.supabase.co", anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3dWJmc3Zta2R2bmFob2JybmljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MjU2MzksImV4cCI6MjEwMzUwMTYzOX0.-O--rcbtKvm_JWO5bzvN2FKT2K8UxBV8f6Cr3iCm400" };

function getAuth() {
  try {
    const a = JSON.parse(localStorage.getItem(AUTH_KEY));
    if (a && a.uid && a.accessToken) return a;
  } catch(e) {}
  return null;
}
function saveAuth(a) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify({ uid: a.uid, email: a.email, accessToken: a.accessToken, refreshToken: a.refreshToken, expiresAt: a.expiresAt })); } catch(e) {}
}
function clearAuth() {
  try { localStorage.removeItem(AUTH_KEY); } catch(e) {}
}

// 纯函数（可测）：强制 HTTPS（防降级到明文 http 泄露 access token）
function isHttpsUrl(u) { return /^https:\/\//i.test(u || ""); }
// 纯函数（可测）：Supabase 错误信息 → 中文提示（GoTrue 返回 error/msg，PostgREST 返回 code/message）
function sbErrorMessage(err, fallback) {
  const code = err && (err.code || err.error) || "";
  const raw = (err && (err.msg || err.error_description || err.message)) || "";
  const s = (code + " " + raw).toLowerCase();
  if (/invalid login|invalid credentials/.test(s)) return "邮箱或密码错误";
  if (/already registered|already been registered/.test(s)) return "该邮箱已注册，请直接登录";
  if (/email not confirmed/.test(s)) return "邮箱未验证（请到控制台关闭 Confirm email，或去邮箱点确认链接）";
  if (/weak password|password.*(at least|too short)/.test(s)) return "密码太弱，至少 6 位";
  if (/42p01|does not exist/.test(s)) return "云端表不存在（请先在 SQL Editor 执行建表 SQL，见 README）";
  if (/42501|row-level security|permission denied/.test(s)) return "云端权限拒绝（请检查 RLS 策略是否已建）";
  if (/rate limit|too many requests|over_request_rate/.test(s)) return "请求过于频繁，请稍后再试";
  return fallback || raw || "云端服务错误";
}

function getCloudConfig() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(CLOUD_KEY)) || {}; } catch(e) {}
  return {
    url: (c.url || BUILTIN_CLOUD.url || "").replace(/\/+$/, ""),  // 去尾斜杠防双斜杠
    anonKey: c.anonKey || BUILTIN_CLOUD.anonKey,
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
  // v9.4: 邮件分诊三列表取并集（集合语义：任一侧标记即生效；「恢复」操作可能被另一侧并回，属预期折衷）
  const unionArr = (a, b) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
  return { version: 3, companies: out, dyn: {
    seen: unionArr(local.dyn && local.dyn.seen, remote.dyn && remote.dyn.seen),
    done: unionArr(local.dyn && local.dyn.done, remote.dyn && remote.dyn.done),
    ignored: unionArr(local.dyn && local.dyn.ignored, remote.dyn && remote.dyn.ignored)
  } };
}

// 纯函数（可测）：解析 GoTrue 登录/注册响应为本地会话（仅 token，不含密码）
function parseAuthResponse(r, email) {
  if (!r || !r.access_token || !r.user || !r.user.id) return null;
  return {
    uid: r.user.id,
    email: r.user.email || email,
    accessToken: r.access_token,
    refreshToken: r.refresh_token || "",
    expiresAt: Date.now() + (r.expires_in || 3600) * 1000
  };
}

// access token 临期（<60s）时用 refresh token 换新，失败返回 null（调用方按登出处理）
async function ensureFreshToken() {
  const auth = getAuth();
  if (!auth) return null;
  if (auth.expiresAt && auth.expiresAt - Date.now() > 60000) return auth;
  if (!auth.refreshToken) return null;
  const cfg = getCloudConfig();
  try {
    const res = await fetch(cfg.url + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { "apikey": cfg.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: auth.refreshToken })
    });
    if (!res.ok) return null;
    const r = await res.json();
    const next = parseAuthResponse(r, auth.email);
    if (!next) return null;
    saveAuth(next);
    return next;
  } catch(e) { return null; }
}

async function cloudFetch(path, opts = {}) {
  const cfg = getCloudConfig();
  if (!cfg.url || !cfg.anonKey) throw new Error("未配置云同步");
  if (!isHttpsUrl(cfg.url)) throw new Error("云同步地址必须是 https");  // 防明文泄露 token
  let auth = getAuth();
  // v8.6: 需要登录态的请求，token 临期先自动续期
  if (auth && opts.auth !== false) {
    auth = await ensureFreshToken();
    if (!auth) {
      clearAuth();
      setCloudStatus("error");
      updateCloudBadge();
      showToast("☁️ 登录已过期，请重新登录");
      throw new Error("登录已过期");
    }
  }
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
    res = await fetch(cfg.url + path, {
      ...opts,
      signal,
      headers: {
        "apikey": cfg.anonKey,
        "Authorization": "Bearer " + (auth && opts.auth !== false ? auth.accessToken : cfg.anonKey),
        "Content-Type": "application/json",
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
  // 先读错误体做友好提示；401 = 会话失效 → 自动登出
  if (!res.ok) {
    let errJson = null;
    try { errJson = await res.json(); } catch(e2) {}
    if (res.status === 401 && auth && opts.auth !== false) {
      clearAuth();
      setCloudStatus("error");
      updateCloudBadge();
      showToast("☁️ 登录已过期，请重新登录");
      throw new Error("登录已过期");
    }
    throw new Error(sbErrorMessage(errJson, "云同步 HTTP " + res.status));
  }
  if (res.status === 204) return null;
  return res.json();
}

// 拉取本人云端状态行（RLS 已限定只能读到自己的行）
async function cloudGetState() {
  const rows = await cloudFetch(`/rest/v1/${CLOUD_TABLE}?select=payload,updated_at&limit=1`);
  if (rows && rows.length > 0 && rows[0].payload) {
    return { state: rows[0].payload };
  }
  return null;
}

// 整体 upsert 本人状态行（user_id 冲突即覆盖）
async function cloudPutState(state) {
  const auth = getAuth();
  if (!auth) throw new Error("未登录");
  await cloudFetch(`/rest/v1/${CLOUD_TABLE}`, {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: auth.uid, payload: state, updated_at: new Date().toISOString() })
  });
}

// 上传：先拉云端做公司级合并（避免覆盖另一设备的修改）再整体写入
async function cloudPush() {
  const cfg = getCloudConfig();
  if (!cfg.enabled || !cfg.url || !cfg.anonKey) return;
  if (!getAuth()) return;  // v8.6: 未登录不同步
  setCloudStatus("syncing");
  try {
    const remote = await cloudGetState();
    if (remote && remote.state) {
      const merged = mergeCloudState(userState, remote.state);
      userState = merged;
      saveStateRaw();
    }
    await cloudPutState(userState);
    setCloudStatus("synced");
  } catch(e) {
    setCloudStatus("error");
    console.warn("云同步上传失败", e);
  }
}

// 拉取：合并云端到本地（公司级），页面加载与手动触发
async function cloudPull() {
  const cfg = getCloudConfig();
  if (!cfg.enabled || !cfg.url || !cfg.anonKey) return;
  if (!getAuth()) return;
  setCloudStatus("syncing");
  try {
    const remote = await cloudGetState();
    if (remote && remote.state) {
      const merged = mergeCloudState(userState, remote.state);
      userState = merged;
      saveStateRaw();
      refreshAll();
      showToast("☁️ 已从云端同步");
    } else {
      await cloudPutState(userState);  // 首次使用：初始化云端行
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
// v8.6: 登录 / 注册 / 登出（Supabase GoTrue，邮箱+密码）
// ============================================================
function validateCredential(email, password) {  // 纯函数（可测）
  const u = (email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) return "请输入有效邮箱";
  if ((password || "").length < 6) return "密码至少 6 位";
  return null;
}

async function cloudAuthSubmit(mode, email, password) {
  const path = mode === "login" ? "/auth/v1/token?grant_type=password" : "/auth/v1/signup";
  const r = await cloudFetch(path, { method: "POST", auth: false, body: JSON.stringify({ email, password }) });
  // 若控制台没关「Confirm email」，signup 会返回用户但无 session——明确提示而不是假装成功
  const sess = parseAuthResponse(r, email);
  if (!sess) throw new Error("注册成功但需要邮箱验证（建议到 Supabase 控制台关闭 Confirm email 后重试登录）");
  saveAuth(sess);
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
  const email = (uEl.value || "").trim();
  const password = pEl.value || "";
  const err = validateCredential(email, password);
  if (err) { showToast(err); return; }
  authBusy = true;
  try {
    await cloudAuthSubmit(mode, email, password);
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
    box.innerHTML = `<div class="cloud-logged">✅ 已登录 <strong>${escapeHtml(a.email)}</strong> · 进度仅本账号可读写（服务端 RLS 强制隔离），其他设备登录同一账号自动同步
      <button class="btn" onclick="cloudLogout()">退出登录</button></div>`;
  } else {
    box.innerHTML = `
      <label class="cloud-label" for="cloudUser">邮箱</label>
      <input type="email" id="cloudUser" class="job-input" placeholder="邮箱（登录账号）" autocomplete="username" autocapitalize="off">
      <label class="cloud-label" for="cloudPass">密码</label>
      <input type="password" id="cloudPass" class="job-input" placeholder="密码（至少 6 位）" autocomplete="current-password">
      <div style="margin:8px 0">
        <button class="btn btn-primary" onclick="cloudLoginUI()">登录</button>
        <button class="btn" onclick="cloudRegisterUI()">注册新账号</button>
      </div>
      <p class="modal-hint">密码只随登录/注册请求加密传输，本机不保存；云端状态仅本人账号可读写（Supabase 行级安全隔离）。</p>`;
  }
}

// 本地变更 → 防抖 8 秒后自动上传
function scheduleCloudPush() {
  const cfg = getCloudConfig();
  if (!cfg.enabled || !cfg.url || !cfg.anonKey) return;
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
  if (!cfg.url || !cfg.anonKey) {
    btn.className = "icon-btn cloud-off";
    btn.title = "☁️ 云同步未配置（点击配置）";
    return;
  }
  const who = auth ? `（${auth.email}）` : "（未登录）";
  if (cloudStatus === "syncing") { btn.className = "icon-btn cloud-syncing"; btn.title = "☁️ 同步中..." + who; }
  else if (cloudStatus === "error") { btn.className = "icon-btn cloud-err"; btn.title = "☁️ 同步失败（点击查看）" + who; }
  else { btn.className = "icon-btn cloud-ok"; btn.title = "☁️ 云同步" + who + "（点击管理）"; }
}

// 云同步设置弹窗
function openCloudModal() {
  const cfg = getCloudConfig();
  const modal = document.getElementById("cloudModal");
  document.getElementById("cloudModalTitle").textContent = "☁️ 云同步与账号";
  renderCloudAccount();  // 账号区（登录/注册/已登录）
  document.getElementById("cloudUrl").value = cfg.url;
  document.getElementById("cloudAnonKey").value = cfg.anonKey;
  document.getElementById("cloudEnabled").checked = cfg.enabled;
  const st = document.getElementById("cloudStatus");
  st.textContent = cfg.url ? (cloudStatus === "synced" ? "✅ 已连接" : cloudStatus === "error" ? "⚠️ 上次同步失败" : cloudStatus === "syncing" ? "🔄 同步中" : "⚪ 待同步") : "未配置";
  modal.style.display = "flex";
}

function closeCloudModal() {
  document.getElementById("cloudModal").style.display = "none";
}

function readCloudSettingsForm() {
  return {
    url: document.getElementById("cloudUrl").value.trim(),
    anonKey: document.getElementById("cloudAnonKey").value.trim(),
    enabled: document.getElementById("cloudEnabled").checked
  };
}

function saveCloudSettings() {
  const cfg = readCloudSettingsForm();
  if (!cfg.url || !cfg.anonKey) { showToast("请填写项目 URL 和 anon key"); return; }
  if (!isHttpsUrl(cfg.url)) { showToast("项目 URL 必须是 https 地址"); return; }
  saveCloudConfig(cfg);
  cloudStatus = "off";
  closeCloudModal();
  showToast("☁️ 配置已保存，开始同步...");
  cloudPush();
}

async function testCloud() {
  const cfg = readCloudSettingsForm();
  if (!cfg.url || !cfg.anonKey) { showToast("请先填写项目 URL 和 anon key"); return; }
  const st = document.getElementById("cloudStatus");
  st.textContent = "🔄 测试中...";
  try {
    saveCloudConfig(cfg);
    await cloudGetState();
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
      <p style="font-size:12px;color:var(--text-secondary);text-align:center">另一台设备打开本页面 → 点 ☁️ 按钮 → 「无账号同步」→「扫描/粘贴导入」</p>
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
