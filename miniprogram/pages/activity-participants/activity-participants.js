Page({
  data: {
    activityId: null,           // 活动ID
    totalCount: 0,              // 总报名人数
    participants: [],           // 报名人员列表
    isLoading: false,           // 是否加载中
    hasMore: false,             // 是否有更多（简单示例不分页，可根据需要扩展）
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

  // 获取报名人员列表
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
        const { total, list } = result.data.data;
        this.setData({
          totalCount: total,
          participants: list || [],
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

  // 下拉刷新（可选）
  onPullDownRefresh() {
    this.fetchParticipants().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 加载更多（如果后端支持分页，可扩展）
  loadMore() {
    if (this.data.hasMore && !this.data.loadingMore) {
      // 分页逻辑暂不实现，因为接口未返回分页参数
      wx.showToast({ title: '已加载全部', icon: 'none' });
    }
  }
});