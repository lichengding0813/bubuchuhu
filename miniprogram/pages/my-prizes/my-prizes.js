const { get, post } = require('../../utils/api');
const {
  drawQrMatrix,
  REDEMPTION_QR_REFRESH_SECONDS
} = require('../../utils/redemption-qr');

Page({
  data: {
    loading: true,
    prizes: [],
    visiblePrizes: [],
    currentFilter: 'all',
    counts: { all: 0, pending: 0, redeemed: 0 },
    showQr: false,
    qrPrize: {},
    qrLoading: false,
    qrReady: false,
    qrError: '',
    qrCountdown: REDEMPTION_QR_REFRESH_SECONDS
  },

  onShow() {
    this.loadPrizes();
  },

  onHide() {
    this.closeQrCode();
  },

  onUnload() {
    this.stopQrTimer();
  },

  async loadPrizes() {
    this.setData({ loading: true });
    try {
      const result = await get('/api/lottery/my-prizes', {}, { silent: true });
      const prizes = result.data || [];
      this.setData({
        prizes,
        counts: {
          all: prizes.length,
          pending: prizes.filter(item => Number(item.redemption_status) === 0).length,
          redeemed: prizes.filter(item => Number(item.redemption_status) === 1).length
        }
      }, () => this.applyFilter());
    } catch (error) {
      console.error('加载我的奖品失败:', error);
      wx.showToast({ title: error.response?.msg || '奖品加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onFilterTap(e) {
    this.setData({ currentFilter: e.currentTarget.dataset.value }, () => this.applyFilter());
  },

  applyFilter() {
    const map = { pending: 0, redeemed: 1 };
    const filter = this.data.currentFilter;
    const visiblePrizes = filter === 'all'
      ? this.data.prizes
      : this.data.prizes.filter(item => Number(item.redemption_status) === map[filter]);
    this.setData({ visiblePrizes });
  },

  copyCode(e) {
    const code = e.currentTarget.dataset.code;
    if (!code) return;
    wx.setClipboardData({ data: code });
  },

  showQrCode(e) {
    const recordId = Number(e.currentTarget.dataset.recordId || 0);
    if (!recordId) return;
    this.stopQrTimer();
    this.setData({
      showQr: true,
      qrPrize: {
        record_id: recordId,
        prize_name: e.currentTarget.dataset.prizeName || '中奖奖品'
      },
      qrLoading: false,
      qrReady: false,
      qrError: '',
      qrCountdown: REDEMPTION_QR_REFRESH_SECONDS
    }, () => this.refreshQrCode());
  },

  closeQrCode() {
    this.stopQrTimer();
    this.setData({
      showQr: false,
      qrPrize: {},
      qrLoading: false,
      qrReady: false,
      qrError: ''
    });
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
      this.refreshQrCode();
    }, 1000);
  },

  async refreshQrCode() {
    const recordId = Number(this.data.qrPrize.record_id || 0);
    if (!recordId || this.data.qrLoading) return;
    this.setData({ qrLoading: true, qrReady: false, qrError: '' });
    try {
      const result = await post('/api/lottery/redemption-qr', {
        record_id: recordId
      }, { silent: true });
      if (Number(this.data.qrPrize.record_id || 0) !== recordId) return;
      const matrix = result.data?.matrix || [];
      const expiresIn = Number(result.data?.expires_in) || REDEMPTION_QR_REFRESH_SECONDS;
      this.setData({
        qrLoading: false,
        qrReady: true,
        qrError: '',
        qrCountdown: expiresIn
      }, () => {
        try {
          drawQrMatrix('myPrizeRedemptionQr', matrix, 200);
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

  goToActivity(e) {
    wx.navigateTo({ url: `/pages/details/details?id=${e.currentTarget.dataset.id}` });
  }
});
