/* ============================================================
 * qiuzhao-tracker · 入口：初始化序列
 * 由 app.js v6.0 重构拆分（勿手工编辑此说明）
 * ============================================================ */
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
updateCloudBadge();
loadDynamics();  // v6.0: 加载邮件动态条    // v7: 云同步状态徽标
cloudPull();           // v7: 页面加载拉取云端并合并
