Page({
  data: {
    activityId: null,
    activeCount: 0,             // 有效报名人数（不含同行）
    totalOccupied: 0,            // 实际占用名额（仅有效报名）
    activeParticipants: [],      // 已报名列表
    cancelledParticipants: [],   // 已取消列表
    showCancelled: false,        // 是否展开已取消列表
    isLoading: false,
    hasMore: false,
  },

  onLoad(options) {
    const { activity_id } = options;
    if (activity_id) {
      this.setData({ activityId: parseInt(activity_id) });
      this.fetchParticipants();
    } else {
      wx.showToast({ title: '活动ID不存在', icon: 'error' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  async fetchParticipants() {
    if (!this.data.activityId) return;
    this.setData({ isLoading: true });

    try {
      const userInfo = wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/participants",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "content-type": "application/json"
        },
        method: "GET",
        data: { activity_id: this.data.activityId }
      });

      if (result.data && result.data.code === 200) {
        const { list } = result.data.data;
        const all = list || [];
        // 按状态拆分：status=1 有效，status=0 已取消
        const activeParticipants = all.filter(p => p.status === 1);
        const cancelledParticipants = all.filter(p => p.status === 0);
        // 实际占用名额只统计有效报名
        const totalOccupied = activeParticipants.reduce((sum, p) => sum + 1 + (p.companion_count || 0), 0);
        this.setData({
          activeCount: activeParticipants.length,
          totalOccupied: totalOccupied,
          activeParticipants: activeParticipants,
          cancelledParticipants: cancelledParticipants,
        });
      } else {
        wx.showToast({ title: result.data?.msg || '获取失败', icon: 'none' });
      }
    } catch (error) {
      console.error('获取报名人员失败:', error);
      wx.showToast({ title: '网络错误', icon: 'error' });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  toggleCancelled() {
    this.setData({ showCancelled: !this.data.showCancelled });
  },

  onPullDownRefresh() {
    this.fetchParticipants().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadMore() {
    if (this.data.hasMore && !this.data.loadingMore) {
      wx.showToast({ title: '已加载全部', icon: 'none' });
    }
  }
});
