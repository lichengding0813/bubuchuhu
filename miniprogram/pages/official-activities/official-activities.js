const { get, post } = require('../../utils/api');

Page({
  data: {
    activityList: [],
    total: 0,
    isLoading: false,
    loadError: '',
    cancellingActivityId: null
  },

  onShow() {
    const userInfo = wx.getStorageSync('userInfo');
    if (Number(userInfo?.isOfficial) !== 1 && Number(userInfo?.isAdmin) !== 1) {
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
    if (this.data.isLoading) return;
    this.setData({ isLoading: true, loadError: '' });
    try {
      const result = await get(
        '/api/activity/official-activities',
        { page: 1, size: 100 },
        { silent: true }
      );
      const list = (result.data?.list || []).map(item => ({
        ...item,
        status: Number(item.status),
        activity_time_formatted: this.formatDateTime(item.activity_time),
        participant_count: Number(item.participant_count) || 0,
        is_force_insurance: Number(item.is_force_insurance) === 1 ? 1 : 0,
        status_text: this.getStatusText(item.status),
        status_class: this.getStatusClass(item.status)
      }));
      this.setData({ activityList: list, total: result.data?.total || list.length });
    } catch (error) {
      console.error('加载官方活动失败', error);
      this.setData({ loadError: error.response?.msg || '官方活动加载失败' });
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
    const activity = this.data.activityList.find(item => String(item.id) === String(e.currentTarget.dataset.id));
    if (activity?.status === 5) return;
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
  },

  onCancelActivity(e) {
    const id = e.currentTarget.dataset.id;
    const activity = this.data.activityList.find(item => String(item.id) === String(id));
    if (this.data.cancellingActivityId !== null || !activity || ![1, 3].includes(activity.status)) return;
    this.setData({ cancellingActivityId: id });
    wx.showModal({
      title: '确认取消活动',
      content: '取消后无法恢复，活动将停止报名和抽奖，不再计入成就。',
      confirmText: '取消活动',
      cancelText: '保留活动',
      confirmColor: '#d95f5f',
      success: async ({ confirm }) => {
        if (!confirm) { this.setData({ cancellingActivityId: null }); return; }
        try {
          await post('/api/activity/cancel', { activity_id: id }, { silent: true, showLoading: true, loadingTitle: '取消中' });
          wx.showToast({ title: '活动已取消', icon: 'success' });
          await this.loadActivities();
        } catch (error) {
          wx.showToast({ title: error.response?.msg || '取消失败，请重试', icon: 'none' });
        } finally {
          this.setData({ cancellingActivityId: null });
        }
      },
      fail: () => this.setData({ cancellingActivityId: null })
    });
  }
});
