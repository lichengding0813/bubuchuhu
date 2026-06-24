// pages/review/review.js
Page({
  data: {
    reviewList: [],
    isAdmin: false,
    page: 1,
    size: 10,
    loading: false,
    hasMore: true,
    isBlacklisted: false,
    showLockedDialog: false
  },

  onLoad() {
    this.checkBlacklistStatus();
    this.checkAdminStatus();
    this.loadReviewList();
  },

  onShow() {
    // 每次显示页面时重新检查状态，并刷新列表
    this.checkBlacklistStatus();
    this.checkAdminStatus();
    if (this.data.reviewList.length > 0) {
      this.loadReviewList(true); // 刷新
    }
  },

  // 检查黑名单状态
  checkBlacklistStatus() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo.isBlacklist === 1) {
        this.setData({ isBlacklisted: true, showLockedDialog: true });
      } else {
        this.setData({ isBlacklisted: false, showLockedDialog: false });
      }
    } catch (error) {
      console.error('获取用户信息失败', error);
    }
  },

  // 从本地存储获取用户信息，判断是否为管理员
  checkAdminStatus() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      this.setData({ isAdmin: userInfo && userInfo.isAdmin === 1 });
    } catch (error) {
      console.error('获取用户信息失败', error);
      this.setData({ isAdmin: false });
    }
  },

  // 加载活动回顾列表（支持分页）
  async loadReviewList(refresh = false) {
    if (this.data.loading) return;
    if (!refresh && !this.data.hasMore) return;

    this.setData({ loading: true });
    const page = refresh ? 1 : this.data.page;

    try {
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: `/api/reviews?page=${page}&size=${this.data.size}`,
        method: "GET",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "content-type": "application/json"
        }
      });

      if (result.data && result.data.code === 200) {
        const { list, total, page: currentPage } = result.data.data;
        const newList = refresh ? list : [...this.data.reviewList, ...list];
        this.setData({
          reviewList: newList,
          page: currentPage + 1,
          hasMore: newList.length < total,
          loading: false
        });
      } else {
        throw new Error(result.data?.msg || '加载失败');
      }
    } catch (error) {
      console.error('加载活动回顾列表失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadReviewList();
    }
  },

  // 点击卡片进入详情
  onReviewClick(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/review-detail/review-detail?id=${id}` });
  },

  // 新建活动回顾（仅管理员可见）
  onAddReview() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/review_add/review_add?mode=add' });
  },

  // 锁定弹窗确认 - 关闭弹窗但保持遮罩
  onLockedConfirm() {
    this.setData({ showLockedDialog: false });
  },

  // 点击遮罩层提示
  onMaskTap() {
    wx.showToast({ title: '账户已被锁定', icon: 'none' });
  },

  // 阻止滑动
  preventTouchMove() {
    return;
  }
});