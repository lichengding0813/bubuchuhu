Page({
  data: {
    noticeType: 'participant',
    noticeTitle: '须知',
    statusBarHeight: 20,
    hasScrolledToBottom: false
  },

  onLoad(options) {
    const type = options.type || 'participant';
    const titleMap = {
      participant: '报名参与者须知',
      bus: '大巴行程免责声明',
      self: '自驾/高铁行程免责声明'
    };
    const sysInfo = wx.getSystemInfoSync();
    this.setData({
      noticeType: type,
      noticeTitle: titleMap[type],
      statusBarHeight: sysInfo.statusBarHeight || 20
    });

    // 接收来自 details 页面的初始化数据
    const eventChannel = this.getOpenerEventChannel();
    this.eventChannel = eventChannel;
    eventChannel.on('init', (data) => {
      this.agreeField = data.agreeField || '';
    });
  },

  /** scroll-view 滚到底部触发 */
  onScrollToLower() {
    if (!this.data.hasScrolledToBottom) {
      this.setData({ hasScrolledToBottom: true });
    }
  },

  /** 顶部返回按钮：未划到底部时拦截 */
  onTopBackClick() {
    if (this.data.hasScrolledToBottom) {
      wx.navigateBack();
    } else {
      const noticeMap = {
        participant: '报名参与者须知',
        bus: '大巴行程免责声明',
        self: '自驾/高铁行程免责声明'
      };
      const title = noticeMap[this.data.noticeType] || '须知';
      wx.showModal({
        title: '温馨提示',
        content: `请确认已阅读并知晓《${title}》全部条款`,
        showCancel: false,
        confirmText: '我知道了',
        confirmColor: '#5faee3'
      });
    }
  },

  /** 底部"我已知晓"按钮：划到底部后才可点击 */
  onBackClick() {
    if (!this.data.hasScrolledToBottom) return;
    wx.navigateBack();
  },

  onUnload() {
    if (this.eventChannel) {
      this.eventChannel.emit('viewed', {
        type: this.data.noticeType,
        agreeField: this.agreeField || ''
      });
    }
  }
});
