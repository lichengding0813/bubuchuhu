Page({
  data: {
    agreeNotice: false,
    agreeBus: false,
    canSignUp: false,
    showNotice: false,
    noticeTitle: '',
    noticeType: '',
    
    // 活动详情数据
    activityDetail: {
      id: 1,
      name: '周末城市徒步',
      cover: '',
      time: '2024-05-20 15:00',
      location: '市中心公园',
      remainCount: 8,
      totalCount: 20,
      difficulty: '⭐ 简单',
      distance: 10,
      climb: 200,
      status: '报名中',
      organizer: '徒步爱好者',
      wechat: 'hiker123',
      groupQR: '',
      busQR: '',
      description: '周末一起徒步城市公园，感受自然风光，结识新朋友。路线平缓，适合新手。',
      route: '起点：公园南门 → 途径：湖畔栈道 → 终点：山顶观景台',
      meetingPoints: [
        { time: '14:50', location: '公园南门' },
        { time: '15:10', location: '地铁站A口' }
      ],
      deadline: '2024-05-19 14:00',
      travel: ['bus', 'self'] // 出行方式
    }
  },

  onLoad(options) {
    const { id } = options
    console.log('活动详情页加载，活动ID:', id)
    // 这里可以根据id从服务器获取活动详情
    this.checkCanSignUp()
  },

  // 检查是否可以报名
  checkCanSignUp() {
    const { agreeNotice, agreeBus, activityDetail } = this.data
    let canSignUp = agreeNotice
    
    // 如果包含大巴出行，需要同意大巴免责声明
    if (activityDetail.travel.includes('bus')) {
      canSignUp = canSignUp && agreeBus
    }
    
    // 还有名额才能报名
    if (activityDetail.remainCount <= 0) {
      canSignUp = false
    }
    
    this.setData({ canSignUp })
  },

  // 同意报名须知
  onAgreeNoticeChange(e) {
    this.setData({
      agreeNotice: e.detail
    }, () => {
      this.checkCanSignUp()
    })
  },

  // 同意大巴免责声明
  onAgreeBusChange(e) {
    this.setData({
      agreeBus: e.detail
    }, () => {
      this.checkCanSignUp()
    })
  },

  // 点击查看须知
  onNoticeClick(e) {
    const { type } = e.currentTarget.dataset
    let title = ''
    if (type === 'participant') {
      title = '报名参与者须知'
    } else if (type === 'bus') {
      title = '大巴行程免责声明'
    } else if (type === 'self') {
      title = '自驾/高铁行程免责声明'
    }
    
    this.setData({
      showNotice: true,
      noticeTitle: title,
      noticeType: type
    })
  },

  // 关闭弹窗
  onNoticeClose() {
    this.setData({
      showNotice: false
    })
  },

  // 点击报名
  onSignUpClick() {
    if (!this.data.canSignUp) {
      wx.showToast({
        title: '请先阅读并同意相关条款',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '确认报名',
      content: '请确认报名信息无误',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({
            title: '报名中...',
          })
          
          // 模拟报名接口
          setTimeout(() => {
            wx.hideLoading()
            wx.showToast({
              title: '报名成功',
              icon: 'success',
              duration: 2000,
              success: () => {
                // 更新剩余名额
                const newRemain = this.data.activityDetail.remainCount - 1
                this.setData({
                  'activityDetail.remainCount': newRemain
                })
              }
            })
          }, 1500)
        }
      }
    })
  },

  // 返回上一页
  onBackClick() {
    wx.navigateBack({
      delta: 1
    })
  }
})