/* ============================================================
 * 秋招跟踪器 · 数据层
 * 数据更新只改这个文件（新增/修改/删除公司条目）
 * 结构：window.COMPANIES = [{ id, name, type, program, category, nature, jobs, location, refCode, link, note, deadline }]
 *   id       : 稳定唯一标识（slug），用户状态以此为准，禁止修改已发布条目的 id
 *   type     : "秋招" | "提前批" | "技术提前批"
 *   program  : 专项计划名（可选，如 "Elite Program+"）
 *   category : 行业分类（1~2 个值），合法值见 window.INDUSTRY_GROUPS（如 ["互联网"]、["金融科技"]），特殊值 "活动" 仅招聘活动条目使用
 *   nature   : 企业性质 "央企"|"国企"|"民企"|"外企"|"合资"
 *   refCode  : 内推码，若为 null 则显示"点击即内推"
 *   deadline : 截止日期 "YYYY-MM-DD"（可选，用于倒计时）
 * ============================================================ */

window.DATA_VERSION = 6;

// 行业分组（筛选面板分级目录用）：组名 → 行业值（顺序即展示顺序）
window.INDUSTRY_GROUPS = {
  "金融": ["银行", "券商/基金/期货", "金融科技"],
  "互联网与软件": ["互联网", "游戏", "安全"],
  "AI与智能硬件": ["AI/机器人", "智能硬件", "半导体/电子", "汽车/智能驾驶"],
  "工业/能源/交通": ["工业/制造/能源", "交通/物流", "通信/运营商"],
  "消费与服务": ["消费/零售", "教育", "咨询/专业服务", "综合集团"]
};
// 企业性质合法值
window.NATURES = ["央企", "国企", "民企", "外企", "合资"];

window.COMPANIES = [
  {
    id: "dian-dian", name: "点点互动", type: "提前批", program: "Elite Program+",
    category: ["游戏"],
    nature: "民企",
    jobs: ["系统策划", "数值策划", "全球广告创意策划", "全球广告投放", "AI agent", "AI算法", "客户端开发", "数据分析"],
    location: "北京", refCode: "ESV4BR",
    link: "https://ddhd.cn/4/jobs?shareId=51edfdaa-c768-48c2-968e-424b71293a6d&shareSource=1&qr=1",
    note: "8月31日前免笔试", deadline: "2026-08-31"
  },
  {
    id: "shopee", name: "Shopee虾皮", type: "秋招",
    category: ["互联网"],
    nature: "外企",
    jobs: ["研发岗", "算法岗", "产品岗", "职能岗"],
    location: "北京/上海/深圳", refCode: "DSkUucG8",
    link: "https://app.mokahr.com/m/campus_apply/shopee/2962?recommendCode=DSkUucG8#/jobs",
    note: "常规校招+AI Star Program各1个志愿"
  },
  {
    id: "cmbnt", name: "招银网络科技", type: "秋招",
    category: ["金融科技"],
    nature: "央企",
    jobs: ["后端开发工程师", "前端开发工程师", "算法工程师", "测试技术开发工程师", "运维研发工程师"],
    location: "深圳/杭州/成都", refCode: "COALPY",
    link: "https://cmbnt.cmbchina.com/pages/bindInvited.html?qrCode=D52CE83B64444EB7AB40B84854BCCA39&rand=1784281202267&blNtCode=COALPY",
    note: "招商银行旗下"
  },
  {
    id: "intsig", name: "合合信息", type: "秋招",
    category: ["AI/机器人"],
    nature: "民企",
    jobs: ["算法类", "技术类", "产品类", "运营类", "设计类", "职能类"],
    location: "上海", refCode: "EV3PKS",
    link: "https://intsig.zhiye.com/campus/jobs?shareId=8ca26137-bd70-4a41-bc7d-9b624a9d5a81&shareSource=2",
    note: "全能扫描王母公司"
  },
  {
    id: "itek", name: "埃科光电", type: "秋招",
    category: ["半导体/电子"],
    nature: "民企",
    jobs: ["技术岗"],
    location: "合肥", refCode: "XDYXF047",
    link: "http://career.i-tek.cn/",
    note: "简历命名：内推码+岗位-姓名-学校-学历"
  },
  {
    id: "pudu", name: "普渡机器人", type: "秋招",
    category: ["AI/机器人"],
    nature: "民企",
    jobs: ["算法", "软件", "硬件", "机械", "产品", "营销"],
    location: "深圳", refCode: "ES3RG1",
    link: "https://pudutech1.zhiye.com/campus/jobs?shareId=19eb0b83-dae3-4f71-a47b-a76e13a97207&shareSource=2&qr=1&memory=%7B%7D&silence=1",
    note: ""
  },
  {
    id: "iflytek", name: "科大讯飞", type: "秋招",
    category: ["AI/机器人"],
    nature: "民企",
    jobs: ["研究算法", "研发", "AI研发", "产品", "营销", "职能", "设计"],
    location: "合肥", refCode: "EVBRH1",
    link: "https://iflytek.zhiye.com/campus/jobs",
    note: "常规+飞凡+飞星，三个项目可同时投递"
  },
  {
    id: "netease-huyu", name: "网易互娱", type: "秋招",
    category: ["游戏"],
    nature: "民企",
    jobs: ["策划", "技术", "美术", "测试", "用户体验", "市场", "运营", "PM"],
    location: "广州/杭州", refCode: "oKFLGH",
    link: "https://campus.game.163.com/?referralCode=oKFLGH",
    note: "与雷火独立，每人可投2个岗位"
  },
  {
    id: "oppo", name: "OPPO", type: "秋招",
    category: ["智能硬件"],
    nature: "民企",
    jobs: ["算法", "软件", "硬件", "营销", "产品等八大类100+岗位"],
    location: "深圳/东莞", refCode: "X1757111",
    link: "https://careers.oppo.com/university/oppo/campus/post?shareId=19939",
    note: "每人可投2个岗位，每周五推进笔试"
  },
  {
    id: "dexmal", name: "Dexmal原力灵机", type: "秋招",
    category: ["AI/机器人"],
    nature: "民企",
    jobs: ["研发类", "工程/机械类", "职能/支持类", "产品/策划/项目类"],
    location: "北京/上海", refCode: "966SQH7",
    link: "https://dexmal-inc.jobs.feishu.cn/s/XZm3_Z6dywA",
    note: "选择大使推荐，可投2个岗位"
  },
  {
    id: "threatbook", name: "微步在线", type: "秋招",
    category: ["安全"],
    nature: "民企",
    jobs: ["研发", "安全", "产品", "设计", "销售管培", "市场运营"],
    location: "北京", refCode: "DSkqt7Cx",
    link: "https://app.mokahr.com/m/campus_apply/threatbook/39679?recommendCode=DSkqt7Cx#/jobs",
    note: "每人可投2个岗位"
  },
  {
    id: "baidu", name: "百度", type: "秋招",
    category: ["互联网"],
    nature: "民企",
    jobs: ["技术类", "产品类", "运营类"],
    location: "北京", refCode: "IZS1K1",
    link: "https://dwz.cn/apEwkEt3",
    note: ""
  },
  {
    id: "dji", name: "DJI大疆", type: "秋招",
    category: ["智能硬件"],
    nature: "民企",
    jobs: ["算法类", "软件类", "硬件类", "芯片类等12大类100+岗位"],
    location: "深圳", refCode: "DSpqFDWr",
    link: "https://app.mokahr.com/m/campus-recruitment/dji/143359?recommendCode=DSpqFDWr#/jobs",
    note: "每人仅可投递1个岗位"
  },
  {
    id: "xunlei", name: "迅雷", type: "秋招", program: "产品星计划",
    category: ["互联网"],
    nature: "民企",
    jobs: ["X-PEP产品星计划", "服务器开发工程师"],
    location: "深圳", refCode: "DSZAne8X",
    link: "https://app.mokahr.com/m/campus_apply/xunlei/26600?recommendCode=DSZAne8X#/jobs",
    note: "校招对象：2026年9月-2027年8月毕业"
  },
  {
    id: "weride", name: "文远知行", type: "秋招",
    category: ["汽车/智能驾驶"],
    nature: "民企",
    jobs: ["算法类", "开发类", "硬件类", "测试开发类"],
    location: "广州/北京/上海/深圳", refCode: "DSGpxSZV",
    link: "https://app.mokahr.com/m/campus_apply/jingchi/2137?recommendCode=DSGpxSZV#/jobs",
    note: ""
  },
  {
    id: "agirobot", name: "智元机器人", type: "秋招",
    category: ["AI/机器人"],
    nature: "民企",
    jobs: ["技术类", "营销服类", "供应链与制造类"],
    location: "上海", refCode: "4RJGH2F",
    link: "https://agirobot.jobs.feishu.cn/s/BZq88d0rFDw",
    note: "选择大使推荐"
  },
  {
    id: "zhuoyu", name: "卓驭科技", type: "秋招",
    category: ["汽车/智能驾驶"],
    nature: "民企",
    jobs: ["算法类", "软件类", "机械电气类", "嵌入式类", "测试类", "安全类", "系统工程类", "非研发类"],
    location: "深圳", refCode: "EZB8SG",
    link: "https://we.zyt.com/campus/jobs?shareId=90d78e3f-7119-41dd-b1cb-cf3679b5e857&shareSource=2",
    note: "原大疆车载"
  },
  {
    id: "hypergryph", name: "鹰角网络", type: "提前批",
    category: ["游戏"],
    nature: "民企",
    jobs: ["游戏引擎开发", "游戏客户端", "角色模型", "场景模型", "战斗策划", "关卡策划"],
    location: "上海", refCode: "DSJsUHpr",
    link: "https://app.mokahr.com/m/campus-recruitment/hypergryph/26326?recommendCode=DSJsUHpr#/jobs",
    note: "提前批即将截止"
  },
  {
    id: "inovance", name: "汇川技术", type: "秋招",
    category: ["工业/制造/能源"],
    nature: "民企",
    jobs: ["技术类", "技能类", "营销类", "供应链管理类", "质量类", "其他职能类"],
    location: "深圳/苏州", refCode: "ADE3CAE",
    link: "https://recruit.inovance.com/#/jobs?ref=ADE3CAE",
    note: ""
  },
  {
    id: "pdd", name: "拼多多", type: "提前批",
    category: ["互联网"],
    nature: "民企",
    jobs: ["技术类", "运营类", "职能类", "市场营销类", "设计类", "视觉类"],
    location: "上海", refCode: "CXX5XFMHAH",
    link: "https://careers.pddglobalhr.com/campus/grad?t=CXX5XFMHAH",
    note: "提前批不影响正式批"
  },
  {
    id: "kuaishou", name: "快手", type: "提前批", program: "快Star",
    category: ["互联网"],
    nature: "民企",
    jobs: ["大模型", "AI infra", "音视频", "推荐", "广告等九大方向"],
    location: "北京", refCode: "campusYrAmiVqrV",
    link: "https://campus.kuaishou.cn/recruit/campus/e/h5/#/campus/jobs?code=campusYrAmiVqrV",
    note: "技术提前批"
  },
  {
    id: "hesai", name: "禾赛科技", type: "提前批",
    category: ["汽车/智能驾驶"],
    nature: "民企",
    jobs: ["技术岗"],
    location: "上海", refCode: null,
    link: "https://kwh0jtf778.jobs.feishu.cn/229043/m/position?external_referral_code=V44VB8A",
    note: "点击链接即内推"
  },
  {
    id: "lemon", name: "柠檬微趣", type: "秋招",
    category: ["游戏"],
    nature: "民企",
    jobs: ["测试", "运营", "策划", "后台", "美术", "客户端", "数据", "运维", "游戏引擎", "AI应用"],
    location: "北京", refCode: "NTAgHHs",
    link: "https://app.mokahr.com/su/luiqht",
    note: ""
  },
  {
    id: "xdf", name: "新东方", type: "提前批",
    category: ["教育"],
    nature: "民企",
    jobs: ["教师(不限专业)"],
    location: "全国多地", refCode: "A3UWK2E",
    link: "https://z2u.tv/wWDUk8",
    note: "内推直通复试，HR 5个工作日内沟通"
  },
  {
    id: "pxx-edu", name: "平行线教育", type: "提前批",
    category: ["教育"],
    nature: "民企",
    jobs: ["教师(不限专业)"],
    location: "郑州/西安/成都", refCode: "EV3JRV",
    link: "https://zzpxx.zhiye.com/campus/jobs?shareId=a798423f-7b11-41dd-95d3-bc9b7fe2f67a&shareSource=2",
    note: ""
  },
  {
    id: "sangfor", name: "深信服", type: "秋招", program: "XSTAR",
    category: ["安全"],
    nature: "民企",
    jobs: ["研发类", "市场类"],
    location: "深圳", refCode: "NTA5MRI",
    link: "https://app.mokahr.com/m/recommendation-apply/sangfor/5369?sharePageId=3755022&recommendCode=NTA5MRI&codeType=1#/recommendation/page/3755022",
    note: "XSTAR顶尖人才计划"
  },
  {
    id: "leihuo", name: "网易游戏雷火", type: "秋招",
    category: ["游戏"],
    nature: "民企",
    jobs: ["游戏策划(虚拟世界架构师)", "技术类", "人工智能类", "游戏艺术/设计类", "综合类"],
    location: "杭州", refCode: null,
    link: "https://xiaozhao.leihuo.netease.com/neitui/#/?introduceId=rFcJTVkshodjfA3x",
    note: "与网易互娱独立，点击链接即内推"
  },
  {
    id: "lilith", name: "莉莉丝游戏", type: "提前批",
    category: ["游戏"],
    nature: "民企",
    jobs: ["技术", "产品", "发行", "测试", "项目管理"],
    location: "上海", refCode: "FEZCZAQ",
    link: "https://lilithgames.jobs.feishu.cn/s/5bD7iVfBpU4",
    note: "校园大使推荐"
  },
  {
    id: "cyou", name: "搜狐畅游", type: "提前批",
    category: ["游戏"],
    nature: "民企",
    jobs: ["游戏美术", "平台业务", "游戏策划", "游戏运营", "平台职能"],
    location: "北京", refCode: "DSRXGUME",
    link: "https://app.mokahr.com/m/campus_apply/cyou-inc/42233?recommendCode=DSRXGUME&hash=%23%2Fjobs#/jobs",
    note: ""
  },
  {
    id: "robosense", name: "速腾聚创", type: "提前批",
    category: ["汽车/智能驾驶"],
    nature: "民企",
    jobs: ["大量技术岗"],
    location: "深圳", refCode: "DS7v3A5m",
    link: "https://app.mokahr.com/m/campus-recruitment/robosense/69887?recommendCode=DS7v3A5m#/jobs",
    note: ""
  },
  {
    id: "nio", name: "蔚来", type: "技术提前批",
    category: ["汽车/智能驾驶"],
    nature: "民企",
    jobs: ["技术岗"],
    location: "上海/北京/合肥", refCode: "FJ7FJCH",
    link: "https://nio.jobs.feishu.cn/s/PF4jsOx7t90",
    note: "选择校园大使推荐"
  },
  {
    id: "mihoyo", name: "米哈游", type: "技术提前批",
    category: ["游戏"],
    nature: "民企",
    jobs: ["程序&技术类", "质量管理类", "技术美术", "技术策划"],
    location: "上海", refCode: "UY7K",
    link: "https://jobs.mihoyo.com/m/?recommendationCode=UY7K&isRecommendation=true#/campus/position",
    note: "技术提前批有机会免笔试直通面试"
  },
  {
    id: "keyence", name: "基恩士", type: "秋招",
    category: ["工业/制造/能源"],
    nature: "外企",
    jobs: ["销售工程师", "销售"],
    location: "全国多地", refCode: "EVKJ10",
    link: "https://keyence.zhiye.com/campus/jobs?shareId=f4c8fe60-3f51-4443-8bd2-081d84b83e89&shareSource=2",
    note: ""
  },
  {
    id: "insta360", name: "影石Insta360", type: "秋招",
    category: ["智能硬件"],
    nature: "民企",
    jobs: ["技术", "美术与设计", "产品", "综合", "业务", "销售", "供应链"],
    location: "深圳", refCode: "HMMUJJQ",
    link: "https://arashivision.jobs.feishu.cn/campus/m",
    note: "选择内推，可投2个岗位"
  },
  {
    id: "awinic", name: "艾为电子", type: "秋招",
    category: ["半导体/电子"],
    nature: "民企",
    jobs: ["大量技术岗(数模混合)"],
    location: "上海", refCode: null,
    link: "https://neitui.italent.cn/awinic/sharejobs?shareId=fb661a70-3c2d-473e-9a2d-69f622bd7857&language=zh_CN",
    note: "点击链接即内推"
  },
  {
    id: "xiaopeng", name: "小鹏汽车", type: "秋招",
    category: ["汽车/智能驾驶"],
    nature: "民企",
    jobs: ["招聘HR", "人力资源", "税务", "开发", "算法"],
    location: "广州/深圳/上海/北京", refCode: "VY2MK8Q",
    link: "https://xiaopeng.jobs.feishu.cn/s/78bZWzoYZ-w",
    note: "选择大使推荐"
  },
  {
    id: "4399", name: "4399游戏", type: "秋招",
    category: ["游戏"],
    nature: "民企",
    jobs: ["策划", "技术", "美术", "运营", "职能"],
    location: "广州", refCode: "9e7qs",
    link: "https://hr.4399om.com/weixin/?r=job/agent&type=2&isOpen=0&jobTableType=1&code=9e7qs",
    note: "六险一金"
  },
  {
    id: "envision", name: "远景能源", type: "秋招",
    category: ["工业/制造/能源"],
    nature: "民企",
    jobs: ["电气", "机械", "自动化", "材料", "能动", "土木等11大类"],
    location: "上海/无锡", refCode: "DSqDB4Mx",
    link: "https://app.mokahr.com/m/campus_apply/envisiongroup/43123?recommendCode=DSqDB4Mx#/jobs",
    note: "全球领先新能源企业"
  },
  {
    id: "nowcoder-event", name: "牛客双选会", type: "活动", isEvent: true,
    category: ["活动"],
    nature: "民企",
    jobs: ["27实习秋招双选会"],
    location: "线上", refCode: null,
    link: "https://uploadfiles.nowcoder.com/files/20260721/1030032950_1784607495959/shuangxuanhui.jpg",
    note: "扫码加牛客官方，填申请表，1分钟即可"
  },
  {
    id: "xiaomi", name: "小米", type: "秋招",
    category: ["智能硬件"],
    nature: "民企",
    jobs: ["算法", "研发", "产品", "运营"],
    location: "北京/上海/深圳/南京/武汉/西安", refCode: "88FQ6SE",
    link: "https://xiaomi.jobs.f.mioffice.cn/s/Mz6F5e_P6mA",
    note: "17+职类全面开放，选择大使推荐"
  },
  {
    id: "tencent", name: "腾讯", type: "秋招",
    category: ["互联网"],
    nature: "民企",
    jobs: ["产品", "技术", "运营", "设计", "市场"],
    location: "深圳/北京/上海/广州/成都/杭州", refCode: "Y60XZLXDKH",
    link: "https://join.qq.com/resume.html?k=aTXCwOsI3BrRBTK2KkA2Pp-koXnwW3cpRelOqQ2wf0I",
    note: ""
  },
  {
    id: "fandow", name: "凡岛", type: "秋招",
    category: ["消费/零售"],
    nature: "民企",
    jobs: ["运营", "市场", "产品", "研发"],
    location: "广州", refCode: "FBTWXNM",
    link: "https://job.fandow.com/home?pushCode=FBTWXNM",
    note: "日化消费品牌"
  },
  {
    id: "obsbot", name: "OBSBOT寻影", type: "秋招",
    category: ["智能硬件"],
    nature: "民企",
    jobs: ["算法", "研发", "硬件", "设计"],
    location: "深圳", refCode: "H55TZDG",
    link: "https://n8r2cr07gk.jobs.feishu.cn/s/mp5Achbcw9U",
    note: "校园大使推荐，智能摄像设备"
  },
  {
    id: "moonton", name: "沐瞳科技", type: "秋招",
    category: ["游戏"],
    nature: "民企",
    jobs: ["策划", "技术", "美术", "运营"],
    location: "上海", refCode: "K4QWT7E",
    link: "https://moonton.jobs.feishu.cn/s/IVUKol8SHEQ",
    note: "字节旗下游戏公司，选择大使推荐"
  },
  {
    id: "yoka", name: "游卡", type: "秋招",
    category: ["游戏"],
    nature: "民企",
    jobs: ["策划", "技术", "美术", "运营"],
    location: "杭州", refCode: "DSaPNpNf",
    link: "https://app.mokahr.com/m/campus-recruitment/yokagames/41940?recommendCode=DSaPNpNf#/jobs",
    note: "三国杀出品方"
  },
  {
    id: "cvte", name: "CVTE视源股份", type: "秋招",
    category: ["智能硬件"],
    nature: "民企",
    jobs: ["技术", "产品", "营销", "职能"],
    location: "广州", refCode: "CVTECDWQY",
    link: "https://campus.cvte.com",
    note: "A股上市，交互智能平板龙头"
  },
  {
    id: "hundsun", name: "恒生电子", type: "秋招",
    category: ["金融科技"],
    nature: "民企",
    jobs: ["研发", "算法", "产品", "测试"],
    location: "杭州", refCode: "EZ3A8B",
    link: "https://campus.hundsun.com/campus/jobs?shareId=21888270-b2a2-4afb-8c23-2725730527fb&shareSource=2",
    note: "金融科技"
  },
  {
    id: "sunwoda", name: "欣旺达", type: "秋招",
    category: ["工业/制造/能源"],
    nature: "民企",
    jobs: ["研发", "工程", "职能"],
    location: "深圳", refCode: "EV3X0V",
    link: "https://sunwodacampus.zhiye.com/campus/jobs?shareId=e0b808c2-4aae-408c-9ad6-1af2a36b01d6&shareSource=2&qr=1",
    note: "锂电池龙头"
  },
  {
    id: "ktc", name: "康冠科技", type: "秋招",
    category: ["智能硬件"],
    nature: "民企",
    jobs: ["研发", "硬件", "销售", "职能"],
    location: "深圳", refCode: "ESVGTG",
    link: "https://careerktc.zhiye.com/campus/jobs?shareId=c347213b-ae3d-4351-93ac-fc74302f26ad&shareSource=2",
    note: "显示终端上市公司"
  },
  {
    id: "horizon", name: "地平线", type: "秋招",
    category: ["汽车/智能驾驶"],
    nature: "民企",
    jobs: ["算法", "软件", "硬件", "测试"],
    location: "北京/上海/杭州/南京", refCode: "dcncha",
    link: "https://wecruit.hotjob.cn/SU62d915040dcad43c775ec12c/mc/position/campus?acotycoCode=dcnhca&projectId=103302&recruitType=1",
    note: "自动驾驶芯片"
  },
  {
    id: "pape", name: "叠纸", type: "秋招",
    category: ["游戏"],
    nature: "民企",
    jobs: ["策划", "美术", "技术", "运营"],
    location: "上海", refCode: "TBVQ96N",
    link: "https://career.papegames.com/s/Ilctrt2OId8",
    note: "恋与制作人出品方，选择大使推荐"
  },
  {
    id: "bambulab", name: "拓竹科技", type: "秋招",
    category: ["智能硬件"],
    nature: "民企",
    jobs: ["算法", "研发", "硬件", "软件"],
    location: "深圳/上海", refCode: "ERN6CB4",
    link: "https://bambulab.jobs.feishu.cn/s/Gm-idTZDK6s",
    note: "3D打印龙头，选择大使推荐"
  },
  {
    id: "zuoyebang", name: "作业帮", type: "秋招",
    category: ["教育"],
    nature: "民企",
    jobs: ["算法", "研发", "产品", "运营"],
    location: "北京/上海/郑州/西安/合肥", refCode: "DSKz14EA",
    link: "https://app.mokahr.com/m/campus_apply/zuoyebang/39595?recommendCode=DSKz14EA&hash=%23%2Fjobs#/jobs",
    note: ""
  },
  {
    id: "cctc", name: "三环集团", type: "秋招",
    category: ["工业/制造/能源"],
    nature: "民企",
    jobs: ["研发", "机电", "职能", "技术支持"],
    location: "潮州/深圳", refCode: "880128",
    link: "https://hr.cctc.cc",
    note: "电子陶瓷与先进材料上市公司"
  },
  {
    id: "luster", name: "凌云光", type: "秋招",
    category: ["AI/机器人"],
    nature: "民企",
    jobs: ["算法", "研发", "光学", "硬件"],
    location: "北京", refCode: "DSQNdtMh",
    link: "https://app.mokahr.com/m/campus_apply/lusterinc/44882?recommendCode=DSQNdtMh#/jobs",
    note: "机器视觉龙头"
  },
  {
    id: "tencentmusic", name: "腾讯音乐", type: "秋招",
    category: ["互联网"],
    nature: "民企",
    jobs: ["AI", "技术", "产品", "设计", "市场"],
    location: "深圳/北京", refCode: "DS2ADHUY",
    link: "https://join.tencentmusic.com/campus/post?type=40",
    note: "腾讯旗下"
  },
  {
    id: "blueinteractive", name: "深蓝互动", type: "秋招",
    category: ["游戏"],
    nature: "民企",
    jobs: ["策划", "美术", "技术", "运营"],
    location: "广州", refCode: "DS9fAcYP",
    link: "https://app.mokahr.com/m/campus_apply/blueinteractive/38434?recommendCode=DS9fAcYP#/jobs",
    note: ""
  },
  {
    id: "ztgame", name: "巨人网络", type: "秋招",
    category: ["游戏"],
    nature: "民企",
    jobs: ["策划", "技术", "美术", "运营"],
    location: "上海", refCode: "DSVThWFJ",
    link: "https://app.mokahr.com/campus-recruitment/ztgame/92438?recommendCode=DSVThWFJ#/jobs",
    note: ""
  },
  {
    id: "lingxi", name: "灵犀互娱", type: "秋招",
    category: ["游戏"],
    nature: "民企",
    jobs: ["策划", "技术", "美术", "运营"],
    location: "广州/杭州/上海", refCode: "11RIL2",
    link: "https://campus-talent.alibaba.com/campus/position?campusShareCode=zcxp_FDgqK0Bk1vouANozytixPuOf9AT0DIYSmzVu0c%3D&batchId=100000760001",
    note: "阿里旗下，加入意向单仅灵犀互娱"
  },
  {
    id: "poizon", name: "得物", type: "秋招",
    category: ["互联网"],
    nature: "民企",
    jobs: ["技术", "产品", "运营", "设计"],
    location: "上海", refCode: "ARUNW33",
    link: "https://poizon.jobs.feishu.cn/s/NXW2B_MdXgk",
    note: "选择校园大使推荐"
  },
  {
    id: "sohu", name: "搜狐集团", type: "秋招",
    category: ["互联网"],
    nature: "民企",
    jobs: ["技术", "产品", "运营", "市场"],
    location: "北京", refCode: "DSeRyPfv",
    link: "https://app.mokahr.com/m/campus_apply/sohu/5682?recommendCode=DSeRyPfv#/jobs",
    note: "搜狐集团（区别于搜狐畅游）"
  },
  {
    id: "didi", name: "滴滴", type: "秋招",
    category: ["互联网"],
    nature: "民企",
    jobs: ["技术", "产品", "运营", "职能"],
    location: "北京", refCode: "DSAyag5c",
    link: "https://app.mokahr.com/m/campus-recruitment/didiglobal/96064?recommendCode=DSAyag5c#/jobs",
    note: ""
  },
  {
    id: "ant", name: "蚂蚁", type: "秋招",
    category: ["金融科技"],
    nature: "民企",
    jobs: ["技术", "产品", "运营", "数据"],
    location: "杭州/北京/上海/深圳", refCode: null,
    link: "https://hrrecommend.antgroup.com/job-list.html?source=campus_external_recommend&code=xy2vWPFu9IUWJcTewzgjZbZ7Med5UTHQgI1OUZgCqDM%3D",
    note: "点击链接即内推"
  },
  {
    id: "taobaoshan", name: "淘宝闪购", type: "秋招",
    category: ["互联网"],
    nature: "民企",
    jobs: ["AI", "运营"],
    location: "杭州", refCode: "2T51KE6G",
    link: "https://campus-talent.alibaba.com/campus/position?campusShareCode=W1cc4K%2FJo7sYKJR55lr5xWWfRCNoEqSAr8bT3AWGkpTRha6TcOM_NtcsyzskX_Vc&batchId=100000760001",
    note: "阿里系，AI类占比95%，选择淘宝闪购岗位"
  },
  {
    id: "bilibili", name: "哔哩哔哩", type: "秋招",
    category: ["互联网"],
    nature: "民企",
    jobs: ["产品运营", "项目管理", "市场", "内容"],
    location: "上海", refCode: "C2P32W",
    link: "https://jobs.bilibili.com/campus/positions?token=875ce039-7878-45de-a0bb-af62dd295ba2&page=1",
    note: ""
  },
  {
    id: "lenovo", name: "联想", type: "秋招",
    category: ["智能硬件"],
    nature: "民企",
    jobs: ["技术", "产品", "市场", "职能"],
    location: "北京", refCode: "2027XZLMLY",
    link: "https://talent.lenovo.com.cn",
    note: "创建简历选联想员工推荐并输入ITcode"
  },
  {
    id: "meituan", name: "美团", type: "秋招",
    category: ["互联网"],
    nature: "民企",
    jobs: ["技术", "产品", "运营", "市场"],
    location: "北京/上海", refCode: "FWPZMZ9",
    link: "https://zhaopin.meituan.com/m/campus",
    note: "内推码填写位置不明显，注意手动填写"
  },
  {
    id: "boke", name: "波克", type: "秋招",
    category: ["游戏"],
    nature: "民企",
    jobs: ["技术", "美术", "产品", "发行"],
    location: "上海", refCode: "VHZ5M8C",
    link: "https://boke.jobs.feishu.cn/s/29bMSqNQCLc",
    note: "选择校园大使推荐"
  },
  {
    id: "fanruan", name: "帆软", type: "提前批",
    category: ["互联网"],
    nature: "民企",
    jobs: ["研发", "产品", "市场", "职能"],
    location: "无锡/南京", refCode: "BLGLY",
    link: "https://t6ixa9nyl6.jiandaoyun.com/f/65e1a1308ce7672fded0f0cf?ext=BLGLY",
    note: "BI软件龙头"
  },
  {
    id: "sunnyoptical", name: "舜宇", type: "秋招",
    category: ["半导体/电子"],
    nature: "民企",
    jobs: ["研发", "光学", "硬件", "职能"],
    location: "宁波", refCode: "DSJEz2rP",
    link: "https://app.mokahr.com/m/campus-recruitment/sunnyoptical/45602?recommendCode=DSJEz2rP#/jobs",
    note: "光学镜头龙头"
  },
  {
    id: "sfauto", name: "四方继保", type: "秋招",
    category: ["工业/制造/能源"],
    nature: "民企",
    jobs: ["研发", "工程", "技术支持"],
    location: "北京", refCode: null,
    link: "https://sf-auto1.zhiye.com/campus/jobs?shareId=6ae9525a-b100-487e-b3e6-9c20c72f6a90&shareSource=2&qr=1&memory=%7B%7D&silence=1",
    note: "电力自动化，点击链接即内推"
  },
  {
    id: "haier", name: "海尔", type: "提前批",
    category: ["智能硬件"],
    nature: "民企",
    jobs: ["研发", "技术", "市场", "职能"],
    location: "青岛/北京/上海", refCode: "GHJ530",
    link: "https://maker.haier.net/client/campusmobile/customizedjobs/type/top.html?inviter_code=UDFMb2ZaK3F3Mjg9",
    note: "家电龙头"
  },
  {
    id: "qunhe", name: "群核科技", type: "秋招",
    category: ["互联网"],
    nature: "民企",
    jobs: ["算法", "研发", "产品", "设计"],
    location: "杭州", refCode: "DS8SfASG",
    link: "https://app.mokahr.com/m/campus_apply/qunhemail/2832?recommendCode=DS8SfASG#/jobs",
    note: "酷家乐母公司"
  },
  {
    id: "arcsoft", name: "虹软科技", type: "提前批",
    category: ["AI/机器人"],
    nature: "民企",
    jobs: ["算法", "研发", "测试"],
    location: "杭州/上海", refCode: "IVVA3A",
    link: "https://neitui.italent.cn/arcsoft/sharejobs?shareId=cb2dfc5d-92ac-4dec-bf3d-0080bda41595&language=zh_CN",
    note: "视觉AI"
  },
  {
    id: "yealink", name: "亿联网络", type: "提前批",
    category: ["智能硬件"],
    nature: "民企",
    jobs: ["研发", "硬件", "软件", "测试"],
    location: "厦门", refCode: "EVBJSA",
    link: "https://yealink.zhiye.com/campus/jobs?shareId=24014015-cb4a-4a8a-beb2-04acf1236b4e&shareSource=2",
    note: "统一通信设备"
  },
  {
    id: "vivo", name: "vivo", type: "秋招",
    category: ["智能硬件"],
    nature: "民企",
    jobs: ["算法", "软件", "硬件", "设计"],
    location: "深圳/东莞", refCode: "EV1AV0",
    link: "https://hr-campus.vivo.com/campus/jobs?shareId=307651af-8827-443a-9fe0-ebd5a0f3e724&shareSource=2",
    note: ""
  },
];
