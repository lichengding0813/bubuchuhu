Page({
  data: {
    activityId: null,
    activeCount: 0,             // 有效报名人数（不含同行）
    totalOccupied: 0,            // 实际占用名额（仅有效报名）
    activeParticipants: [],      // 已报名列表
    cancelledParticipants: [],   // 用户自主取消列表
    managedCancelledParticipants: [], // 管理账号手动取消列表
    showCancelled: false,        // 是否展开已取消列表
    showManagedCancelled: false,
    canManage: false,
    managingParticipantId: null,
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
        // 用户自主取消与管理取消分开展示；历史 status=0 视为自主取消。
        const activeParticipants = all.filter(p => p.status === 1);
        const cancelledParticipants = all.filter(p => p.status === 0 && p.cancel_source !== 'manager');
        const managedCancelledParticipants = all.filter(p => p.status === 0 && p.cancel_source === 'manager');
        // 实际占用名额只统计有效报名
        const totalOccupied = activeParticipants.reduce((sum, p) => sum + 1 + (p.companion_count || 0), 0);
        this.setData({
          activeCount: activeParticipants.length,
          totalOccupied: totalOccupied,
          activeParticipants: activeParticipants,
          cancelledParticipants: cancelledParticipants,
          managedCancelledParticipants,
          canManage: result.data.data.can_manage === true,
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

  toggleManagedCancelled() {
    this.setData({ showManagedCancelled: !this.data.showManagedCancelled });
  },

  onManageParticipant(e) {
    const participantId = Number(e.currentTarget.dataset.id);
    const action = e.currentTarget.dataset.action;
    const nickname = e.currentTarget.dataset.name || '该用户';
    if (!this.data.canManage || this.data.managingParticipantId || !participantId) return;

    const isRestore = action === 'restore';
    wx.showModal({
      title: isRestore ? '恢复报名' : '取消报名',
      content: isRestore
        ? `确认恢复“${nickname}”的报名状态？`
        : `确认取消“${nickname}”的报名状态？`,
      confirmText: isRestore ? '恢复' : '取消报名',
      confirmColor: isRestore ? '#4d9fd7' : '#e06a6a',
      success: res => {
        if (res.confirm) this.updateParticipantStatus(participantId, action);
      }
    });
  },

  async updateParticipantStatus(participantId, action) {
    this.setData({ managingParticipantId: participantId });
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: 'prod-3gktwx67d1dd1e76' },
        path: '/api/activity/participants/manage-status',
        header: {
          'X-WX-SERVICE': 'flask-mysql-login',
          'X-Wx-OpenId': userInfo?.openId,
          'content-type': 'application/json'
        },
        method: 'POST',
        data: {
          activity_id: this.data.activityId,
          participant_id: participantId,
          action
        }
      });
      if (result.data?.code !== 200) {
        wx.showToast({ title: result.data?.msg || '操作失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: result.data.msg, icon: 'success' });
      await this.fetchParticipants();
    } catch (error) {
      console.error('管理报名状态失败:', error);
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      this.setData({ managingParticipantId: null });
    }
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
