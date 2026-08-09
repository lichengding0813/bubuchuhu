// app.js
const { CLOUD_ENV_ID, CONTAINER_SERVICE, APP_VERSION } = require('./utils/config');

App({
  onLaunch() {
    // 初始化云开发能力
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: CLOUD_ENV_ID,
        traceUser: true,
      });
    }
  },
  globalData: {
    userInfo: null,
    cloudEnv: CLOUD_ENV_ID,
    serviceName: CONTAINER_SERVICE,
    appVersion: APP_VERSION
  }
})
