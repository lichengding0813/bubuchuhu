// pages/review-detail/review-detail.js
Page({
  data: {
    reviewData: {
      id: '',
      name: '',
      time: '',
      location: '',
      difficulty: '',
      distance: 0,
      climb: 0,
      participants: 0,
      summary: '',
      summaryTime: '',
      cover: '',
      cover2: '',
      photos: []
    },
    isAdmin: false,
    displayPhotos: [],
    photoCount: 0,
    showPhotoPreview: false,
    currentPhotoIndex: 0
  },

  onLoad(options) {
    this.checkAdminStatus();
    const id = options.id;
    if (id) {
      this.loadDetail(id);
    } else {
      wx.showToast({ title: '活动不存在', icon: 'none' });
    }
  },

  checkAdminStatus() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      this.setData({ isAdmin: userInfo && userInfo.isAdmin === 1 });
    } catch (error) {
      console.error('获取用户信息失败', error);
      this.setData({ isAdmin: false });
    }
  },

  async loadDetail(id) {
    wx.showLoading({ title: '加载中...' });
    try {
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: `/api/reviews/${id}`,
        method: "GET",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "content-type": "application/json"
        }
      });

      wx.hideLoading();
      if (result.data && result.data.code === 200) {
        const data = result.data.data;
        this.setData({
          reviewData: data,
          displayPhotos: data.photos || [],
          photoCount: (data.photos || []).length
        });
      } else {
        throw new Error(result.data?.msg || '加载失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('加载详情失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onEditClick() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    // 将当前数据存入全局，供编辑页使用
    const app = getApp();
    app.globalData.editReviewData = this.data.reviewData;
    wx.navigateTo({ url: '/pages/review_add/review_add?mode=edit' });
  },

  previewPhoto(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      showPhotoPreview: true,
      currentPhotoIndex: index
    });
  },

  onPhotoPreviewClose() {
    this.setData({ showPhotoPreview: false });
  },

  onSwiperChange(e) {
    this.setData({ currentPhotoIndex: e.detail.current });
  }
});