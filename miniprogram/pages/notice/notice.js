Page({
  data: {
    noticeType: 'participant',
    noticeTitle: '须知',
    countdown: 3
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

    this.startCountdown();
  },

  startCountdown() {
    let count = 3;
    this.setData({ countdown: count });
    wx.setNavigationBarTitle({ title: `请阅读 ${count}s` });
    wx.enableAlertBeforeUnload({
      enable: true,
      title: '提示',
      content: '请阅读3秒后再返回'
    });
    this.timer = setInterval(() => {
      count--;
      if (count > 0) {
        this.setData({ countdown: count });
        wx.setNavigationBarTitle({ title: `请阅读 ${count}s` });
      } else {
        clearInterval(this.timer);
        this.setData({ countdown: 0 });
        wx.setNavigationBarTitle({ title: this.data.noticeTitle });
        wx.enableAlertBeforeUnload({ enable: false });
      }
    }, 1000);
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer);
    wx.enableAlertBeforeUnload({ enable: false });
    if (this.eventChannel) {
      this.eventChannel.emit('viewed', {
        type: this.data.noticeType,
        agreeField: this.agreeField || ''
      });
    }
  }
});
