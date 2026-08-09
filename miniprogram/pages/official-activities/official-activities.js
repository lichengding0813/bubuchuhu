const { get } = require('../../utils/api');

Page({
  data: {
    activityList: [],
    total: 0,
    isLoading: false
  },

  onShow() {
    const userInfo = wx.getStorageSync('userInfo');
    if (Number(userInfo?.isOfficial) !== 1) {
      wx.showModal({
        title: '权限不足',
        content: '仅官方账号可以进入官方活动管理',
        showCancel: false,
        success: () => wx.navigateBack()
      });
      return;
    }
    this.loadActivities();
  },

  async loadActivities() {
    this.setData({ isLoading: true });
    try {
      const result = await get(
        '/api/activity/official-activities',
        { page: 1, size: 100 },
        { silent: true }
      );
      const list = (result.data?.list || []).map(item => ({
        ...item,
        activity_time_formatted: this.formatDateTime(item.activity_time),
        participant_count: Number(item.participant_count) || 0,
        is_force_insurance: Number(item.is_force_insurance) === 1 ? 1 : 0,
        status_text: this.getStatusText(item.status),
        status_class: this.getStatusClass(item.status)
      }));
      this.setData({ activityList: list, total: result.data?.total || list.length });
    } catch (error) {
      console.error('加载官方活动失败', error);
      wx.showToast({ title: error.response?.msg || '加载失败', icon: 'none' });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  formatDateTime(value) {
    if (!value) return '时间待定';
    const parts = String(value).replace('T', ' ').split(/[- :]/);
    if (parts.length < 5) return String(value);
    return `${parts[1]}/${parts[2]} ${parts[3]}:${parts[4]}`;
  },

  getStatusText(status) {
    return ({
      0: '待发布',
      1: '报名中',
      2: '已驳回',
      3: '进行中',
      4: '已结束',
      5: '已取消'
    })[Number(status)] || '未知状态';
  },

  getStatusClass(status) {
    return ({ 1: 'open', 3: 'ongoing', 4: 'ended', 5: 'cancelled' })[Number(status)] || 'pending';
  },

  onCreate() {
    wx.navigateTo({ url: '/pages/publish/publish?official=1' });
  },

  onEdit(e) {
    wx.navigateTo({
      url: `/pages/publish/publish?official=1&id=${e.currentTarget.dataset.id}`
    });
  },

  onDetail(e) {
    wx.navigateTo({
      url: `/pages/details/details?id=${e.currentTarget.dataset.id}`
    });
  },

  onParticipants(e) {
    wx.navigateTo({
      url: `/pages/activity-participants/activity-participants?activity_id=${e.currentTarget.dataset.id}`
    });
  }
});
