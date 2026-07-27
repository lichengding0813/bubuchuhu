Page({
  data: {
    currentTab: 'pending', // pending: 待审核, all: 全部
    activityList: [],
    pendingCount: 0,
    totalCount: 0,
    isLoading: false,
    page: 1,
    pageSize: 10,
    hasMore: true,

    // 验证弹窗相关
    showVerifyDialog: false,
    verifyAnswer: '',
    verifyError: '',
    autoFocus: false,
    showLockedDialog: false,
    userInfo: null
  },

  onLoad() {
    this.initUserData();
  },

  onShow() {
    // 每次显示页面时刷新列表
    if (this.data.userInfo && this.data.userInfo.verified === 1) {
      this.loadActivities(true);
      this.loadTotalCount();
    }
  },

  // 初始化用户数据
  onPullDownRefresh() {
    this.loadActivities(true);
    this.loadTotalCount();
    setTimeout(() => wx.stopPullDownRefresh(), 1000);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.setData({ page: this.data.page + 1 });
      this.loadActivities(false);
    }
  },

  async initUserData() {
    const userInfo = wx.getStorageSync('userInfo');
    console.log('管理员页面 - 用户信息:', userInfo);

    if (!userInfo) {
      wx.showModal({
        title: '提示',
        content: '请先登录',
        showCancel: false,
        success: () => {
          wx.switchTab({ url: '/pages/profile/profile' });
        }
      });
      return;
    }
    
    this.setData({ userInfo });
    
    // 获取总活动数量（无论哪个tab都显示）
    this.loadTotalCount();
    
    // 检查是否需要验证
    if (userInfo.needVerify === 1 && userInfo.isBlacklist === 0) {
      this.showVerifyDialog();
    } else if (userInfo.isBlacklist === 1) {
      this.setData({ showLockedDialog: true });
    } else if (userInfo.verified === 1) {
      this.loadActivities(true);
    }
  },

  // 获取总活动数量
  async loadTotalCount() {
    try {
      const userInfo = this.data.userInfo || wx.getStorageSync('userInfo');
      
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/list",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "content-type": "application/json"
        },
        method: "GET",
        data: {
          page: 1,
          size: 1
        }
      });
      
      if (result.data && result.data.code === 200) {
        const total = result.data.data.total || 0;
        this.setData({ totalCount: total });
        console.log('总活动数量:', total);
      }
    } catch (error) {
      console.error('获取总活动数量失败:', error);
    }
  },

  // 获取活动列表
  async loadActivities(reset = false) {
    if (reset) {
      this.setData({
        page: 1,
        hasMore: true,
        isLoading: true,
        activityList: []
      });
    }

    try {
      const userInfo = this.data.userInfo || wx.getStorageSync('userInfo');
      const { currentTab, page, pageSize } = this.data;

      // 根据tab选择不同的接口
      let path = '';
      if (currentTab === 'pending') {
        path = '/api/admin/pending-activities';
      } else {
        path = '/api/activity/list';
      }

      console.log('=== 请求参数 ===');
      console.log('currentTab:', currentTab);
      console.log('path:', path);
      console.log('page:', page);
      console.log('pageSize:', pageSize);
      console.log('openId:', userInfo?.openId);

      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: path,
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "content-type": "application/json"
        },
        method: "GET",
        data: {
          page: page,
          size: pageSize
        }
      });

      console.log('=== 接口返回 ===');
      console.log('result.data:', result.data);

      if (result.data && result.data.code === 200) {
        let activities = [];
        let total = 0;

        if (currentTab === 'pending') {
          activities = result.data.data.list || [];
          total = result.data.data.total || 0;
          this.setData({ pendingCount: total });
          console.log('待审核列表数量:', activities.length);
          console.log('待审核总数:', total);
        } else {
          activities = result.data.data.list || [];
          total = result.data.data.total || 0;
          this.setData({ totalCount: total });
          console.log('全部列表数量:', activities.length);
          console.log('全部总数:', total);
        }

        // 按时间倒序排序（最新的在前面）
        const sortedActivities = activities.sort((a, b) => {
          const timeA = new Date(a.created_at || a.activity_time);
          const timeB = new Date(b.created_at || b.activity_time);
          return timeB - timeA;
        });

        // 格式化活动数据
        const formattedList = sortedActivities.map(item => {
          return {
            id: item.id,
            name: item.name,
            activity_time: item.activity_time,
            activity_time_formatted: this.formatActivityTime(item.activity_time),
            created_at: item.created_at,
            location: item.location,
            description: item.description,
            max_participants: item.max_participants,
            participant_count: item.participant_count || 0,
            status: item.status,
            creator_name: item.creator_name || item.nickName || item.creator_nickname || '未知',
            reject_reason: item.reject_reason,
            difficulty: this.getDifficultyText(item.difficulty),
            cover_url: item.cover_url
          };
        });

        if (reset) {
          this.setData({
            activityList: formattedList,
            hasMore: formattedList.length === pageSize && (page * pageSize < total),
            isLoading: false
          });
        } else {
          this.setData({
            activityList: [...this.data.activityList, ...formattedList],
            hasMore: formattedList.length === pageSize && (page * pageSize < total),
            isLoading: false
          });
        }
      } else if (result.data?.code === 401 && result.data?.needVerify) {
        // 需要重新验证
        this.showVerifyDialog();
        this.setData({ isLoading: false });
      } else if (result.data?.code === 403) {
        // 权限不足，返回上一页
        wx.showModal({
          title: '权限不足',
          content: result.data?.msg || '您没有管理员权限',
          showCancel: false,
          success: () => {
            wx.navigateBack();
          }
        });
        this.setData({ isLoading: false });
      } else {
        console.error('接口返回错误:', result.data);
        throw new Error(result.data?.msg || '加载失败');
      }
    } catch (error) {
      console.error('获取活动列表失败:', error);
      wx.showToast({
        title: '加载活动失败',
        icon: 'none'
      });
      this.setData({ isLoading: false });
    }
  },

  // 加载更多
  loadMore() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.setData({ page: this.data.page + 1 });
      this.loadActivities(false);
    }
  },

  // 切换tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;

    console.log('切换tab:', tab);

    this.setData({
      currentTab: tab,
      page: 1,
      hasMore: true,
      activityList: [],
      isLoading: true
    });

    this.loadActivities(true);
  },

  // 点击活动卡片/查看详情按钮跳转
  onActivityClick(e) {
    const activityId = e.currentTarget.dataset.id;
    console.log('点击查看详情，活动ID:', activityId);
    
    if (!activityId) {
      console.error('活动ID不存在');
      return;
    }
    
    // 跳转到审核专用详情页
    wx.navigateTo({
      url: `/pages/admin-detail/admin-detail?id=${activityId}`
    });
  },

  // ========== 验证相关方法 ==========
  showVerifyDialog() {
    this.setData({
      showVerifyDialog: true,
      verifyAnswer: '',
      verifyError: '',
      autoFocus: true
    }, () => {
      setTimeout(() => this.setData({ autoFocus: false }), 500);
    });
  },

  onAnswerInput(e) {
    this.setData({ verifyAnswer: e.detail.value });
  },

  async onVerifyConfirm() {
    const answer = this.data.verifyAnswer.trim();
    if (!answer) {
      this.setData({ verifyError: '请输入答案' });
      return;
    }

    wx.showLoading({ title: '验证中...' });

    try {
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/verify",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": wx.getStorageSync('userInfo')?.openId,
          "content-type": "application/json"
        },
        method: "POST",
        data: { answer }
      });

      wx.hideLoading();

      if (result.data && result.data.code === 200) {
        const userData = result.data.data;
        this.setData({ userInfo: userData });
        getApp().globalData.userInfo = userData;
        wx.setStorageSync('userInfo', userData);

        if (userData.isBlacklist === 1) {
          this.setData({
            showVerifyDialog: false,
            showLockedDialog: true
          });
        } else if (userData.needVerify === 0) {
          this.setData({ showVerifyDialog: false });
          wx.showToast({ title: '验证通过', icon: 'success' });
          // 验证通过后加载数据
          this.loadTotalCount();
          this.loadActivities(true);
        } else {
          const attempts = userData.verifyAttempts || 0;
          const left = 3 - attempts;
          this.setData({
            verifyError: `答案错误，还剩 ${left} 次机会`,
            verifyAnswer: '',
            autoFocus: true
          });
        }
      } else {
        wx.showToast({ title: result.data?.msg || '验证失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  onLockedConfirm() {
    this.setData({ showLockedDialog: false });
  },

  preventTouchMove() {
    return;
  },

  // ========== 工具函数 ==========
  formatActivityTime(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.replace('T', ' ').split(/[- :]/);
    if (parts.length < 5) return timeStr;
    const month = String(parseInt(parts[1])).padStart(2, '0');
    const day = String(parseInt(parts[2])).padStart(2, '0');
    const hour = String(parseInt(parts[3])).padStart(2, '0');
    const minute = String(parseInt(parts[4])).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  },

  getDifficultyText(level) {
    return (level || 1) + '⭐';
  }
});