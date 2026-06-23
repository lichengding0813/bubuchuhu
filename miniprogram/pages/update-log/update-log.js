// pages/update-log/update-log.js
Page({
  data: {
    updateList: [
      {
        version: "1.0.1",
        date: "2025-05-27",
        changes: [
          { emoji: "✨", text: "个人页增加发布和报名活动查看" },
          { emoji: "⚡", text: "首页、活动详情页可微信转发分享给好友" },
          { emoji: "⚡", text: "优化活动详情、活动回顾信息、图片、二维码显示" },
          { emoji: "🔧", text: "修复无法报名的问题" }
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