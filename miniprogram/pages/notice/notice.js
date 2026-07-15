Page({
  data: {
    noticeType: 'participant',
    noticeTitle: '须知',
    hasScrolledToBottom: false
  },

  onLoad(options) {
    const type = options.type || 'participant';
    const titleMap = {
      participant: '报名参与者须知',
      bus: '大巴行程免责声明',
      self: '自驾/高铁行程免责声明'
    };
    this.setData({ noticeType: type, noticeTitle: titleMap[type] });
    wx.setNavigationBarTitle({ title: titleMap[type] });

    // 接收来自 details 页面的初始化数据
    const eventChannel = this.getOpenerEventChannel();
    this.eventChannel = eventChannel;
    eventChannel.on('init', (data) => {
      this.agreeField = data.agreeField || '';
    });

    // 未划到底部前拦截返回
    wx.enableAlertBeforeUnload({
      message: '请下拉并阅读知晓全部条款'
    });
  },

  /** scroll-view 滚到底部触发 */
  onScrollToLower() {
    if (!this.data.hasScrolledToBottom) {
      this.setData({ hasScrolledToBottom: true });
      // 已读完，解除返回拦截
      wx.enableAlertBeforeUnload({ message: '' });
    }
  },

  /** 底部"我已知晓"按钮：划到底部后才可点击 */
  onBackClick() {
    if (!this.data.hasScrolledToBottom) return;
    wx.navigateBack();
  },

  onUnload() {
    wx.enableAlertBeforeUnload({ message: '' });
    if (this.eventChannel) {
      this.eventChannel.emit('viewed', {
        type: this.data.noticeType,
        agreeField: this.agreeField || ''
      });
    }
  }
});
