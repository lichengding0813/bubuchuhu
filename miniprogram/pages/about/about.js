Page({
  data: {
    // 可以添加一些数据
  },

  onLoad() {
    console.log('关于我们页面加载')
  },

  // 返回上一页
  onBackClick() {
    wx.navigateBack({
      delta: 1
    })
  },

  // 分享设置
  onShareAppMessage() {
    return {
      title: '步步出沪｜徒然好想走 - 上海wmls户外捞搭子平台',
      path: '/pages/about/about'
    }
  }
})