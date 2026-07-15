Page({
  data: {
    noticeType: 'participant',
    noticeTitle: '须知',
    statusBarHeight: 20,
    countdown: 3,
    topCanBack: false,
    hasScrolledToBottom: false,
    showScrollHint: true
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

    this.startCountdown();
  },

  startCountdown() {
    let count = 3;
    this.setData({ countdown: count, topCanBack: false });
    this.timer = setInterval(() => {
      count--;
      if (count > 0) {
        this.setData({ countdown: count });
      } else {
        clearInterval(this.timer);
        this.setData({ countdown: 0, topCanBack: true });
      }
    }, 1000);
  },

  /** scroll-view 滚动事件：超过一定距离后隐藏下拉提示 */
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
    // 倒计时未结束
    if (!this.data.topCanBack) return;
    // 倒计时结束但未划到底部 → 弹窗拦截
    if (!this.data.hasScrolledToBottom) {
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
      return;
    }
    // 已划到底部 → 正常返回
    wx.navigateBack();
  },

  /** 底部"我已知晓"按钮：划到底部后才可点击 */
  onBackClick() {
    if (!this.data.hasScrolledToBottom) return;
    wx.navigateBack();
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer);
    if (this.eventChannel) {
      this.eventChannel.emit('viewed', {
        type: this.data.noticeType,
        agreeField: this.agreeField || ''
      });
    }
  }
});
