// pages/update-log/update-log.js
Page({
  data: {
    updateList: [
      {
        version: "1.2.0",
        date: "2026-07-25",
        changes: [
          { emoji: "🔧", text: "修复活动发布的必填项和时间校验规则" },
          { emoji: "🔧", text: "修复活动条款须划到底部浏览后返回" },
          { emoji: "⚡", text: "优化页面导航栏显示" },
          { emoji: "⚡", text: "优化活动发起路线详情、活动回顾总结编辑" },
          { emoji: "✨", text: "新增发起活动时可以暂存草稿" },
          { emoji: "✨", text: "新增报名时可以选择同行人数" },
          { emoji: "✨", text: "新增小程序黑名单管理" },
          { emoji: "✨", text: "新增小程序验证问题管理" },
        ]
      },
      {
        version: "1.1.1",
        date: "2025-07-03",
        changes: [
          { emoji: "🔧", text: "修复已报名活动的首页分类展示" },
          { emoji: "⚡", text: "优化活动回顾详情页图片展示，可微信分享" },
          { emoji: "⚡", text: "优化活动详情封面图片显示" }
        ]
      },
      {
        version: "1.1.0",
        date: "2026-06-25",
        changes: [
          { emoji: "🔧", text: "修复通过分享进入详情页时返回按钮无效的问题" },
          { emoji: "🔧", text: "修复时间显示时区不一致问题" },
          { emoji: "⚡", text: "优化首页活动分类显示" },
          { emoji: "⚡", text: "优化活动须知事项设置强制倒计时" },
          { emoji: "⚡", text: "优化强制购买户外保险的提示" },
          { emoji: "⚡", text: "优化报名时群二维码和发起者信息的提示" },
          { emoji: "✨", text: "增加活动自主取消功能" },
          { emoji: "✨", text: "增加活动发布、报名时用户资料完整性检查" },
          { emoji: "✨", text: "增加预设的验证问题和定期重置认证状态" },
        ]
      },
      {
        version: "1.0.1",
        date: "2025-05-27",
        changes: [
          { emoji: "🔧", text: "修复无法报名的问题" },
          { emoji: "⚡", text: "首页、活动详情页可微信转发分享给好友" },
          { emoji: "⚡", text: "优化活动详情、活动回顾信息、图片、二维码显示" },
          { emoji: "✨", text: "个人页增加发布和报名活动查看" }
        ]
      },
      {
        version: "1.0.0",
        date: "2026-05-25",
        changes: [
          { emoji: "✨", text: "【步步出沪 | 徒然好想走】小程序首次发布" },
        ]
      }
    ]
  },

  onLoad(options) {
    // 可以在这里从云函数获取真实的更新日志数据
  }
});