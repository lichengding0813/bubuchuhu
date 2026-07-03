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

  refreshDetail() {
    const id = this.data.reviewData.id;
    if (id) {
      this.loadDetail(id);
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


  // 预览图片（支持保存）
  previewImage(e) {
    const currentUrl = e.currentTarget.dataset.src;   // 当前点击的图片
    const { cover, cover2, cover3 } = this.data.reviewData;

    // 构建所有图片的 URL 数组（过滤掉空值）
    const urls = [cover, cover2, cover3].filter(url => url && url.trim() !== '');

    if (urls.length === 0) return;

    wx.previewImage({
      current: currentUrl,   // 当前显示的那张
      urls: urls             // 所有可预览的图片列表
    });
  },

    // 预览图片（支持保存）
    previewPhoto(e) {
      const index = e.currentTarget.dataset.index;          // 当前点击的图片索引
      const photos = this.data.displayPhotos;               // 所有照片对象数组
  
      // 提取所有图片的 url 数组（过滤掉空值或无效地址）
      const urls = photos.map(item => item.url).filter(url => url && url.trim() !== '');
  
      if (urls.length === 0) return;
  
      wx.previewImage({
        current: urls[index],    // 当前显示的图片地址
        urls: urls               // 所有图片地址列表（可左右滑动切换）
      });
    },



  onPhotoPreviewClose() {
    this.setData({ showPhotoPreview: false });
  },

  onSwiperChange(e) {
    this.setData({ currentPhotoIndex: e.detail.current });
  },

  onShareAppMessage() {
    const name = this.data.reviewData.name || '活动回顾';
    return {
      title: name,
      path: `/pages/review-detail/review-detail?id=${this.data.reviewData.id}`
    };
  }
});