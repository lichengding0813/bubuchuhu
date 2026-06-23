// app.js
App({
  onLaunch() {
    // 初始化云开发能力
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'prod-3gktwx67d1dd1e76',
        traceUser: true,
      });
    }
  },
  globalData: {
    userInfo: null
  }
})
