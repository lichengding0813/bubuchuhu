const { post } = require('../../utils/api');

const DEFAULT_PRIZES = () => [
  { tier_name: '一等奖', quantity: 1, image_url: '' },
  { tier_name: '二等奖', quantity: 2, image_url: '' }
];

Page({
  data: {
    lotteryList: [],
    showForm: false,
    activityOptions: [],
    activityIndex: 0,
    formPassword: '',
    formStartDate: '',
    formStartTime: '',
    formEndDate: '',
    formEndTime: '',
    uploadingPrizeIndex: -1,
    prizeList: DEFAULT_PRIZES()
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
    const hasActivities = await this.loadActivities();
    if (!hasActivities) {
      wx.showToast({ title: '暂无可创建抽奖的官方活动', icon: 'none' });
      return;
    }
    const start = new Date();
    start.setMinutes(start.getMinutes() + 5, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    this.setData({
      showForm: true,
      formStartDate: this.formatDate(start),
      formStartTime: this.formatClock(start),
      formEndDate: this.formatDate(end),
      formEndTime: this.formatClock(end)
    });
  },

  hideCreateForm() {
    this.setData({ showForm: false });
  },

  async loadActivities() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/admin/lottery/official-activities",
        header: { "X-WX-SERVICE": "flask-mysql-login", "X-Wx-OpenId": userInfo?.openId, "content-type": "application/json" },
        method: "GET"
      });
      if (result.data && result.data.code === 200) {
        const officialActivities = (result.data.data || []).filter(item => Number(item.is_official) === 1);
        this.setData({ activityOptions: officialActivities, activityIndex: 0 });
        return officialActivities.length > 0;
      }
      this.setData({ activityOptions: [], activityIndex: 0 });
      return false;
    } catch (err) {
      console.error('加载活动列表失败:', err);
      this.setData({ activityOptions: [], activityIndex: 0 });
      wx.showToast({ title: '官方活动加载失败', icon: 'none' });
      return false;
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

  onStartTimeChange(e) {
    this.setData({ formStartTime: e.detail.value });
  },

  onEndDateChange(e) {
    this.setData({ formEndDate: e.detail.value });
  },

  onEndTimeChange(e) {
    this.setData({ formEndTime: e.detail.value });
  },

  formatDate(value) {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  formatClock(value) {
    const date = new Date(value);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  addPrize() {
    const list = [...this.data.prizeList];
    list.push({ tier_name: '', quantity: 1, image_url: '' });
    this.setData({ prizeList: list });
  },

  removePrize(e) {
    const idx = e.currentTarget.dataset.index;
    const list = [...this.data.prizeList];
    if (list.length > 1) {
      list.splice(idx, 1);
      this.setData({ prizeList: list });
    }
  },

  onPrizeNameInput(e) {
    const idx = e.currentTarget.dataset.index;
    const list = [...this.data.prizeList];
    list[idx].tier_name = e.detail.value;
    this.setData({ prizeList: list });
  },

  onPrizeQtyInput(e) {
    const idx = e.currentTarget.dataset.index;
    const list = [...this.data.prizeList];
    list[idx].quantity = parseInt(e.detail.value) || 0;
    this.setData({ prizeList: list });
  },

  onPrizeImageTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index) || !this.data.prizeList[index]) return;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (result) => this.uploadPrizeImage(index, result.tempFilePaths[0])
    });
  },

  async uploadPrizeImage(index, filePath) {
    if (!filePath || this.data.uploadingPrizeIndex >= 0) return;
    this.setData({ uploadingPrizeIndex: index });
    wx.showLoading({ title: '上传中...', mask: true });
    let fileID = '';
    try {
      const userInfo = wx.getStorageSync('userInfo') || {};
      const extension = String(filePath.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
      const cloudPath = `lottery/prizes/${userInfo.openId || 'admin'}_${Date.now()}_${index}.${extension}`;
      const uploadResult = await wx.cloud.uploadFile({ cloudPath, filePath });
      fileID = uploadResult.fileID;

      const tempResult = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const tempUrl = tempResult.fileList?.[0]?.tempFileURL;
      if (!tempUrl) throw new Error('图片地址获取失败');
      await post('/check-image-url', { url: tempUrl }, { silent: true });

      const prizeList = [...this.data.prizeList];
      prizeList[index] = { ...prizeList[index], image_url: fileID };
      this.setData({ prizeList });
      wx.showToast({ title: '奖品图已上传', icon: 'success' });
    } catch (error) {
      if (fileID) {
        try { await wx.cloud.deleteFile({ fileList: [fileID] }); } catch (deleteError) {}
      }
      console.error('奖品图上传失败:', error);
      wx.showToast({ title: error.response?.msg || error.message || '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ uploadingPrizeIndex: -1 });
    }
  },

  onRemovePrizeImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const prizeList = [...this.data.prizeList];
    if (!prizeList[index]) return;
    prizeList[index] = { ...prizeList[index], image_url: '' };
    this.setData({ prizeList });
  },

  async onCreateLottery() {
    const {
      activityOptions, activityIndex, formPassword,
      formStartDate, formStartTime, formEndDate, formEndTime, prizeList
    } = this.data;
    if (!activityOptions[activityIndex]) {
      wx.showToast({ title: '请选择官方活动', icon: 'none' });
      return;
    }
    if (Number(activityOptions[activityIndex].is_official) !== 1) {
      wx.showToast({ title: '只有官方活动可以创建抽奖', icon: 'none' });
      return;
    }
    if (!formPassword) {
      wx.showToast({ title: '请输入口令', icon: 'none' });
      return;
    }
    if (!formStartDate || !formStartTime || !formEndDate || !formEndTime) {
      wx.showToast({ title: '请选择时间', icon: 'none' });
      return;
    }
    const startTimestamp = new Date(`${formStartDate}T${formStartTime}:00`).getTime();
    const endTimestamp = new Date(`${formEndDate}T${formEndTime}:00`).getTime();
    if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp) || endTimestamp <= startTimestamp) {
      wx.showToast({ title: '结束时间必须晚于开始时间', icon: 'none' });
      return;
    }
    const validPrizes = prizeList.filter(p => p.tier_name && p.quantity > 0).map((p, i) => ({
      tier_name: p.tier_name,
      tier_level: i + 1,
      quantity: p.quantity,
      image_url: p.image_url || ''
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
          start_time: `${formStartDate} ${formStartTime}`,
          end_time: `${formEndDate} ${formEndTime}`,
          prizes: validPrizes
        }
      });
      if (result.data && result.data.code === 200) {
        wx.showToast({ title: '抽奖已创建', icon: 'success' });
        this.setData({
          showForm: false,
          formPassword: '',
          formStartDate: '',
          formStartTime: '',
          formEndDate: '',
          formEndTime: '',
          prizeList: DEFAULT_PRIZES()
        });
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
