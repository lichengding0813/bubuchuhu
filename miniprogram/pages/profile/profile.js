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
      isAdmin: 0,  // 添加 isAdmin 字段
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
    remainingAttempts: 2,
    openId: '',
    isLoading: false,
    menuList: [{
        icon: 'setting',
        text: '个人信息设置',
        url: '/pages/settings/settings'
      },
      // 待审核菜单项会动态添加，不在这里写死
      {
        icon: 'info',
        text: '关于我们',
        url: '/pages/about/about'
      },
    ]
  },

  onLoad() {
    this.initUserData();
    this.loadUserStats();
  },

  onShow() {
    // 每次显示页面时重新从storage获取数据
    this.initUserData();
  },

  // 从storage初始化用户数据
  initUserData() {
    try {
      // 从storage获取userInfo
      const storageUserInfo = wx.getStorageSync('userInfo');
      console.log('storageUserInfo:', storageUserInfo);
      
      if (storageUserInfo) {
        // 更新userInfo，标记为已登录
        this.setData({
          userInfo: {
            ...storageUserInfo,
            isLogin: true
          },
          openId: storageUserInfo.openId || ''
        });
        
        // 根据needVerify更新待审核红点
        this.updatePendingRedDot(storageUserInfo.needVerify);
        
        // 动态构建菜单（根据是否为管理员）
        this.buildMenuList();
      } else {
        // 未登录状态
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
          }
        });
        // 未登录时只显示基本菜单
        this.setData({
          menuList: [{
            icon: 'info',
            text: '关于我们',
            url: '/pages/about/about'
          }]
        });
      }
    } catch (error) {
      console.error('获取storage用户信息失败', error);
    }
  },

  // 动态构建菜单列表
  buildMenuList() {
    const { isAdmin, needVerify } = this.data.userInfo;
    const menuList = [];
    
    // 个人信息设置（总是显示）
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
        showRedDot: needVerify === 1  // 根据验证状态显示红点
      });
    }
    
    // 关于我们
    menuList.push({
      icon: 'info',
      text: '关于我们',
      url: '/pages/about/about'
    });
    
    console.log('构建的菜单列表:', menuList);
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

  // 加载用户统计数据
  loadUserStats() {
    // 这里可以调用云函数获取用户发起的和报名的活动数量
    // 示例数据
    this.setData({
      stats: {
        created: 3,  // 实际应从后端获取
        joined: 5     // 实际应从后端获取
      }
    });
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
    
    if (!this.data.userInfo.isLogin && menu.text !== '关于我们') {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }
    
    // 根据不同的菜单项执行不同的操作
    switch(menu.text) {
      case '关于我们':
        wx.navigateTo({
          url: menu.url
        });
        break;
      case '个人信息设置':
        wx.navigateTo({
          url: menu.url
        });
        break;
      case '待审核':
        // 检查是否需要验证
        if (this.data.userInfo.needVerify) {
          this.setData({ showVerifyDialog: true });
        } else {
          wx.navigateTo({
            url: menu.url
          });
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
        console.log('登录成功，用户信息:', userData);
        
        // 保存到storage和globalData
        getApp().globalData.userInfo = userData;
        wx.setStorageSync('userInfo', userData);
        
        // 更新页面数据
        this.setData({
          userInfo: {
            ...userData,
            isLogin: true
          },
          isLoading: false
        });
        
        // 重新构建菜单
        this.buildMenuList();
        
        // 检查是否需要验证
        if (userData.needVerify === 1 && userData.isBlacklist === 0) {
          this.setData({ showVerifyDialog: true });
        } else {
          wx.showToast({ title: '登录成功', icon: 'success' });
          this.loadUserStats();
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
          "content-type": "application/json"
        },
        method: "POST",
        data: { answer }
      });

      wx.hideLoading();

      if (result.data && result.data.code === 200) {
        const userData = result.data.data;
        this.setData({ userInfo: { ...userData, isLogin: true } });
        getApp().globalData.userInfo = userData;
        wx.setStorageSync('userInfo', userData);
        
        // 重新构建菜单
        this.buildMenuList();

        if (userData.isBlacklist === 1) {
          this.setData({
            showVerifyDialog: false,
            showLockedDialog: true
          });
        } else if (userData.needVerify === 0) {
          this.setData({ showVerifyDialog: false });
          wx.showToast({ title: '验证通过', icon: 'success' });
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

  goToUserDetail() {
    wx.navigateTo({
      url: '/pages/user-detail/user-detail'
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