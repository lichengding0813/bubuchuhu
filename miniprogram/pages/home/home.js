Page({
  data: {
    showAll: false,
    activityList: [{
        id: 1,
        name: '周末城市徒步',
        time: '05/20 15:00',
        location: '市中心公园',
        remainCount: 8,
        totalCount: 20,
        difficulty: '⭐ 简单',
        statusText: '进行中',
        statusBadge: '可报名',
        statusClass: 'ongoing'
      },
      {
        id: 2,
        name: '露营烧烤夜',
        time: '05/25 18:00',
        location: '星野营地',
        remainCount: 0,
        totalCount: 15,
        difficulty: '⭐⭐ 中等',
        statusText: '已满员',
        statusBadge: '已截止',
        statusClass: 'closed'
      },
      {
        id: 3,
        name: '读书分享会',
        time: '05/28 14:00',
        location: '静安图书馆',
        remainCount: 12,
        totalCount: 30,
        difficulty: '⭐ 轻松',
        statusText: '报名中',
        statusBadge: '新活动',
        statusClass: 'ongoing'
      },
      {
        id: 4,
        name: '溯溪探险之旅',
        time: '06/03 09:00',
        location: '桐庐峡谷',
        remainCount: 5,
        totalCount: 12,
        difficulty: '⭐⭐⭐ 挑战',
        statusText: '报名中',
        statusBadge: '热门',
        statusClass: 'ongoing'
      },
      {
        id: 5,
        name: '夜爬西山看日出',
        time: '06/10 23:00',
        location: '西山国家森林公园',
        remainCount: 3,
        totalCount: 10,
        difficulty: '⭐⭐ 中等',
        statusText: '即将开始',
        statusBadge: '余位少',
        statusClass: 'ongoing'
      },
      {
        id: 6,
        name: '摄影采风徒步',
        time: '06/17 13:00',
        location: '朱家角古镇',
        remainCount: 15,
        totalCount: 20,
        difficulty: '⭐ 简单',
        statusText: '报名中',
        statusBadge: '新活动',
        statusClass: 'ongoing'
      }
    ],
    userInfo: null,
    isLoading: false,
    // 验证弹窗相关
    showVerifyDialog: false,
    verifyAnswer: '',
    verifyError: '',
    autoFocus: false, // 用于控制 input 自动聚焦
    // 锁定弹窗
    showLockedDialog: false
  },

  onLoad() {
    this.loginAndGetUser();
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

  // 显示自定义验证弹窗
  showCustomVerifyDialog() {
    this.setData({
      showVerifyDialog: true,
      verifyAnswer: '',
      verifyError: '',
      autoFocus: true // 自动聚焦
    }, () => {
      // 由于 input 的 focus 属性在动态渲染时可能不生效，延迟设置一次（可选）
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
          // 账户被锁定
          this.setData({
            showVerifyDialog: false,
            showLockedDialog: true
          });
        } else if (userData.needVerify === 0) {
          // 验证通过
          this.setData({
            showVerifyDialog: false
          });
          wx.showToast({
            title: '验证通过',
            icon: 'success'
          });
        } else {
          // 答案错误
          const attempts = userData.verifyAttempts || 0;
          const left = 3 - attempts;
          this.setData({
            verifyError: `答案错误，还剩 ${left} 次机会`,
            verifyAnswer: '', // 可选：清空输入框
            autoFocus: true // 继续自动聚焦
          });
          // 如果剩余次数为0，弹窗会在下次验证时由后端自动锁定，这里保持打开即可
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
    // 不关闭弹窗，强制验证
  },

  // 锁定弹窗确认
  onLockedConfirm() {
    this.setData({
      showLockedDialog: false
    });
    // 可根据需要禁用部分操作
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
      url: '/pages/publish/publish'
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
  }
});