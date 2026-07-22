Page({
  data: {
    noticeType: 'participant',
    noticeTitle: '须知',
    statusBarHeight: 20,
    hasScrolledToBottom: false,
    showScrollHint: true
  },

  onLoad(options) {
    const type = options.type || 'participant';
    const titleMap = {
      participant: '报名参与者须知',
      bus: '大巴行程免责声明',
      self: '自驾/高铁行程免责声明',
      organizer: '发起者须知'
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

  /** scroll-view 滚动：超过一定距离后隐藏下拉提示 */
  onScroll(e) {
    if (this.data.showScrollHint && e.detail.scrollTop > 60) {
      this.setData({ showScrollHint: false });
    }
  },

  /** scroll-view 滚到底部触发 */
  onScrollToLower() {
    if (!this.data.hasScrolledToBottom) {
      this.setData({ hasScrolledToBottom: true, showScrollHint: false });
    }
  },

  /** 顶部返回按钮 */
  onTopBackClick() {
    if (this.data.hasScrolledToBottom) {
      wx.navigateBack();
    } else {
      wx.showModal({
        title: '温馨提示',
        content: '请下拉并阅读知晓全部条款',
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
    // 无论从哪个入口进入，返回时都自动勾选对应条款
    const agreeFieldMap = {
      participant: 'agreeNotice',
      bus: 'agreeBus',
      self: 'agreeSelf'
    };
    const agreeField = this.agreeField || agreeFieldMap[this.data.noticeType] || '';
    if (this.eventChannel) {
      this.eventChannel.emit('viewed', {
        type: this.data.noticeType,
        agreeField: agreeField
      });
    }
  }
});
