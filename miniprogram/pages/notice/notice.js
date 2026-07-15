Page({
  data: {
    noticeType: 'participant',
    noticeTitle: '须知',
    countdown: 3,
    canBack: false,
    statusBarHeight: 20
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
    this.setData({ countdown: count, canBack: false });
    this.timer = setInterval(() => {
      count--;
      if (count > 0) {
        this.setData({ countdown: count });
      } else {
        clearInterval(this.timer);
        this.setData({ countdown: 0, canBack: true });
      }
    }, 1000);
  },

  onBackClick() {
    if (!this.data.canBack) return;
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
