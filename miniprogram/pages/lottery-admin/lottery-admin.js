Page({
  data: {
    lotteryList: [],
    showForm: false,
    activityOptions: [],
    activityIndex: 0,
    formPassword: '',
    formStartDate: '',
    formEndDate: '',
    prizeList: [{ tier_name: '一等奖', quantity: 1 }, { tier_name: '二等奖', quantity: 2 }]
  },

  onLoad() {
    this.loadLotteries();
  },

  onShow() {
    this.loadLotteries();
  },

  async loadLotteries() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/admin/lottery/list",
        header: { "X-WX-SERVICE": "flask-mysql-login", "X-Wx-OpenId": userInfo?.openId, "content-type": "application/json" },
        method: "GET"
      });
      if (result.data && result.data.code === 200) {
        this.setData({ lotteryList: result.data.data });
      }
    } catch (err) {
      console.error('加载抽奖列表失败:', err);
    }
  },

  async showCreateForm() {
    await this.loadActivities();
    this.setData({ showForm: true });
  },

  hideCreateForm() {
    this.setData({ showForm: false });
  },

  async loadActivities() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/admin/pending-activities",
        header: { "X-WX-SERVICE": "flask-mysql-login", "X-Wx-OpenId": userInfo?.openId, "content-type": "application/json" },
        method: "GET",
        data: { page: 1, size: 50 }
      });
      if (result.data && result.data.code === 200) {
        const allActivities = result.data.data.list || [];
        const today = new Date().toISOString().split('T')[0];
        const validActivities = allActivities.filter(a => a.status === 1 || a.status === 3 || a.status === 4);
        if (validActivities.length === 0) {
          const listResult = await wx.cloud.callContainer({
            config: { env: "prod-3gktwx67d1dd1e76" },
            path: "/api/activity/list",
            header: { "X-WX-SERVICE": "flask-mysql-login", "X-Wx-OpenId": userInfo?.openId, "content-type": "application/json" },
            method: "GET",
            data: { page: 1, size: 50 }
          });
          if (listResult.data && listResult.data.code === 200) {
            this.setData({ activityOptions: listResult.data.data.list || [] });
          }
        } else {
          this.setData({ activityOptions: validActivities });
        }
      }
    } catch (err) {
      console.error('加载活动列表失败:', err);
    }
  },

  onActivityChange(e) {
    this.setData({ activityIndex: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ formPassword: e.detail.value });
  },

  onStartDateChange(e) {
    this.setData({ formStartDate: e.detail.value });
  },

  onEndDateChange(e) {
    this.setData({ formEndDate: e.detail.value });
  },

  addPrize() {
    const list = this.data.prizeList;
    list.push({ tier_name: '', quantity: 1 });
    this.setData({ prizeList: list });
  },

  removePrize(e) {
    const idx = e.currentTarget.dataset.index;
    const list = this.data.prizeList;
    if (list.length > 1) {
      list.splice(idx, 1);
      this.setData({ prizeList: list });
    }
  },

  onPrizeNameInput(e) {
    const idx = e.currentTarget.dataset.index;
    const list = this.data.prizeList;
    list[idx].tier_name = e.detail.value;
    this.setData({ prizeList: list });
  },

  onPrizeQtyInput(e) {
    const idx = e.currentTarget.dataset.index;
    const list = this.data.prizeList;
    list[idx].quantity = parseInt(e.detail.value) || 0;
    this.setData({ prizeList: list });
  },

  async onCreateLottery() {
    const { activityOptions, activityIndex, formPassword, formStartDate, formEndDate, prizeList } = this.data;
    if (!activityOptions[activityIndex]) {
      wx.showToast({ title: '请选择活动', icon: 'none' });
      return;
    }
    if (!formPassword) {
      wx.showToast({ title: '请输入口令', icon: 'none' });
      return;
    }
    if (!formStartDate || !formEndDate) {
      wx.showToast({ title: '请选择时间', icon: 'none' });
      return;
    }
    const validPrizes = prizeList.filter(p => p.tier_name && p.quantity > 0).map((p, i) => ({
      tier_name: p.tier_name,
      tier_level: i + 1,
      quantity: p.quantity
    }));
    if (validPrizes.length === 0) {
      wx.showToast({ title: '至少配置一个奖品', icon: 'none' });
      return;
    }

    try {
      const userInfo = wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/admin/lottery/create",
        header: { "X-WX-SERVICE": "flask-mysql-login", "X-Wx-OpenId": userInfo?.openId, "content-type": "application/json" },
        method: "POST",
        data: {
          activity_id: activityOptions[activityIndex].id,
          password: formPassword,
          start_time: formStartDate + ' 00:00',
          end_time: formEndDate + ' 23:59',
          prizes: validPrizes
        }
      });
      if (result.data && result.data.code === 200) {
        wx.showToast({ title: '抽奖已创建', icon: 'success' });
        this.setData({ showForm: false, formPassword: '', formStartDate: '', formEndDate: '', prizeList: [{ tier_name: '一等奖', quantity: 1 }, { tier_name: '二等奖', quantity: 2 }] });
        this.loadLotteries();
      } else {
        wx.showToast({ title: result.data?.msg || '创建失败', icon: 'none' });
      }
    } catch (err) {
      console.error('创建抽奖失败:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  onEndLottery(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认结束',
      content: '结束后用户将无法继续抽奖，确认？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const userInfo = wx.getStorageSync('userInfo');
            const result = await wx.cloud.callContainer({
              config: { env: "prod-3gktwx67d1dd1e76" },
              path: "/api/admin/lottery/end",
              header: { "X-WX-SERVICE": "flask-mysql-login", "X-Wx-OpenId": userInfo?.openId, "content-type": "application/json" },
              method: "POST",
              data: { lottery_id: id }
            });
            if (result.data && result.data.code === 200) {
              wx.showToast({ title: '已结束', icon: 'success' });
              this.loadLotteries();
            }
          } catch (err) {
            console.error('结束抽奖失败:', err);
          }
        }
      }
    });
  }
});
