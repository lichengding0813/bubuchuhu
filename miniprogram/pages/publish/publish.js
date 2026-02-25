Page({
  data: {
    agree: false,
    canSubmit: false,
    showBusQR: false,

    travelOptions: [{
        label: '大巴',
        value: 'bus',
        checked: false
      },
      {
        label: '高铁',
        value: 'train',
        checked: false
      },
      {
        label: '自驾',
        value: 'self',
        checked: false
      }
    ],

    difficultyOptions: [{
        text: '初级',
        value: 'easy'
      },
      {
        text: '中级',
        value: 'medium'
      },
      {
        text: '高级',
        value: 'hard'
      }
    ],

    formData: {
      name: '',
      description: '',
      activityTime: '',
      location: '',
      travel: [],
      meetingPoints: [{
        time: '',
        location: ''
      }],
      route: '',
      distance: '',
      climb: '',
      difficulty: '',
      maxParticipants: 2,
      deadline: '',
      wechat: '',
      groupQR: '',
      busQR: '',
      cover: ''
    }
  },

  // 返回上一页
  onBackClick() {
    wx.navigateBack({
      delta: 1
    })
  },


  onLoad() {
    // 设置默认报名截止时间（活动开始前1小时）
    const now = new Date()
    const defaultDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 默认一周后
    defaultDeadline.setHours(defaultDeadline.getHours() - 1)
    this.setData({
      'formData.deadline': this.formatTime(defaultDeadline)
    })
  },

  // 点击查看发起者须知
  onNoticeClick() {
    this.setData({
      showNotice: true
    })
  },

  // 关闭弹窗
  onNoticeClose() {
    this.setData({
      showNotice: false
    })
  },

  // 格式化时间
  formatTime(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
  },

  // 同意条款变化
  onAgreeChange(e) {
    const agree = e.detail
    this.setData({
      agree
    })
    this.checkCanSubmit()
  },

  // 检查是否可以提交
  checkCanSubmit() {
    const {
      agree,
      formData
    } = this.data
    const required = [
      formData.name,
      formData.description,
      formData.activityTime,
      formData.location,
      formData.travel.length > 0,
      formData.meetingPoints.every(p => p.time && p.location),
      formData.route,
      formData.distance,
      formData.climb,
      formData.difficulty,
      formData.maxParticipants >= 2,
      formData.wechat,
      formData.groupQR
    ].every(Boolean)

    // 如果选择了大巴，需要检查大巴群二维码
    const busRequired = !formData.travel.includes('bus') || formData.busQR

    this.setData({
      canSubmit: agree && required && busRequired
    })
  },

  // 表单字段变化
  onFieldChange(e) {
    const {
      field
    } = e.currentTarget.dataset
    const {
      value
    } = e.detail
    this.setData({
      [`formData.${field}`]: value
    }, () => {
      this.checkCanSubmit()
    })
  },

  // 出行方式变化
  onTravelChange(e) {
    const {
      value
    } = e.currentTarget.dataset
    const {
      travelOptions
    } = this.data
    const newOptions = travelOptions.map(opt => {
      if (opt.value === value) {
        opt.checked = !opt.checked
      }
      return opt
    })

    const selectedTravel = newOptions.filter(opt => opt.checked).map(opt => opt.value)

    this.setData({
      travelOptions: newOptions,
      'formData.travel': selectedTravel,
      showBusQR: selectedTravel.includes('bus')
    }, () => {
      this.checkCanSubmit()
    })
  },

  // 难度选择变化
  onDifficultyChange(e) {
    this.setData({
      'formData.difficulty': e.detail
    }, () => {
      this.checkCanSubmit()
    })
  },

  // 数字步进器变化
  onStepperChange(e) {
    const {
      field
    } = e.currentTarget.dataset
    this.setData({
      [`formData.${field}`]: e.detail
    }, () => {
      this.checkCanSubmit()
    })
  },

  // 添加集合点
  onAddMeetingPoint() {
    const {
      meetingPoints
    } = this.data.formData
    meetingPoints.push({
      time: '',
      location: ''
    })
    this.setData({
      'formData.meetingPoints': meetingPoints
    })
  },

  // 删除集合点
  onRemoveMeetingPoint(e) {
    const {
      index
    } = e.currentTarget.dataset
    const {
      meetingPoints
    } = this.data.formData
    meetingPoints.splice(index, 1)
    this.setData({
      'formData.meetingPoints': meetingPoints
    }, () => {
      this.checkCanSubmit()
    })
  },

  // 集合点字段变化
  onMeetingFieldChange(e) {
    const {
      index,
      field
    } = e.currentTarget.dataset
    const {
      value
    } = e.detail
    const {
      meetingPoints
    } = this.data.formData
    meetingPoints[index][field] = value
    this.setData({
      'formData.meetingPoints': meetingPoints
    }, () => {
      this.checkCanSubmit()
    })
  },

  // 活动时间选择
  onTimePickerClick() {
    wx.showModal({
      title: '提示',
      content: '这里应该弹出日期时间选择器',
      showCancel: false
    })
    // 实际开发中可以使用微信小程序自带的日期时间选择器
    // wx.datePicker 或使用第三方组件
  },

  // 截止时间选择
  onDeadlinePickerClick() {
    wx.showModal({
      title: '提示',
      content: '这里应该弹出日期时间选择器',
      showCancel: false
    })
  },

  // 上传二维码
  onUploadQR(e) {
    const {
      type
    } = e.currentTarget.dataset
    wx.chooseImage({
      count: 1,
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        // 这里应该调用上传接口
        // wx.uploadFile ...

        // 模拟上传成功
        wx.showToast({
          title: '上传成功',
          icon: 'success'
        })

        this.setData({
          [`formData.${type}QR`]: tempFilePath
        }, () => {
          this.checkCanSubmit()
        })
      }
    })
  },

  // 上传封面图
  onUploadCover() {
    wx.chooseImage({
      count: 1,
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        this.setData({
          'formData.cover': tempFilePath
        })
      }
    })
  },

  // 表单提交
  onSubmit(e) {
    if (!this.data.canSubmit) {
      wx.showToast({
        title: '请完善必填信息',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '确认发起活动',
      content: '请确认所有信息填写正确',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({
            title: '提交中...',
          })

          // 这里应该调用提交接口
          setTimeout(() => {
            wx.hideLoading()
            wx.showToast({
              title: '发起成功',
              icon: 'success',
              duration: 2000,
              success: () => {
                setTimeout(() => {
                  wx.navigateBack()
                }, 2000)
              }
            })
          }, 1500)
        }
      }
    })
  }
})