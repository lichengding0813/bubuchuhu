const { get } = require('../../utils/api');

Page({
  data: {
    loading: true,
    loadError: '',
    attendanceCount: 0,
    milestoneUnlocked: 0,
    milestoneTotal: 0,
    eventUnlocked: 0,
    nextMilestone: null,
    milestones: [],
    eventBadges: [],
    canManage: false,
    selectedBadge: null
  },

  onLoad() {
    const user = wx.getStorageSync('userInfo');
    if (!user?.openId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.switchTab({ url: '/pages/profile/profile' }), 500);
    }
  },

  onShow() {
    if (wx.getStorageSync('userInfo')?.openId) {
      this.loadAchievements();
    }
  },

  async onPullDownRefresh() {
    try {
      await this.loadAchievements({ silent: true });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async loadAchievements(options = {}) {
    if (!options.silent) this.setData({ loading: true, loadError: '' });
    try {
      const result = await get('/api/achievement-center', {}, { silent: true });
      const data = result.data || {};
      const decorate = item => ({
        ...item,
        unlocked: Boolean(item.unlocked),
        is_physical: Number(item.is_physical || 0),
        statusText: item.unlocked
          ? '已点亮'
          : `还差 ${Number(item.progress?.remaining || 0)} 次`,
        rewardText: item.reward_id
          ? (item.reward_status === 1 ? '实体徽章已领取' : '实体徽章待领取')
          : '实体徽章领取记录待同步'
      });
      this.setData({
        loading: false,
        loadError: '',
        attendanceCount: Number(data.attendance_count || 0),
        milestoneUnlocked: Number(data.milestone_unlocked || 0),
        milestoneTotal: Number(data.milestone_total || 0),
        eventUnlocked: Number(data.event_unlocked || 0),
        nextMilestone: data.next_milestone || null,
        milestones: (data.milestones || []).map(decorate),
        eventBadges: (data.event_badges || []).map(decorate),
        canManage: Boolean(data.can_manage)
      });
    } catch (error) {
      console.error('加载成就中心失败', error);
      this.setData({
        loading: false,
        loadError: error.response?.msg || '成就中心加载失败，请稍后重试'
      });
    }
  },

  onRetry() {
    this.loadAchievements();
  },

  onBadgeTap(e) {
    const type = e.currentTarget.dataset.type;
    const id = Number(e.currentTarget.dataset.id);
    const source = type === 'event' ? this.data.eventBadges : this.data.milestones;
    const selectedBadge = source.find(item => Number(item.id) === id) || null;
    if (selectedBadge) this.setData({ selectedBadge });
  },

  closeBadgeDetail() {
    this.setData({ selectedBadge: null });
  },

  preventTouchMove() {},

  goToMyPrizes() {
    this.closeBadgeDetail();
    wx.navigateTo({ url: '/pages/my-prizes/my-prizes' });
  },

  goToAdmin() {
    if (!this.data.canManage) return;
    wx.navigateTo({ url: '/pages/achievement-admin/achievement-admin' });
  }
});
