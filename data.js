/* ============================================================
 * 秋招跟踪器 · 数据层
 * 数据更新只改这个文件（新增/修改/删除公司条目）
 * 结构：window.COMPANIES = [{ id, name, type, program, category, jobs, location, refCode, link, note, deadline }]
 *   id       : 稳定唯一标识（slug），用户状态以此为准，禁止修改已发布条目的 id
 *   type     : "秋招" | "提前批" | "技术提前批"
 *   program  : 专项计划名（可选，如 "Elite Program+"）
 *   category : 行业分类 ["游戏","AI","智能驾驶"]
 *   refCode  : 内推码，若为 null 则显示"点击即内推"
 *   deadline : 截止日期 "YYYY-MM-DD"（可选，用于倒计时）
 * ============================================================ */

window.DATA_VERSION = 4;

window.COMPANIES = [
  {
    id: "dian-dian", name: "点点互动", type: "提前批", program: "Elite Program+",
    category: ["游戏"],
    jobs: ["系统策划", "数值策划", "全球广告创意策划", "全球广告投放", "AI agent", "AI算法", "客户端开发", "数据分析"],
    location: "北京", refCode: "ESV4BR",
    link: "https://ddhd.cn/4/jobs?shareId=51edfdaa-c768-48c2-968e-424b71293a6d&shareSource=1&qr=1",
    note: "8月31日前免笔试", deadline: "2026-08-31"
  },
  {
    id: "shopee", name: "Shopee虾皮", type: "秋招",
    category: ["AI"],
    jobs: ["研发岗", "算法岗", "产品岗", "职能岗"],
    location: "北京/上海/深圳", refCode: "DSkUucG8",
    link: "https://app.mokahr.com/m/campus_apply/shopee/2962?recommendCode=DSkUucG8#/jobs",
    note: "常规校招+AI Star Program各1个志愿"
  },
  {
    id: "cmbnt", name: "招银网络科技", type: "秋招",
    category: ["互联网科技"],
    jobs: ["后端开发工程师", "前端开发工程师", "算法工程师", "测试技术开发工程师", "运维研发工程师"],
    location: "深圳/杭州/成都", refCode: "COALPY",
    link: "https://cmbnt.cmbchina.com/pages/bindInvited.html?qrCode=D52CE83B64444EB7AB40B84854BCCA39&rand=1784281202267&blNtCode=COALPY",
    note: "招商银行旗下"
  },
  {
    id: "intsig", name: "合合信息", type: "秋招",
    category: ["AI"],
    jobs: ["算法类", "技术类", "产品类", "运营类", "设计类", "职能类"],
    location: "上海", refCode: "EV3PKS",
    link: "https://intsig.zhiye.com/campus/jobs?shareId=8ca26137-bd70-4a41-bc7d-9b624a9d5a81&shareSource=2",
    note: "全能扫描王母公司"
  },
  {
    id: "itek", name: "埃科光电", type: "秋招",
    category: ["互联网科技"],
    jobs: ["技术岗"],
    location: "合肥", refCode: "XDYXF047",
    link: "http://career.i-tek.cn/",
    note: "简历命名：内推码+岗位-姓名-学校-学历"
  },
  {
    id: "pudu", name: "普渡机器人", type: "秋招",
    category: ["AI"],
    jobs: ["算法", "软件", "硬件", "机械", "产品", "营销"],
    location: "深圳", refCode: "EVKRV0",
    link: "https://pudutech1.zhiye.com/campus/jobs?shareId=71b02d32-26ce-4212-be41-1f7e43d63b4c&shareSource=2",
    note: ""
  },
  {
    id: "iflytek", name: "科大讯飞", type: "秋招",
    category: ["AI"],
    jobs: ["研究算法", "研发", "AI研发", "产品", "营销", "职能", "设计"],
    location: "合肥", refCode: "EVBRH1",
    link: "https://iflytek.zhiye.com/campus/jobs",
    note: "常规+飞凡+飞星，三个项目可同时投递"
  },
  {
    id: "netease-huyu", name: "网易互娱", type: "秋招",
    category: ["游戏"],
    jobs: ["策划", "技术", "美术", "测试", "用户体验", "市场", "运营", "PM"],
    location: "广州/杭州", refCode: "oKFLGH",
    link: "https://campus.game.163.com/?referralCode=oKFLGH",
    note: "与雷火独立，每人可投2个岗位"
  },
  {
    id: "oppo", name: "OPPO", type: "秋招",
    category: ["互联网科技"],
    jobs: ["算法", "软件", "硬件", "营销", "产品等八大类100+岗位"],
    location: "深圳/东莞", refCode: "X1757111",
    link: "https://careers.oppo.com/university/oppo/campus/post?shareId=16923",
    note: "每人可投2个岗位，每周五推进笔试"
  },
  {
    id: "dexmal", name: "Dexmal原力灵机", type: "秋招",
    category: ["AI"],
    jobs: ["研发类", "工程/机械类", "职能/支持类", "产品/策划/项目类"],
    location: "北京/上海", refCode: "966SQH7",
    link: "https://dexmal-inc.jobs.feishu.cn/s/XZm3_Z6dywA",
    note: "选择大使推荐，可投2个岗位"
  },
  {
    id: "threatbook", name: "微步在线", type: "秋招",
    category: ["网络安全"],
    jobs: ["研发", "安全", "产品", "设计", "销售管培", "市场运营"],
    location: "北京", refCode: "DSkqt7Cx",
    link: "https://app.mokahr.com/m/campus_apply/threatbook/39679?recommendCode=DSkqt7Cx#/jobs",
    note: "每人可投2个岗位"
  },
  {
    id: "baidu", name: "百度", type: "秋招",
    category: ["AI"],
    jobs: ["技术类", "产品类", "运营类"],
    location: "北京", refCode: "IZS1K1",
    link: "https://dwz.cn/apEwkEt3",
    note: ""
  },
  {
    id: "dji", name: "DJI大疆", type: "秋招",
    category: ["智能驾驶"],
    jobs: ["算法类", "软件类", "硬件类", "芯片类等12大类100+岗位"],
    location: "深圳", refCode: "DSpqFDWr",
    link: "https://app.mokahr.com/m/campus-recruitment/dji/143359?recommendCode=DSpqFDWr#/jobs",
    note: "每人仅可投递1个岗位"
  },
  {
    id: "xunlei", name: "迅雷", type: "秋招", program: "产品星计划",
    category: ["互联网科技"],
    jobs: ["X-PEP产品星计划", "服务器开发工程师"],
    location: "深圳", refCode: "DSZAne8X",
    link: "https://app.mokahr.com/m/campus_apply/xunlei/26600?recommendCode=DSZAne8X#/jobs",
    note: "校招对象：2026年9月-2027年8月毕业"
  },
  {
    id: "weride", name: "文远知行", type: "秋招",
    category: ["智能驾驶"],
    jobs: ["算法类", "开发类", "硬件类", "测试开发类"],
    location: "广州/北京/上海/深圳", refCode: "DSGpxSZV",
    link: "https://app.mokahr.com/m/campus_apply/jingchi/2137?recommendCode=DSGpxSZV#/jobs",
    note: ""
  },
  {
    id: "agirobot", name: "智元机器人", type: "秋招",
    category: ["AI"],
    jobs: ["技术类", "营销服类", "供应链与制造类"],
    location: "上海", refCode: "4RJGH2F",
    link: "https://agirobot.jobs.feishu.cn/s/BZq88d0rFDw",
    note: "选择大使推荐"
  },
  {
    id: "zhuoyu", name: "卓驭科技", type: "秋招",
    category: ["智能驾驶"],
    jobs: ["算法类", "软件类", "机械电气类", "嵌入式类", "测试类", "安全类", "系统工程类", "非研发类"],
    location: "深圳", refCode: "EZB8SG",
    link: "https://we.zyt.com/campus/jobs?shareId=90d78e3f-7119-41dd-b1cb-cf3679b5e857&shareSource=2",
    note: "原大疆车载"
  },
  {
    id: "hypergryph", name: "鹰角网络", type: "提前批",
    category: ["游戏"],
    jobs: ["游戏引擎开发", "游戏客户端", "角色模型", "场景模型", "战斗策划", "关卡策划"],
    location: "上海", refCode: "DSJsUHpr",
    link: "https://app.mokahr.com/m/campus-recruitment/hypergryph/26326?recommendCode=DSJsUHpr#/jobs",
    note: "提前批即将截止"
  },
  {
    id: "inovance", name: "汇川技术", type: "秋招",
    category: ["互联网科技"],
    jobs: ["技术类", "技能类", "营销类", "供应链管理类", "质量类", "其他职能类"],
    location: "深圳/苏州", refCode: "ADE3CAE",
    link: "https://recruit.inovance.com/#/jobs?ref=ADE3CAE",
    note: ""
  },
  {
    id: "pdd", name: "拼多多", type: "提前批",
    category: ["互联网科技"],
    jobs: ["技术类", "运营类", "职能类", "市场营销类", "设计类", "视觉类"],
    location: "上海", refCode: "CXX5XFMHAH",
    link: "https://careers.pddglobalhr.com/campus/grad?t=CXX5XFMHAH",
    note: "提前批不影响正式批"
  },
  {
    id: "kuaishou", name: "快手", type: "提前批", program: "快Star",
    category: ["AI"],
    jobs: ["大模型", "AI infra", "音视频", "推荐", "广告等九大方向"],
    location: "北京", refCode: "campusYrAmiVqrV",
    link: "https://campus.kuaishou.cn/recruit/campus/e/h5/#/campus/jobs?code=campusYrAmiVqrV",
    note: "技术提前批"
  },
  {
    id: "hesai", name: "禾赛科技", type: "提前批",
    category: ["智能驾驶"],
    jobs: ["技术岗"],
    location: "上海", refCode: null,
    link: "https://kwh0jtf778.jobs.feishu.cn/229043/m/position?external_referral_code=V44VB8A",
    note: "点击链接即内推"
  },
  {
    id: "lemon", name: "柠檬微趣", type: "秋招",
    category: ["游戏"],
    jobs: ["测试", "运营", "策划", "后台", "美术", "客户端", "数据", "运维", "游戏引擎", "AI应用"],
    location: "北京", refCode: "NTAgHHs",
    link: "https://app.mokahr.com/su/luiqht",
    note: ""
  },
  {
    id: "xdf", name: "新东方", type: "提前批",
    category: ["教育"],
    jobs: ["教师(不限专业)"],
    location: "全国多地", refCode: "A3UWK2E",
    link: "https://z2u.tv/wWDUk8",
    note: "内推直通复试，HR 5个工作日内沟通"
  },
  {
    id: "pxx-edu", name: "平行线教育", type: "提前批",
    category: ["教育"],
    jobs: ["教师(不限专业)"],
    location: "郑州/西安/成都", refCode: "EV3JRV",
    link: "https://zzpxx.zhiye.com/campus/jobs?shareId=a798423f-7b11-41dd-95d3-bc9b7fe2f67a&shareSource=2",
    note: ""
  },
  {
    id: "sangfor", name: "深信服", type: "秋招", program: "XSTAR",
    category: ["网络安全"],
    jobs: ["研发类", "市场类"],
    location: "深圳", refCode: "NTA5MRI",
    link: "https://app.mokahr.com/m/recommendation-apply/sangfor/5369?sharePageId=3755022&recommendCode=NTA5MRI&codeType=1#/recommendation/page/3755022",
    note: "XSTAR顶尖人才计划"
  },
  {
    id: "leihuo", name: "网易游戏雷火", type: "秋招",
    category: ["游戏"],
    jobs: ["游戏策划(虚拟世界架构师)", "技术类", "人工智能类", "游戏艺术/设计类", "综合类"],
    location: "杭州", refCode: null,
    link: "https://xiaozhao.leihuo.netease.com/neitui/#/?introduceId=rFcJTVkshodjfA3x",
    note: "与网易互娱独立，点击链接即内推"
  },
  {
    id: "lilith", name: "莉莉丝游戏", type: "提前批",
    category: ["游戏"],
    jobs: ["技术", "产品", "发行", "测试", "项目管理"],
    location: "上海", refCode: "FEZCZAQ",
    link: "https://lilithgames.jobs.feishu.cn/s/5bD7iVfBpU4",
    note: "校园大使推荐"
  },
  {
    id: "cyou", name: "搜狐畅游", type: "提前批",
    category: ["游戏"],
    jobs: ["游戏美术", "平台业务", "游戏策划", "游戏运营", "平台职能"],
    location: "北京", refCode: "DSRXGUME",
    link: "https://app.mokahr.com/m/campus_apply/cyou-inc/42233?recommendCode=DSRXGUME&hash=%23%2Fjobs#/jobs",
    note: ""
  },
  {
    id: "robosense", name: "速腾聚创", type: "提前批",
    category: ["智能驾驶"],
    jobs: ["大量技术岗"],
    location: "深圳", refCode: "DS7v3A5m",
    link: "https://app.mokahr.com/m/campus-recruitment/robosense/69887?recommendCode=DS7v3A5m#/jobs",
    note: ""
  },
  {
    id: "nio", name: "蔚来", type: "技术提前批",
    category: ["智能驾驶"],
    jobs: ["技术岗"],
    location: "上海/北京/合肥", refCode: "FJ7FJCH",
    link: "https://nio.jobs.feishu.cn/s/PF4jsOx7t90",
    note: "选择校园大使推荐"
  },
  {
    id: "mihoyo", name: "米哈游", type: "技术提前批",
    category: ["游戏"],
    jobs: ["程序&技术类", "质量管理类", "技术美术", "技术策划"],
    location: "上海", refCode: "UY7K",
    link: "https://jobs.mihoyo.com/m/?recommendationCode=UY7K&isRecommendation=true#/campus/position",
    note: "技术提前批有机会免笔试直通面试"
  },
  {
    id: "keyence", name: "基恩士", type: "秋招",
    category: ["互联网科技"],
    jobs: ["销售工程师", "销售"],
    location: "全国多地", refCode: "EVKJ10",
    link: "https://keyence.zhiye.com/campus/jobs?shareId=f4c8fe60-3f51-4443-8bd2-081d84b83e89&shareSource=2",
    note: ""
  },
  {
    id: "insta360", name: "影石Insta360", type: "秋招",
    category: ["互联网科技"],
    jobs: ["技术", "美术与设计", "产品", "综合", "业务", "销售", "供应链"],
    location: "深圳", refCode: "HMMUJJQ",
    link: "https://arashivision.jobs.feishu.cn/campus/m",
    note: "选择内推，可投2个岗位"
  },
  {
    id: "awinic", name: "艾为电子", type: "秋招",
    category: ["互联网科技"],
    jobs: ["大量技术岗(数模混合)"],
    location: "上海", refCode: null,
    link: "https://neitui.italent.cn/awinic/sharejobs?shareId=fb661a70-3c2d-473e-9a2d-69f622bd7857&language=zh_CN",
    note: "点击链接即内推"
  },
  {
    id: "xiaopeng", name: "小鹏汽车", type: "秋招",
    category: ["智能驾驶"],
    jobs: ["招聘HR", "人力资源", "税务", "开发", "算法"],
    location: "广州/深圳/上海/北京", refCode: "VY2MK8Q",
    link: "https://xiaopeng.jobs.feishu.cn/s/78bZWzoYZ-w",
    note: "选择大使推荐"
  },
  {
    id: "4399", name: "4399游戏", type: "秋招",
    category: ["游戏"],
    jobs: ["策划", "技术", "美术", "运营", "职能"],
    location: "广州", refCode: "9e7qs",
    link: "https://hr.4399om.com/weixin/?r=job/agent&type=2&isOpen=0&jobTableType=1&code=9e7qs",
    note: "六险一金"
  },
  {
    id: "envision", name: "远景能源", type: "秋招",
    category: ["互联网科技"],
    jobs: ["电气", "机械", "自动化", "材料", "能动", "土木等11大类"],
    location: "上海/无锡", refCode: "DSqDB4Mx",
    link: "https://app.mokahr.com/m/campus_apply/envisiongroup/43123?recommendCode=DSqDB4Mx#/jobs",
    note: "全球领先新能源企业"
  },
  {
    id: "nowcoder-event", name: "牛客双选会", type: "活动", isEvent: true,
    category: ["活动"],
    jobs: ["27实习秋招双选会"],
    location: "线上", refCode: null,
    link: "https://uploadfiles.nowcoder.com/files/20260721/1030032950_1784607495959/shuangxuanhui.jpg",
    note: "扫码加牛客官方，填申请表，1分钟即可"
  }
];
