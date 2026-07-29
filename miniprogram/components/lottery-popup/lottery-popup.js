Component({
  properties: {
    show: { type: Boolean, value: false },
    lotteryInfo: { type: Object, value: {} }
  },
  data: {
    password: '',
    errorText: '',
    attemptsLeft: 3,
    drawing: false,
    result: null
  },
  methods: {
    onPasswordInput(e) {
      this.setData({ password: e.detail.value, errorText: '' });
    },
    async onDraw() {
      const { password, lotteryInfo, attemptsLeft } = this.data;
      if (!password) {
        this.setData({ errorText: '请输入口令' });
        return;
      }
      if (attemptsLeft <= 0) {
        this.setData({ errorText: '口令错误次数已达上限' });
        return;
      }

      this.setData({ drawing: true, errorText: '' });
      try {
        const userInfo = wx.getStorageSync('userInfo');
        const result = await wx.cloud.callContainer({
          config: { env: "prod-3gktwx67d1dd1e76" },
          path: "/api/lottery/draw",
          header: { "X-WX-SERVICE": "flask-mysql-login", "X-Wx-OpenId": userInfo?.openId, "content-type": "application/json" },
          method: "POST",
          data: { lottery_id: lotteryInfo.id, password }
        });
        this.setData({ drawing: false });
        if (result.data && result.data.code === 200) {
          this.setData({ result: result.data.data });
          this.triggerEvent('drawn', result.data.data);
        } else {
          const msg = result.data?.msg || '抽奖失败';
          if (result.data?.already_drawn) {
            this.setData({ errorText: msg });
          } else {
            const left = attemptsLeft - 1;
            this.setData({ attemptsLeft: left, errorText: left > 0 ? msg : '口令错误次数已达上限' });
          }
        }
      } catch (err) {
        this.setData({ drawing: false, errorText: '网络错误' });
      }
    },
    onClose() {
      this.setData({ password: '', errorText: '', result: null, attemptsLeft: 3 });
      this.triggerEvent('close');
    },
    onMaskTap() {
      this.onClose();
    }
  }
});
