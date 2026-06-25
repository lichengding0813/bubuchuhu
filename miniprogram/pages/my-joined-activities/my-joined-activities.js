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
        let { ongoing = [], ended = [] } = result.data.data;

        // 前端过滤：排除已取消的报名记录（activity_participants.status=0 表示已取消）
        const filterCancelled = (list) => list.filter(item => item.status !== 0);
        ongoing = filterCancelled(ongoing);
        ended = filterCancelled(ended);

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

  // 安全解析时间字符串（兼容 callContainer 的二次转换）
  parseTimeStr(timeStr) {
    if (!timeStr) return null;
    if (timeStr instanceof Date) {
      return {
        year: timeStr.getUTCFullYear(),
        month: timeStr.getUTCMonth() + 1,
        day: timeStr.getUTCDate(),
        hour: timeStr.getUTCHours(),
        minute: timeStr.getUTCMinutes()
      };
    }
    const str = String(timeStr).replace('T', ' ');
    const parts = str.split(/[- :]/);
    if (parts.length >= 5 && !isNaN(parseInt(parts[0]))) {
      return {
        year: parseInt(parts[0]),
        month: parseInt(parts[1]),
        day: parseInt(parts[2]),
        hour: parseInt(parts[3]),
        minute: parseInt(parts[4])
      };
    }
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes()
      };
    }
    return null;
  },

  formatDateTime(timeStr) {
    const t = this.parseTimeStr(timeStr);
    if (!t) return '';
    const month = String(t.month).padStart(2, '0');
    const day = String(t.day).padStart(2, '0');
    const hour = String(t.hour).padStart(2, '0');
    const minute = String(t.minute).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  },

  onActivityClick(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/details/details?id=${id}`
    });
  }
});