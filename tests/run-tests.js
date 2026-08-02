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

// ---------- 2. 从 app.js 提取纯函数测试 ----------
section("核心逻辑 (app.js 提取)");
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

// 提取纯函数源码（无 DOM 依赖）
function extractFn(name) {
  const re = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}", "m");
  const m = appJs.match(re);
  if (!m) return null;
  const ctx = {};
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

// ---------- 结果 ----------
console.log("\n══════════════════════════════");
console.log("  结果: " + pass + " 通过 / " + fail + " 失败");
console.log("══════════════════════════════");
if (fail > 0) {
  console.log("\n失败项:");
  failures.forEach(f => console.log("  ✗ " + f));
  process.exit(1);
}
