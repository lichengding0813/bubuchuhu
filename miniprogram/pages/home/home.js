Page({
  data: {
    showAll: false,
    activityList: [],
    userInfo: null,
    isLoading: false,
    // 验证弹窗相关
    showVerifyDialog: false,
    verifyAnswer: '',
    verifyError: '',
    autoFocus: false,
    showLockedDialog: false
  },

  onLoad() {
    this.loginAndGetUser();
  },

  onShow() {
    // 每次回到首页时，先更新活动状态，再刷新列表
    if (this.data.userInfo) {
      this.updateActivityStatus(); // 异步更新状态（内部会等待完成）
    }
  },

  // 新增：调用后端批量更新活动状态（进行中/已结束）
  async updateActivityStatus() {
    try {
      const userInfo = this.data.userInfo || wx.getStorageSync('userInfo');
      await wx.cloud.callContainer({
        config: {
          env: "prod-3gktwx67d1dd1e76"
        },
        path: "/api/activity/update-status", // 后端新增的接口路径
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "content-type": "application/json"
        },
        method: "POST",
        data: {} // 无需参数
      });
      // 更新成功后，刷新活动列表
      this.getActivityList();
    } catch (error) {
      console.error('更新活动状态失败:', error);
      // 即使更新失败，也尝试正常拉取列表（可能显示旧状态）
      this.getActivityList();
    }
  },

  // 登录并获取用户信息
  async loginAndGetUser() {
    this.setData({
      isLoading: true
    });

    try {
      const loginRes = await this.wxPromise('login');
      if (!loginRes.code) throw new Error('登录失败');

      wx.cloud.init();
      const result = await wx.cloud.callContainer({
        config: {
          env: "prod-3gktwx67d1dd1e76"
        },
        path: "/login",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "content-type": "application/json"
        },
        method: "POST",
        data: {
          code: loginRes.code
        }
      });

      if (result.data && result.data.code === 200) {
        const userData = result.data.data;
        getApp().globalData.userInfo = userData;
        wx.setStorageSync('userInfo', userData);

        this.setData({
          userInfo: userData,
          isLoading: false
        });

        if (result.data.isNew) {
          wx.showToast({
            title: '欢迎新用户',
            icon: 'none'
          });
        }

        if (userData.needVerify === 1 && userData.isBlacklist === 0) {
          this.showCustomVerifyDialog();
        } else if (userData.isBlacklist === 1) {
          this.setData({
            showLockedDialog: true
          });
        }

        // 登录成功后获取活动列表
        this.getActivityList();
      } else {
        throw new Error(result.data?.msg || '登录失败');
      }
    } catch (error) {
      console.error('登录失败：', error);
      wx.showToast({
        title: '登录失败',
        icon: 'error'
      });
      this.setData({
        isLoading: false
      });
    }
  },

  // 获取活动列表
  async getActivityList() {
    try {
      const userInfo = this.data.userInfo || wx.getStorageSync('userInfo');

      const result = await wx.cloud.callContainer({
        config: {
          env: "prod-3gktwx67d1dd1e76"
        },
        path: "/api/activity/list", // 根据蓝图注册的路径
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "content-type": "application/json"
        },
        method: "GET",
        data: {
          page: 1,
          size: 10,
        }
      });
      console.log(result.data)
      if (result.data && result.data.code === 200) {
        const activities = result.data.data.list || [];

        // 格式化活动数据
        let formattedList = activities.map(item => {
          // 计算剩余名额
          const participantCount = item.participant_count || 0;
          const remainCount = item.max_participants - participantCount;

          return {
            id: item.id,
            name: item.name,
            time: this.formatActivityTime(item.activity_time),
            location: item.location,
            remainCount: remainCount,
            totalCount: item.max_participants,
            difficulty: this.getDifficultyText(item.difficulty),
            statusText: this.getStatusText(item.status),
            statusBadge: this.getStatusBadge(item.status, remainCount, item.has_registered),
            statusClass: this.getStatusClass(item.status),
            coverUrl: item.cover_url,
            has_registered: item.has_registered
          };
        });

        // ==============================================
        // ✅ 在这里提前过滤：只保留 可报名 / 已结束 / 已报名
        // ==============================================
        const validStatus = ['可报名', '已结束', '已报名'];
        formattedList = formattedList.filter(item => {
          return validStatus.includes(item.statusBadge);
        });

        // 赋值到 data
        this.setData({
          activityList: formattedList
        });
      }
    } catch (error) {
      console.error('获取活动列表失败:', error);
      wx.showToast({
        title: '加载活动失败',
        icon: 'none'
      });
    }
  },

  // 格式化活动时间
  formatActivityTime(timeStr) {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  },

  // 获取难度文本
  getDifficultyText(level) {
    const map = {
      1: '⭐ 简单',
      2: '⭐⭐ 中等',
      3: '⭐⭐⭐ 困难',
      4: '⭐⭐⭐⭐ 挑战'
    };
    return map[level] || '⭐ 简单';
  },

  // 获取状态文本
  getStatusText(status) {
    const map = {
      0: '待审核',
      1: '报名中',
      2: '审核拒绝',
      3: '进行中',
      4: '已结束',
      5: '已取消'
    };
    return map[status] || '未知';
  },

  // 获取状态徽章
  getStatusBadge(status, remainCount, has_registered) {
    // console.log(has_registered)
    if (has_registered) return '已报名';
    if (status === 1) {
      if (remainCount <= 0) return '已满员';
      return '可报名';
    }
    const map = { 0: '待审核', 2: '已拒绝', 3: '进行中', 4: '已结束', 5: '已取消' };
    return map[status] || '已截止';
  },


  // 获取状态样式类
  getStatusClass(status) {
    const map = {
      0: 'pending', // 待审核
      1: 'ongoing', // 报名中
      2: 'rejected', // 拒绝
      3: 'active', // 进行中
      4: 'ended', // 已结束
      5: 'cancelled' // 已取消
    };
    return map[status] || 'closed';
  },

  // 显示自定义验证弹窗
  showCustomVerifyDialog() {
    this.setData({
      showVerifyDialog: true,
      verifyAnswer: '',
      verifyError: '',
      autoFocus: true
    }, () => {
      setTimeout(() => this.setData({
        autoFocus: false
      }), 500);
    });
  },

  // 输入框变化
  onAnswerInput(e) {
    this.setData({
      verifyAnswer: e.detail.value
    });
  },

  // 点击确认按钮
  async onVerifyConfirm() {
    const answer = this.data.verifyAnswer.trim();
    if (!answer) {
      this.setData({
        verifyError: '请输入答案'
      });
      return;
    }

    wx.showLoading({
      title: '验证中...'
    });
    try {
      const result = await wx.cloud.callContainer({
        config: {
          env: "prod-3gktwx67d1dd1e76"
        },
        path: "/verify",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "content-type": "application/json"
        },
        method: "POST",
        data: {
          answer
        }
      });

      wx.hideLoading();

      if (result.data && result.data.code === 200) {
        const userData = result.data.data;
        getApp().globalData.userInfo = userData;
        wx.setStorageSync('userInfo', userData);
        this.setData({
          userInfo: userData
        });

        if (userData.isBlacklist === 1) {
          this.setData({
            showVerifyDialog: false,
            showLockedDialog: true
          });
        } else if (userData.needVerify === 0) {
          this.setData({
            showVerifyDialog: false
          });
          wx.showToast({
            title: '验证通过',
            icon: 'success'
          });
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
        wx.showToast({
          title: result.data?.msg || '验证失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '网络错误',
        icon: 'none'
      });
    }
  },

  // 点击取消按钮
  onVerifyCancel() {
    wx.showToast({
      title: '请完成验证',
      icon: 'none'
    });
  },

  // 锁定弹窗确认
  onLockedConfirm() {
    this.setData({
      showLockedDialog: false
    });
  },

  // 阻止弹窗蒙层滑动
  preventTouchMove() {
    return;
  },

  // Promise化微信API
  wxPromise(method, options = {}) {
    return new Promise((resolve, reject) => {
      wx[method]({
        ...options,
        success: resolve,
        fail: reject
      });
    });
  },

  // 点击展开/收起
  onToggleExpand() {
    this.setData({
      showAll: !this.data.showAll
    });
  },

  // 点击发布活动按钮
  onPublishClick() {
    wx.navigateTo({
      url: '/pages/publish/publish',
      success: () => {
        // 可以在发布成功后刷新列表，但需要在发布页面返回时触发
      }
    });
  },

  // 点击单个活动卡片
  onActivityClick(e) {
    const {
      id
    } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/details/details?id=${id}`
    });
  },

  onShareAppMessage() {
    return {
      title: '步步出沪|徒然好想走', // 分享卡片的标题
      path: '/pages/home/home', // 用户点开后进入的页面路径，默认为当前页
    }
  },
});