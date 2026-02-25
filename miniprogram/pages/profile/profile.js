Page({
  data: {
    userInfo: {
      nickName: '魔魔胡胡胡蘿蔔',
      avatar: 'cloud://prod-3gktwx67d1dd1e76.7072-prod-3gktwx67d1dd1e76-1392222183/魔魔胡胡胡蘿蔔.png',
      isLogin: false
    },
    showVerifyDialog: false,
    verifyAnswer: '',
    verifyError: '',
    remainingAttempts: 2,
    openId: '',
    isLoading: false,
    menuList: [{
        icon: 'setting',
        text: '信息设置',
        url: ''
      },
      {
        icon: 'records',
        text: '待审核',
        url: ''
      },
      {
        icon: 'info',
        text: '关于我们',
        url: ''
      },
    ]
  },

  onMenuClick(e) {
    const { index } = e.currentTarget.dataset
    const menu = this.data.menuList[index]
    
    // 根据不同的菜单项执行不同的操作
    switch(menu.text) {
      case '关于我们':
        wx.navigateTo({
          url: '/pages/about/about'
        })
        break
      case '信息设置':
        wx.navigateTo({
          url: '/pages/settings/settings'
        })
        break
      default:
        wx.showToast({
          title: `点击${menu.text}`,
          icon: 'none'
        })
    }
  }
})