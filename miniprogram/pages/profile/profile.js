Page({
  data: {
    userInfo: {
      nickName: '点击登录',
      avatarUrl: '',
      isLogin: false,
      openId: '',
      phoneNumber: '',
      verified: 0,
      needVerify: 0,
      isBlacklist: 0,
      isAdmin: 0,
      createTime: '',
      lastLoginTime: '',
      loginCount: 0
    },
    stats: {
      created: 0,
      joined: 0
    },
    showVerifyDialog: false,
    verifyAnswer: '',
    verifyError: '',
    verifyQuestion: '',
    verifyQuestionIdx: 0,
    showLockedDialog: false,
    isBlacklisted: false,
    remainingAttempts: 2,
    openId: '',
    isLoading: false,
    menuList: [{
        icon: 'setting',
        text: '个人信息设置',
        url: '/pages/settings/settings'
      },
      {
        icon: 'info',
        text: '关于我们',
        url: '/pages/about/about'
      },
      {
        icon: 'records',
        text: '更新日志',
        url: '/pages/update-log/update-log'
      },
    ]
  },

  onLoad() {
    this.initUserData();
    this.loadUserStats();
  },

  onShow() {
    this.initUserData();
    // 每次显示页面时刷新统计数据（如果已登录）
    if (this.data.userInfo.isLogin) {
      this.loadUserStats();
    }
  },

  // 从storage初始化用户数据
  initUserData() {
    try {
      const storageUserInfo = wx.getStorageSync('userInfo');
      console.log('storageUserInfo:', storageUserInfo);
      
      if (storageUserInfo) {
        this.setData({
          userInfo: {
            ...storageUserInfo,
            isLogin: true
          },
          openId: storageUserInfo.openId || ''
        });
        this.updatePendingRedDot(storageUserInfo.needVerify);
        this.buildMenuList();
        // 检查黑名单状态
        if (storageUserInfo.isBlacklist === 1) {
          this.setData({ isBlacklisted: true, showLockedDialog: true });
        }
      } else {
        // 未登录状态：只显示公开菜单（关于我们、更新日志）
        this.setData({
          userInfo: {
            nickName: '点击登录',
            avatarUrl: '',
            isLogin: false,
            openId: '',
            phoneNumber: '',
            verified: 0,
            needVerify: 0,
            isBlacklist: 0,
            isAdmin: 0,
            createTime: '',
            lastLoginTime: '',
            loginCount: 0
          },
          menuList: [
            {
              icon: 'info',
              text: '关于我们',
              url: '/pages/about/about'
            },
            {
              icon: 'records',
              text: '更新日志',
              url: '/pages/update-log/update-log'
            }
          ]
        });
      }
    } catch (error) {
      console.error('获取storage用户信息失败', error);
    }
  },

  // 动态构建菜单列表（登录后使用）
  buildMenuList() {
    const { isAdmin, needVerify } = this.data.userInfo;
    const menuList = [];
    
    // 个人信息设置（登录后显示）
    menuList.push({
      icon: 'setting',
      text: '个人信息设置',
      url: '/pages/settings/settings'
    });
    
    // 只有管理员才显示待审核入口
    if (isAdmin === 1) {
      menuList.push({
        icon: 'records',
        text: '待审核',
        url: '/pages/admin-review/admin-review',
        showRedDot: needVerify === 1
      });
      menuList.push({
        icon: 'replay',
        text: '全员重新验证',
        action: 'resetVerification'
      });
    }
    
    // 关于我们
    menuList.push({
      icon: 'info',
      text: '关于我们',
      url: '/pages/about/about'
    });
    
    // 更新日志（始终显示）
    menuList.push({
      icon: 'records',
      text: '更新日志',
      url: '/pages/update-log/update-log'
    });
    
    console.log('当前用户 isAdmin:', isAdmin);
    this.setData({ menuList });
  },

  // 更新待审核红点状态
  updatePendingRedDot(needVerify) {
    const menuList = this.data.menuList.map(item => {
      if (item.text === '待审核') {
        return {
          ...item,
          showRedDot: needVerify === 1
        };
      }
      return item;
    });
    this.setData({ menuList });
  },

  // 加载用户统计数据（调用后端接口）
  async loadUserStats() {
    const { isLogin, openId } = this.data.userInfo;
    if (!isLogin || !openId) {
      // 未登录时清空统计数据
      this.setData({
        stats: { created: 0, joined: 0 }
      });
      return;
    }
    
    // 并行请求两个接口
    await Promise.all([
      this.fetchCreatedCount(openId),
      this.fetchJoinedCount(openId)
    ]);
  },

  // 获取我发起的活动数量
  async fetchCreatedCount(openId) {
    try {
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/my-activities-with-audit",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": openId,
          "content-type": "application/json"
        },
        method: "GET"
      });
      
      if (result.data && result.data.code === 200) {
        const activities = result.data.data || [];
        this.setData({
          'stats.created': activities.length
        });
      } else {
        console.error('获取发起活动数量失败:', result.data?.msg);
        this.setData({ 'stats.created': 0 });
      }
    } catch (error) {
      console.error('获取发起活动异常:', error);
      this.setData({ 'stats.created': 0 });
    }
  },

  // 获取我报名的活动数量（进行中+已结束）
  async fetchJoinedCount(openId) {
    try {
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/my-participations-grouped",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": openId,
          "content-type": "application/json"
        },
        method: "GET"
      });
      
      if (result.data && result.data.code === 200) {
        const { ongoing = [], ended = [] } = result.data.data;
        const total = ongoing.length + ended.length;
        this.setData({
          'stats.joined': total
        });
      } else {
        console.error('获取报名活动数量失败:', result.data?.msg);
        this.setData({ 'stats.joined': 0 });
      }
    } catch (error) {
      console.error('获取报名活动异常:', error);
      this.setData({ 'stats.joined': 0 });
    }
  },

  // 处理登录点击
  onLoginClick() {
    if (!this.data.userInfo.isLogin) {
      this.handleLogin();
    } else {
      this.goToUserDetail();
    }
  },

  // 处理菜单点击
  onMenuClick(e) {
    const { index } = e.currentTarget.dataset;
    const menu = this.data.menuList[index];
    
    // 优先处理 action 类型菜单
    if (menu.action === 'resetVerification') {
      this.onResetVerification();
      return;
    }

    // 未登录状态限制
    if (!this.data.userInfo.isLogin && menu.text !== '关于我们' && menu.text !== '更新日志') {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    switch(menu.text) {
      case '关于我们':
      case '更新日志':
      case '个人信息设置':
        wx.navigateTo({ url: menu.url });
        break;
      case '待审核':
        if (this.data.userInfo.needVerify) {
          this.setData({
            showVerifyDialog: true,
            verifyQuestion: this.data.userInfo.verifyQuestion || '',
            verifyQuestionIdx: this.data.userInfo.verifyQuestionIdx || 0,
            verifyAnswer: '',
            verifyError: ''
          });
        } else {
          wx.navigateTo({ url: menu.url });
        }
        break;
      default:
        wx.showToast({
          title: `点击${menu.text}`,
          icon: 'none'
        });
    }
  },

  // ========== 登录相关方法 ==========
  async handleLogin() {
    this.setData({ isLoading: true });
    
    try {
      const loginRes = await this.wxPromise('login');
      if (!loginRes.code) throw new Error('登录失败');

      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/login",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "content-type": "application/json"
        },
        method: "POST",
        data: { code: loginRes.code }
      });

      if (result.data && result.data.code === 200) {
        const userData = result.data.data;
        // 将验证问题信息合并到 userData 中
        if (result.data.verifyQuestion) {
          userData.verifyQuestion = result.data.verifyQuestion;
          userData.verifyQuestionIdx = result.data.verifyQuestionIdx;
        }
        console.log('登录成功，用户信息:', userData);
        
        getApp().globalData.userInfo = userData;
        wx.setStorageSync('userInfo', userData);
        
        this.setData({
          userInfo: {
            ...userData,
            isLogin: true
          },
          isLoading: false
        });
        
        this.buildMenuList();
        
        // 登录成功后加载统计数据
        this.loadUserStats();
        
        if (userData.needVerify === 1 && userData.isBlacklist === 0) {
          // 存储验证问题
          const updateData = { showVerifyDialog: true };
          if (result.data.verifyQuestion) {
            updateData.verifyQuestion = result.data.verifyQuestion;
            updateData.verifyQuestionIdx = result.data.verifyQuestionIdx;
          }
          this.setData(updateData);
        } else if (userData.isBlacklist === 1) {
          this.setData({ showLockedDialog: true, isBlacklisted: true });
        } else {
          wx.showToast({ title: '登录成功', icon: 'success' });
        }
      } else {
        throw new Error(result.data?.msg || '登录失败');
      }
    } catch (error) {
      console.error('登录失败：', error);
      wx.showToast({ title: '登录失败', icon: 'error' });
      this.setData({ isLoading: false });
    }
  },

  // ========== 验证相关方法 ==========
  showVerifyDialogBox() {
    const userInfo = this.data.userInfo;
    this.setData({
      showVerifyDialog: true,
      verifyAnswer: '',
      verifyError: '',
      verifyQuestion: userInfo.verifyQuestion || '',
      verifyQuestionIdx: userInfo.verifyQuestionIdx || 0,
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
          "content-type": "application/json"
        },
        method: "POST",
        data: { answer, question_idx: this.data.verifyQuestionIdx }
      });

      wx.hideLoading();

      if (result.data && result.data.code === 200) {
        const userData = result.data.data;
        // 更新验证问题信息到 userData
        if (result.data.verifyQuestion) {
          userData.verifyQuestion = result.data.verifyQuestion;
          userData.verifyQuestionIdx = result.data.verifyQuestionIdx;
        }
        this.setData({ userInfo: { ...userData, isLogin: true } });
        getApp().globalData.userInfo = userData;
        wx.setStorageSync('userInfo', userData);
        
        this.buildMenuList();

        if (userData.isBlacklist === 1) {
          this.setData({
            showVerifyDialog: false,
            showLockedDialog: true,
            isBlacklisted: true
          });
        } else if (userData.needVerify === 0) {
          this.setData({ showVerifyDialog: false });
          wx.showToast({ title: '验证通过', icon: 'success' });
          // 验证通过后刷新统计数据
          this.loadUserStats();
        } else {
          // 验证失败，更新验证问题（后端可能返回新题）
          const updateData = {
            verifyError: `答案错误，还剩 ${3 - (userData.verifyAttempts || 0)} 次机会`,
            verifyAnswer: '',
            autoFocus: true
          };
          if (result.data.verifyQuestion) {
            updateData.verifyQuestion = result.data.verifyQuestion;
            updateData.verifyQuestionIdx = result.data.verifyQuestionIdx;
          }
          this.setData(updateData);
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

  // 点击遮罩层提示
  onMaskTap() {
    wx.showToast({ title: '账户已被锁定', icon: 'none' });
  },

  // ========== 全员重新验证 ==========
  onResetVerification() {
    wx.showModal({
      title: '确认操作',
      content: '将重置所有非管理员用户的验证状态，所有用户下次进入时需要重新回答验证问题。确定继续？',
      confirmText: '确定重置',
      confirmColor: '#ee0a24',
      success: (res) => {
        if (res.confirm) {
          this.doResetVerification();
        }
      }
    });
  },

  async doResetVerification() {
    wx.showLoading({ title: '执行中...' });
    try {
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/admin/reset-all-verification",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": this.data.openId,
          "content-type": "application/json"
        },
        method: "POST"
      });
      wx.hideLoading();
      console.log('重置验证返回:', JSON.stringify(result.data));

      if (result.data && result.data.code === 200) {
        const count = result.data.data?.affected_count || 0;
        wx.showToast({
          title: `已重置${count}位用户`,
          icon: 'success',
          duration: 2000
        });
      } else {
        wx.showToast({
          title: result.data?.msg || '操作失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('全员重新验证失败:', error);
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  preventTouchMove() {
    return;
  },

  goToUserDetail() {
    wx.navigateTo({
      url: '/pages/user-detail/user-detail'
    });
  },

  // 跳转到“我发起的”活动列表
  goToCreatedActivities() {
    if (!this.data.userInfo.isLogin) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/my-created-activities/my-created-activities'
    });
  },

  // 跳转到“我报名的”活动列表
  goToJoinedActivities() {
    if (!this.data.userInfo.isLogin) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/my-joined-activities/my-joined-activities'
    });
  },

  wxPromise(method, options = {}) {
    return new Promise((resolve, reject) => {
      wx[method]({
        ...options,
        success: resolve,
        fail: reject
      });
    });
  }
});