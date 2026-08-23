// pages/update-log/update-log.js
Page({
  data: {
    updateList: [
      {
        version: "1.3",
        date: "2026-08-23",
        changes: [
          { emoji: "🏠", text: "首页和活动列表全新升级，浏览活动更清晰" },
          { emoji: "🥕", text: "新增官方活动和官方账号认证，支持只看官方" },
          { emoji: "📅", text: "新增活动日历、天气预报和地图选点" },
          { emoji: "🎡", text: "新增活动抽奖，可查看倒计时和奖品" },
          { emoji: "📖", text: "活动回顾可以直接关联已有官方活动" },
          { emoji: "✍️", text: "路线详情支持加粗、字号和文字颜色" },
          { emoji: "📝", text: "活动支持暂存、撤回和重新编辑" },
          { emoji: "🔧", text: "修复登录、报名、保险显示和部分页面错位问题" }
        ]
      },
      {
        version: "1.2.0",
        date: "2026-07-10",
        changes: [
          { emoji: "🔧", text: "修复登录偶发失败的问题" },
          { emoji: "🔧", text: "修复报名截止时间可能晚于活动开始时间的问题" },
          { emoji: "⚡", text: "优化活动详情页报名区域，减少内容遮挡" },
          { emoji: "✨", text: "新增活动草稿和同行人报名" },
          { emoji: "✨", text: "新增黑名单管理和待审核数量提醒" }
        ]
      },
      {
        version: "1.1.1",
        date: "2026-07-03",
        changes: [
          { emoji: "🔧", text: "修复已报名活动的首页分类展示" },
          { emoji: "⚡", text: "优化活动回顾和详情页图片展示" }
        ]
      },
      {
        version: "1.1.0",
        date: "2026-06-25",
        changes: [
          { emoji: "🔧", text: "修复分享进入详情页时无法返回的问题" },
          { emoji: "🔧", text: "修复活动时间显示不一致的问题" },
          { emoji: "⚡", text: "优化活动须知、保险和报名提示" },
          { emoji: "✨", text: "新增活动取消和用户资料检查" }
        ]
      },
      {
        version: "1.0.1",
        date: "2026-05-27",
        changes: [
          { emoji: "🔧", text: "修复无法报名的问题" },
          { emoji: "⚡", text: "支持分享活动和活动回顾" },
          { emoji: "✨", text: "个人页可以查看发起和报名的活动" }
        ]
      },
      {
        version: "1.0.0",
        date: "2026-05-25",
        changes: [
          { emoji: "✨", text: "步步出沪小程序首次发布" }
        ]
      }
    ]
  }
});
