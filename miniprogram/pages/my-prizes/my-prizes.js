const { get } = require('../../utils/api');

Page({
  data: {
    loading: true,
    prizes: [],
    visiblePrizes: [],
    currentFilter: 'all',
    counts: { all: 0, pending: 0, redeemed: 0 }
  },

  onShow() {
    this.loadPrizes();
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

  goToActivity(e) {
    wx.navigateTo({ url: `/pages/details/details?id=${e.currentTarget.dataset.id}` });
  }
});
