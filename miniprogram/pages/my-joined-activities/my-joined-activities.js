Page({
  data: {
    ongoingCount: 0,
    endedCount: 0,
    currentTab: 'ongoing', // ongoing, ended
    currentList: [],
    isLoading: false
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;
    this.setData({ currentTab: tab });
    this.updateCurrentList();
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
        path: "/api/activity/my-participations-grouped",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo.openId,
          "content-type": "application/json"
        },
        method: "GET"
      });

      if (result.data && result.data.code === 200) {
        const { ongoing = [], ended = [] } = result.data.data;

        // 格式化时间
        const formatList = (list) => list.map(item => ({
          ...item,
          activity_time_formatted: this.formatDateTime(item.activity_time),
          is_force_insurance: item.is_force_insurance || 0
        }));

        const ongoingFormatted = formatList(ongoing);
        const endedFormatted = formatList(ended);

        this.setData({
          ongoingCount: ongoingFormatted.length,
          endedCount: endedFormatted.length,
          ongoingList: ongoingFormatted,
          endedList: endedFormatted
        });

        this.updateCurrentList();
      } else {
        wx.showToast({ title: result.data?.msg || '加载失败', icon: 'none' });
      }
    } catch (error) {
      console.error('加载报名活动失败:', error);
      wx.showToast({ title: '网络错误', icon: 'error' });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  updateCurrentList() {
    const { currentTab, ongoingList, endedList } = this.data;
    const currentList = currentTab === 'ongoing' ? (ongoingList || []) : (endedList || []);
    this.setData({ currentList });
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

  onActivityClick(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/details/details?id=${id}`
    });
  }
});