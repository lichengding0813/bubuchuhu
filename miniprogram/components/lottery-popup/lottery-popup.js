const { post } = require('../../utils/api');
const {
  drawQrMatrix,
  REDEMPTION_QR_REFRESH_SECONDS
} = require('../../utils/redemption-qr');

const WHEEL_COLORS = ['#dff2fd', '#fff0d9', '#e8f5e9', '#fce5eb', '#e9e5fb', '#dff5f2', '#ffe9d9', '#e7f0ff'];

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
    result: null,
    qrLoading: false,
    qrReady: false,
    qrError: '',
    qrCountdown: REDEMPTION_QR_REFRESH_SECONDS,
    wheelSegments: [],
    wheelBackground: '',
    wheelStyle: 'transform:rotate(0deg);',
    wheelRotation: 0,
    currentLotteryId: 0
  },

  observers: {
    'show, lotteryInfo': function(show, lotteryInfo) {
      if (!show) {
        this.stopQrTimer();
        this.setData({ currentLotteryId: 0 });
        return;
      }
      if (lotteryInfo?.id && Number(lotteryInfo.id) !== Number(this.data.currentLotteryId)) {
        this.stopQrTimer();
        const segments = this.buildSegments(lotteryInfo.prizes || []);
        this.setData({
          currentLotteryId: Number(lotteryInfo.id),
          attemptsLeft: lotteryInfo.remaining_attempts ?? 3,
          wheelSegments: segments,
          wheelBackground: this.buildBackground(segments.length),
          wheelStyle: 'transform:rotate(0deg);',
          wheelRotation: 0,
          result: null,
          errorText: '',
          qrLoading: false,
          qrReady: false,
          qrError: '',
          qrCountdown: REDEMPTION_QR_REFRESH_SECONDS
        });
      }
    }
  },

  lifetimes: {
    detached() {
      if (this.resultTimer) clearTimeout(this.resultTimer);
      this.stopQrTimer();
    }
  },

  methods: {
    buildSegments(prizes) {
      const result = prizes.slice(0, 11).map(prize => ({
        id: Number(prize.id),
        label: prize.tier_name,
        image_url: prize.image_url || ''
      }));
      result.push({ id: 0, label: '谢谢参与', image_url: '' });
      const count = result.length;
      return result.map((item, index) => {
        const angle = (360 / count) * (index + 0.5);
        return {
          ...item,
          segment_style: `transform:rotate(${angle}deg) translateY(-78px) rotate(${-angle}deg);`
        };
      });
    },

    buildBackground(count) {
      if (!count) return '#eef7fd';
      const part = 100 / count;
      const stops = [];
      for (let i = 0; i < count; i += 1) {
        const color = WHEEL_COLORS[i % WHEEL_COLORS.length];
        stops.push(`${color} ${(i * part).toFixed(3)}% ${((i + 1) * part).toFixed(3)}%`);
      }
      return `conic-gradient(${stops.join(',')})`;
    },

    onPasswordInput(e) {
      this.setData({ password: e.detail.value, errorText: '' });
    },

    async onDraw() {
      const { password, lotteryInfo, attemptsLeft, drawing } = this.data;
      if (drawing) return;
      if (Number(lotteryInfo.chances_remaining || 0) <= 0) {
        this.setData({ errorText: '' });
        return;
      }
      if (!password) {
        this.setData({ errorText: '请输入现场口令' });
        return;
      }
      if (attemptsLeft <= 0) {
        this.setData({ errorText: '今天的口令尝试次数已用完' });
        return;
      }

      this.setData({ drawing: true, errorText: '', result: null });
      try {
        const response = await post('/api/lottery/draw', {
          lottery_id: lotteryInfo.id,
          password
        }, { silent: true });
        this.spinToResult(response.data);
      } catch (error) {
        const response = error.response;
        this.setData({
          drawing: false,
          attemptsLeft: response?.remaining_attempts ?? attemptsLeft,
          errorText: response?.msg || '抽奖失败，请稍后重试'
        });
      }
    },

    spinToResult(result) {
      const segments = this.data.wheelSegments;
      let targetIndex = segments.findIndex(item => item.id === Number(result.prize_id || 0));
      if (targetIndex < 0) targetIndex = segments.length - 1;
      const targetAngle = (360 / segments.length) * (targetIndex + 0.5);
      const base = Math.ceil(this.data.wheelRotation / 360) * 360;
      const rotation = base + 5 * 360 + (360 - targetAngle);
      this.setData({
        wheelRotation: rotation,
        wheelStyle: `transform:rotate(${rotation}deg);transition:transform 2.6s cubic-bezier(.16,.72,.18,1);`
      });
      this.resultTimer = setTimeout(() => {
        this.setData({ drawing: false, result }, () => {
          if (result.prize_id) this.refreshRedemptionQr();
        });
        this.triggerEvent('drawn', result);
      }, 2700);
    },

    stopQrTimer() {
      if (this.qrTimer) {
        clearInterval(this.qrTimer);
        this.qrTimer = null;
      }
      this.qrDeadline = 0;
    },

    startQrTimer(seconds) {
      this.stopQrTimer();
      const duration = Math.max(1, Number(seconds) || REDEMPTION_QR_REFRESH_SECONDS);
      this.qrDeadline = Date.now() + duration * 1000;
      this.setData({ qrCountdown: duration });
      this.qrTimer = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((this.qrDeadline - Date.now()) / 1000));
        if (remaining > 0) {
          if (remaining !== this.data.qrCountdown) this.setData({ qrCountdown: remaining });
          return;
        }
        this.stopQrTimer();
        this.refreshRedemptionQr();
      }, 1000);
    },

    async refreshRedemptionQr() {
      const recordId = Number(this.data.result?.record_id || 0);
      if (!recordId || this.data.qrLoading) return;
      this.setData({ qrLoading: true, qrReady: false, qrError: '' });
      try {
        const response = await post('/api/lottery/redemption-qr', {
          record_id: recordId
        }, { silent: true });
        if (Number(this.data.result?.record_id || 0) !== recordId) return;
        const matrix = response.data?.matrix || [];
        const expiresIn = Number(response.data?.expires_in) || REDEMPTION_QR_REFRESH_SECONDS;
        this.setData({
          qrLoading: false,
          qrReady: true,
          qrError: '',
          qrCountdown: expiresIn
        }, () => {
          try {
            drawQrMatrix('lotteryRedemptionQr', matrix, 200, this);
            this.startQrTimer(expiresIn);
          } catch (error) {
            this.setData({ qrReady: false, qrError: error.message || '二维码绘制失败' });
          }
        });
      } catch (error) {
        this.stopQrTimer();
        this.setData({
          qrLoading: false,
          qrReady: false,
          qrError: error.response?.msg || '二维码生成失败，点击重试'
        });
      }
    },

    onDrawAgain() {
      this.stopQrTimer();
      this.setData({
        result: null,
        password: '',
        errorText: '',
        qrLoading: false,
        qrReady: false,
        qrError: ''
      });
    },

    goToMyPrizes() {
      this.onClose();
      wx.navigateTo({ url: '/pages/my-prizes/my-prizes' });
    },

    onClose() {
      if (this.data.drawing) return;
      this.stopQrTimer();
      this.setData({
        password: '',
        errorText: '',
        result: null,
        attemptsLeft: 3,
        qrLoading: false,
        qrReady: false,
        qrError: ''
      });
      this.triggerEvent('close');
    },

    onMaskTap() {
      this.onClose();
    }
  }
});
