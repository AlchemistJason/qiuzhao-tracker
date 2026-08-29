/* ============================================================
 * qiuzhao-tracker · 入口：初始化序列
 * 由 app.js v6.0 重构拆分（勿手工编辑此说明）
 * ============================================================ */
// ============================================================
// 初始化
// ============================================================
userState = loadState();
// 请求持久存储权限，降低浏览器自动清理 localStorage 导致状态丢失的概率
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
loadUIPrefs();         // v7.2: 恢复上次的视图/排序/筛选偏好
renderDashboard();
validateCompanies();   // 数据完整性校验（A3）
// v7.7: URL hash 路由（#all / #pool / #todo / #referral），刷新保持所在 tab
// 必须先于 renderFilterPanel 执行，否则 #pool 首屏筛选面板选项会错来自内推来源
(function() {
  const h = (location.hash || "").replace("#", "");
  if (h === "all" || h === "pool" || h === "referral") currentSource = h;
  if (h === "todo") currentView = "todo";
})();
renderFilterPanel();   // v5.4: 筛选下拉面板（地点/行业/岗位 checkbox）
refreshFilterUI();     // v5: 同步所有筛选选中态 + 已选条件条
refreshTodos();        // v7.3: 待办横带（含待办视图数据初始化）
renderWeekly();        // 本周动态统计
switchView(currentView); // 同步初始视图（修复移动端首屏显示空表格的问题）
checkDeadlineAlert();  // 页面打开时的截止提醒（每天一次）
updateCloudBadge();
loadDynamics();  // v6.0: 加载邮件动态条    // v7: 云同步状态徽标
loadDiscovered();      // v7.5: 爬虫发现公司候选池（合并进目录，🆕 标记）
cloudPull();           // v7: 页面加载拉取云端并合并
