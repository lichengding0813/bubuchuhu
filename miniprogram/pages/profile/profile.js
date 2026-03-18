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
      {
        icon: 'records',
        text: '待审核',
        url: '/pages/pending/pending',
        showRedDot: false
      },
      {
        icon: 'info',
        text: '关于我们',
        url: '/pages/about/about'
      },
      {
        icon: 'clock',
        text: '登录历史',
        url: '/pages/login-history/login-history'
      }
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
      // console.log(storageUserInfo)
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
            createTime: '',
            lastLoginTime: '',
            loginCount: 0
          }
        });
      }
    } catch (error) {
      console.error('获取storage用户信息失败', error);
    }
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
      case '登录历史':
        wx.navigateTo({
          url: menu.url
        });
        break;
      default:
        wx.showToast({
          title: `点击${menu.text}`,
          icon: 'none'
        });
    }
  },


});