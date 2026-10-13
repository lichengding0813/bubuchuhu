const { get, post } = require('../../utils/api');
const {
  drawQrMatrix,
  REDEMPTION_QR_REFRESH_SECONDS
} = require('../../utils/redemption-qr');

Page({
  data: {
    loading: true,
    loadError: '',
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
    this.setData({ loading: true, loadError: '' });
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
      this.setData({ loadError: error.response?.msg || '奖品加载失败' });
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
    const sourceId = Number(e.currentTarget.dataset.sourceId || 0);
    const sourceType = e.currentTarget.dataset.sourceType || 'lottery';
    if (!sourceId) return;
    this.stopQrTimer();
    this.setData({
      showQr: true,
      qrPrize: {
        source_id: sourceId,
        source_type: sourceType,
        prize_name: e.currentTarget.dataset.prizeName || '中奖奖品'
      },
      qrLoading: false,
      qrReady: false,
      qrError: '',
      qrCountdown: REDEMPTION_QR_REFRESH_SECONDS
    }, () => this.refreshQrCode());
  },

  closeQrCode() {
    this.qrRequestSequence = (this.qrRequestSequence || 0) + 1;
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
    const sourceId = Number(this.data.qrPrize.source_id || 0);
    const sourceType = this.data.qrPrize.source_type || 'lottery';
    if (!this.data.showQr || !sourceId || this.data.qrLoading) return;
    const requestSequence = (this.qrRequestSequence || 0) + 1;
    this.qrRequestSequence = requestSequence;
    this.setData({ qrLoading: true, qrReady: false, qrError: '' });
    try {
      const payload = sourceType === 'achievement'
        ? { source_type: sourceType, reward_id: sourceId }
        : { source_type: sourceType, record_id: sourceId };
      const result = await post('/api/lottery/redemption-qr', payload, { silent: true });
      if (this.qrRequestSequence !== requestSequence || !this.data.showQr) return;
      const matrix = result.data?.matrix || [];
      const expiresIn = Number(result.data?.expires_in) || REDEMPTION_QR_REFRESH_SECONDS;
      this.setData({
        qrLoading: false,
        qrReady: true,
        qrError: '',
        qrCountdown: expiresIn
      }, () => {
        if (this.qrRequestSequence !== requestSequence || !this.data.showQr) return;
        try {
          drawQrMatrix('myPrizeRedemptionQr', matrix, 200);
          this.startQrTimer(expiresIn);
        } catch (error) {
          this.setData({ qrReady: false, qrError: error.message || '二维码绘制失败' });
        }
      });
    } catch (error) {
      if (this.qrRequestSequence !== requestSequence || !this.data.showQr) return;
      this.stopQrTimer();
      this.setData({
        qrLoading: false,
        qrReady: false,
        qrError: error.response?.msg || '二维码生成失败，点击重试'
      });
    }
  },

  goToActivity(e) {
    const activityId = Number(e.currentTarget.dataset.id || 0);
    if (activityId) wx.navigateTo({ url: `/pages/details/details?id=${activityId}` });
  }
});
