const { post } = require('../../utils/api');

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
  observers: {
    'show, lotteryInfo': function(show, lotteryInfo) {
      if (show && lotteryInfo) {
        this.setData({ attemptsLeft: lotteryInfo.remaining_attempts ?? 3 });
      }
    }
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
        const result = await post('/api/lottery/draw', {
          lottery_id: lotteryInfo.id,
          password
        }, { silent: true });
        this.setData({ drawing: false });
        this.setData({ result: result.data });
        this.triggerEvent('drawn', result.data);
      } catch (err) {
        const response = err.response;
        if (response) {
          const left = response.remaining_attempts ?? attemptsLeft;
          this.setData({ drawing: false, attemptsLeft: left, errorText: response.msg || '抽奖失败' });
        } else {
          this.setData({ drawing: false, errorText: '网络错误' });
        }
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
