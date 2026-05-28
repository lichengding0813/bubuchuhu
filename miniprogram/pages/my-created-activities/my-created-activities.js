Page({
  data: {
    pendingCount: 0,
    totalCount: 0,
    currentTab: 'pending',
    activityList: [],
    isLoading: false
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    if (this.data.currentTab) {
      this.loadData();
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;
    this.setData({ currentTab: tab });
    this.loadData();
  },

  async loadData() {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo?.openId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    this.setData({ isLoading: true });

    try {
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/my-activities-with-audit",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo.openId,
          "content-type": "application/json"
        },
        method: "GET"
      });

      if (result.data && result.data.code === 200) {
        const activities = result.data.data || [];
        const formatted = activities.map(item => ({
          ...item,
          activity_time_formatted: this.formatDateTime(item.activity_time),
          status: item.status,
          participant_count: item.participant_count || 0
        }));

        const pendingList = formatted.filter(item => item.status === 0);
        const totalCount = formatted.length;

        let displayList = [];
        if (this.data.currentTab === 'pending') {
          displayList = pendingList;
        } else {
          displayList = formatted;
        }

        this.setData({
          pendingCount: pendingList.length,
          totalCount: totalCount,
          activityList: displayList
        });
      } else {
        wx.showToast({ title: result.data?.msg || '加载失败', icon: 'none' });
      }
    } catch (error) {
      console.error('加载活动失败:', error);
      wx.showToast({ title: '网络错误', icon: 'error' });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  formatDateTime(timeStr) {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  },

  // 查看详情
  onActivityClick(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/details/details?id=${id}`
    });
  },

  // 编辑活动（驳回后修改 或 审核通过后修改）
  onEditActivity(e) {
    const id = e.currentTarget.dataset.id;
    // 找到当前活动信息，用于判断是否驳回状态（若驳回则进入特殊编辑页，否则进入普通编辑页）
    const activity = this.data.activityList.find(item => item.id === id);
    if (activity && activity.status === 2) {
      // 驳回后重新提交编辑页
      wx.navigateTo({
        url: `/pages/publish/publish?edit=rejected&id=${id}`
      });
    } else {
      // 普通编辑（需确认是否允许修改已通过的活动，根据业务逻辑决定）
      wx.navigateTo({
        url: `/pages/publish/publish?edit=1&id=${id}`
      });
    }
  },

  // 查看报名人员列表
  onViewParticipants(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/activity-participants/activity-participants?activity_id=${id}`
    });
  }
});