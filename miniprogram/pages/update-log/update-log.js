const { APP_VERSION } = require('../../utils/config');

Page({
  data: {
    updateList: [
      {
        version: APP_VERSION,
        date: "2026-10-13",
        changes: [
          {"emoji": "🔧", "text": "修复成就统计不准确的问题"},
          {"emoji": "🔧", "text": "修复已知问题"},
          {"emoji": "⚡", "text": "优化个人中心与资料维护体验"},
          {"emoji": "⚡", "text": "优化已知问题"},
          {"emoji": "✨", "text": "新增验证题配图与答题提交确认"},
          {"emoji": "✨", "text": "新增活动取消功能"},
        ]
      },
      {
        version: "1.4.0",
        date: "2026-09-25",
        changes: [
          {"emoji": "🔧", "text": "修复中文抽奖口令无法输入的问题"},
          {"emoji": "✨", "text": "新增飘带墙与飘带点亮功能"},
          {"emoji": "✨", "text": "新增成就中心与活动彩蛋徽章"},
        ]
      },
      {
        version: "1.3.2",
        date: "2026-09-04",
        changes: [
          {"emoji": "⚡", "text": "官方活动报名人数上限提升至200人"},
          {"emoji": "✨", "text": "新增活动报名管理功能"},
        ]
      },
      {
        version: "1.3.1",
        date: "2026-09-01",
        changes: [
          {"emoji": "🔧", "text": "修复天气预报异常的问题"},
        ]
      },
      {
        version: "1.3.0",
        date: "2026-08-23",
        changes: [
          {"emoji": "🔧", "text": "修复活动状态显示异常的问题"},
          {"emoji": "🔧", "text": "修复已知问题"},
          {"emoji": "⚡", "text": "优化首页与活动列表"},
          {"emoji": "⚡", "text": "优化活动回顾与路线编辑"},
          {"emoji": "⚡", "text": "优化活动草稿与撤回体验"},
          {"emoji": "✨", "text": "新增官方活动与官方账号认证"},
          {"emoji": "✨", "text": "新增活动日历、天气预报与地图选点"},
          {"emoji": "✨", "text": "新增活动抽奖、我的奖品与兑奖功能"},
          {"emoji": "✨", "text": "新增活动与抽奖提醒"},
        ]
      },
      {
        version: "1.2.0",
        date: "2026-07-10",
        changes: [
          {"emoji": "🔧", "text": "修复偶发登录失败的问题"},
          {"emoji": "🔧", "text": "修复活动报名时间异常的问题"},
          {"emoji": "⚡", "text": "优化活动详情与报名体验"},
          {"emoji": "✨", "text": "新增活动草稿与同行人报名"},
          {"emoji": "✨", "text": "新增黑名单管理与待审核提醒"},
        ]
      },
      {
        version: "1.1.1",
        date: "2026-07-03",
        changes: [
          {"emoji": "🔧", "text": "修复已知问题"},
          {"emoji": "⚡", "text": "优化已知问题"},
        ]
      },
      {
        version: "1.1.0",
        date: "2026-06-25",
        changes: [
          {"emoji": "🔧", "text": "修复分享进入活动详情后无法返回的问题"},
          {"emoji": "🔧", "text": "修复已知问题"},
          {"emoji": "⚡", "text": "优化活动须知与报名提示"},
          {"emoji": "✨", "text": "新增取消报名与资料填写提醒"},
        ]
      },
      {
        version: "1.0.1",
        date: "2026-05-27",
        changes: [
          {"emoji": "🔧", "text": "修复无法报名的问题"},
          {"emoji": "✨", "text": "新增活动分享与个人活动记录"},
        ]
      },
      {
        version: "1.0.0",
        date: "2026-05-25",
        changes: [
          {"emoji": "✨", "text": "步步出沪小程序首次发布"},
        ]
      },
    ]
  }
});
