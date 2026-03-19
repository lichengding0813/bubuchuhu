Page({
  data: {
    agree: false,
    canSubmit: true,
    showBusQR: false,
    showNotice: false,
    showDatePicker: false,
    currentDatePickerField: '',
    currentDatePickerTitle: '',
    minDate: new Date().getTime(),
    maxDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).getTime(),
    currentDateTime: new Date().getTime(),

    // 出行方式选项
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

    // 难度选项
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

    // 表单数据 - 简单双向绑定
    name: '',
    description: '',
    activityTime: '',
    location: '',
    travel: [],
    route: '',
    distance: '',
    climb: '',
    difficulty: '',
    maxParticipants: 2,
    deadline: '',
    wechat: '',
    groupQR: '',
    busQR: '',
    cover: '',

    // 集合点
    meetingPoints: [{
      time: '',
      location: ''
    }]
  },

  onLoad() {
    // 初始化云环境
    wx.cloud.init({
      env: 'prod-3gktwx67d1dd1e76'
    })
  
    // 从 storage 获取用户信息
    const userInfo = wx.getStorageSync('userInfo')
    console.log('从storage获取的用户信息：', userInfo)
  
    if (userInfo && userInfo.openId) {
      this.setData({
        userInfo: {
          openId: userInfo.openId
        }
      })
      console.log('设置openId成功：', userInfo.openId)
      
      // 如果用户有微信号，自动填入
      if (userInfo.wechatId) {
        console.log('自动填入微信号：', userInfo.wechatId)
        this.setData({
          wechat: userInfo.wechatId
        })
      } else {
        console.warn('用户未设置微信号')
      }
    } else {
      console.warn('未获取到用户openId')
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
    }
  
    // 设置默认报名截止时间
    const now = new Date()
    const defaultDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    defaultDeadline.setHours(defaultDeadline.getHours() - 1)
    this.setData({
      deadline: this.formatTime(defaultDeadline)
    })
  },

  // 返回上一页
  onBackClick() {
    wx.navigateBack({
      delta: 1
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

  // 通用输入处理 - 双向绑定
  onInput(e) {
    const {
      field
    } = e.currentTarget.dataset
    // 从你的日志看，e.detail 直接就是输入的值
    const value = e.detail || ''
    // console.log(`输入 ${field}:`, value)

    // 更新数据
    this.setData({
      [field]: value
    })
  },

  // 集合点地点输入 - 专门处理 location 字段
  onMeetingLocationInput(e) {
    // console.log('集合点地点输入:', e)

    const {
      index
    } = e.currentTarget.dataset
    // 从事件中获取输入的值
    const value = e.detail.value || e.detail || ''

    // console.log(`集合点${index} location:`, value)

    // 获取当前的 meetingPoints 数组
    const {
      meetingPoints
    } = this.data

    // 更新对应索引的 location
    if (meetingPoints[index]) {
      meetingPoints[index].location = value

      // 更新数据
      this.setData({
        meetingPoints: [...meetingPoints]
      })
    }
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
      travel: selectedTravel,
      showBusQR: selectedTravel.includes('bus')
    }, () => {
      this.checkCanSubmit()
    })
  },

  // 难度选择变化
  onDifficultyChange(e) {
    this.setData({
      difficulty: e.detail
    }, () => {
      this.checkCanSubmit()
    })
  },

  // 人数限制变化
  onStepperChange(e) {
    this.setData({
      maxParticipants: e.detail
    }, () => {
      this.checkCanSubmit()
    })
  },

  // 添加集合点
  onAddMeetingPoint() {
    const {
      meetingPoints
    } = this.data
    meetingPoints.push({
      time: '',
      location: ''
    })
    this.setData({
      meetingPoints: [...meetingPoints]
    })
  },

  // 删除集合点
  onRemoveMeetingPoint(e) {
    const {
      index
    } = e.currentTarget.dataset
    const {
      meetingPoints
    } = this.data
    meetingPoints.splice(index, 1)
    this.setData({
      meetingPoints: [...meetingPoints]
    }, () => {
      this.checkCanSubmit()
    })
  },

  // 集合点输入
  onMeetingInput(e) {
    const {
      index,
      field
    } = e.currentTarget.dataset
    const value = e.detail.value === undefined ? '' : e.detail.value
    const {
      meetingPoints
    } = this.data

    meetingPoints[index][field] = value
    this.setData({
      meetingPoints: [...meetingPoints]
    }, () => {
      this.checkCanSubmit()
    })
  },

  // 集合点时间选择
  onMeetingTimePickerClick(e) {
    const {
      index
    } = e.currentTarget.dataset
    const meetingPoint = this.data.meetingPoints[index]
    let defaultTime = new Date()

    if (meetingPoint.time) {
      defaultTime = new Date(meetingPoint.time.replace(/-/g, '/'))
    } else {
      defaultTime.setHours(10, 0, 0, 0)
    }

    this.setData({
      showDatePicker: true,
      currentDatePickerField: `meetingPoints[${index}].time`,
      currentDatePickerTitle: `选择集合点${index + 1}时间`,
      currentDateTime: defaultTime.getTime()
    })
  },

  // 活动时间选择
  onTimePickerClick(e) {
    const {
      field
    } = e.currentTarget.dataset
    let defaultTime = new Date()

    if (this.data[field]) {
      defaultTime = new Date(this.data[field].replace(/-/g, '/'))
    } else {
      defaultTime.setHours(10, 0, 0, 0)
    }

    this.setData({
      showDatePicker: true,
      currentDatePickerField: field,
      currentDatePickerTitle: field === 'activityTime' ? '选择活动时间' : '选择报名截止时间',
      currentDateTime: defaultTime.getTime()
    })
  },

  // 日期时间选择确认
  onDateTimeConfirm(e) {
    const dateTime = new Date(e.detail)
    const dateTimeStr = this.formatTime(dateTime)

    if (this.data.currentDatePickerField.includes('meetingPoints')) {
      const matches = this.data.currentDatePickerField.match(/meetingPoints\[(\d+)\]\.time/)
      if (matches) {
        const index = parseInt(matches[1])
        const {
          meetingPoints
        } = this.data
        meetingPoints[index].time = dateTimeStr
        this.setData({
          meetingPoints: [...meetingPoints]
        }, () => {
          this.checkCanSubmit()
        })
      }
    } else {
      this.setData({
        [this.data.currentDatePickerField]: dateTimeStr
      }, () => {
        this.checkCanSubmit()
      })
    }

    this.setData({
      showDatePicker: false
    })
  },

  // 日期时间选择取消
  onDateTimeCancel() {
    this.setData({
      showDatePicker: false
    })
  },

  // 上传二维码到云存储
  async onUploadQR(e) {
    const {
      type
    } = e.currentTarget.dataset

    // 检查用户信息（根据你的实际数据结构调整）
    const {
      openId
    } = this.data.userInfo || {}
    if (!openId) {
      wx.showToast({
        title: '用户信息异常',
        icon: 'error'
      })
      return
    }

    wx.chooseImage({
      count: 1,
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0]

        this.setData({
          isUploading: true
        })
        wx.showLoading({
          title: '上传中...',
          mask: true
        })

        try {
          const timestamp = Date.now()
          const fileExtension = tempFilePath.split('.').pop() || 'png'

          // 根据类型设置不同的存储路径
          let cloudPath = ''
          if (type === 'bus') {
            cloudPath = `activities/bus_qr/${openId}_${timestamp}.${fileExtension}`
          } else {
            cloudPath = `activities/group_qr/${openId}_${timestamp}.${fileExtension}`
          }

          const uploadResult = await wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: tempFilePath,
            config: {
              env: 'prod-3gktwx67d1dd1e76'
            }
          })

          const fileID = uploadResult.fileID

          // 根据类型更新对应的字段
          const dataField = type === 'bus' ? 'busQR' : 'groupQR'
          this.setData({
            [dataField]: fileID,
            isUploading: false
          }, () => {
            this.checkCanSubmit()
          })

          wx.hideLoading()
          wx.showToast({
            title: '上传成功',
            icon: 'success'
          })

        } catch (error) {
          console.error('上传失败', error)
          wx.hideLoading()
          wx.showToast({
            title: '上传失败',
            icon: 'error'
          })
          this.setData({
            isUploading: false
          })
        }
      }
    })
  },

  // 上传封面图到云存储
  async onUploadCover() {
    const {
      openId
    } = this.data.userInfo || {}
    if (!openId) {
      wx.showToast({
        title: '用户信息异常',
        icon: 'error'
      })
      return
    }

    wx.chooseImage({
      count: 1,
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0]

        this.setData({
          isUploading: true
        })
        wx.showLoading({
          title: '上传中...',
          mask: true
        })

        try {
          const timestamp = Date.now()
          const fileExtension = tempFilePath.split('.').pop() || 'png'
          const cloudPath = `activities/covers/${openId}_${timestamp}.${fileExtension}`

          const uploadResult = await wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: tempFilePath,
            config: {
              env: 'prod-3gktwx67d1dd1e76'
            }
          })

          const fileID = uploadResult.fileID

          this.setData({
            cover: fileID,
            isUploading: false
          })

          wx.hideLoading()
          wx.showToast({
            title: '上传成功',
            icon: 'success'
          })

        } catch (error) {
          console.error('上传失败', error)
          wx.hideLoading()
          wx.showToast({
            title: '上传失败',
            icon: 'error'
          })
          this.setData({
            isUploading: false
          })
        }
      }
    })
  },

  // 同意条款
  onAgreeChange(e) {
    this.setData({
      agree: e.detail
    }, () => {
      this.checkCanSubmit()
    })
  },

  // 检查是否可以提交
  checkCanSubmit() {
    const {
      agree,
      name,
      description,
      activityTime,
      location,
      travel,
      meetingPoints,
      route,
      difficulty,
      maxParticipants,
      wechat,
      groupQR,
      busQR
    } = this.data

    // 检查必填项
    const requiredFields = [
      name,
      description,
      activityTime,
      location,
      travel.length > 0,
      route,
      difficulty,
      maxParticipants >= 2,
      wechat,
      groupQR
    ]

    // 检查集合点
    const meetingPointsValid = meetingPoints.every(p => p.time && p.location)

    // 如果选择了大巴，需要检查大巴群二维码
    const busRequired = !travel.includes('bus') || busQR

    const allRequiredValid = [...requiredFields, meetingPointsValid].every(Boolean)

    this.setData({
      canSubmit: agree && allRequiredValid && busRequired
    })
  },

  // 表单提交
  onSubmit() {
    wx.showModal({
      title: '确认发起活动',
      content: '请确认所有信息填写正确',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({
            title: '提交中...',
          })

          // 难度等级映射
          const difficultyMap = {
            'easy': 1, // 简单
            'medium': 2, // 中等
            'hard': 3, // 困难
            'expert': 4 // 挑战（如果需要）
          }

          // 出行方式映射
        const travelTypeMap = {
          'bus': 1,     // 大巴
          'train': 2,   // 高铁
          'self': 3,    // 自驾
        }

        // 转换出行方式数组
        const travelOptionsNumbers = (this.data.travel || [])
          .map(item => travelTypeMap[item])
          .filter(value => value !== undefined)  // 过滤掉无效值

          // 收集所有表单数据 - 与后端字段对应
          const formData = {
            name: this.data.name || '',
            description: this.data.description || '',
            activityTime: this.data.activityTime || '',
            location: this.data.location || '',
            route: this.data.route || '', // 前端route → 后端routes
            distance: parseInt(this.data.distance) || 0,
            climb: parseInt(this.data.climb) || 0,
            difficulty: difficultyMap[this.data.difficulty] || 1, 
            maxParticipants: this.data.maxParticipants || 2,
            deadline: this.data.deadline || '',
            cover: this.data.cover || '',
            groupQR: this.data.groupQR || '',
            wechat: this.data.wechat || '',
            travelOptions: travelOptionsNumbers, 
            busQR: this.data.busQR || '',
            meetingPoints: this.data.meetingPoints || []
          }

          console.log('提交的表单数据：', formData)

          // 使用云调用发起请求
          wx.cloud.callContainer({
            config: {
              env: 'prod-3gktwx67d1dd1e76' // 你的云环境ID
            },
            path: '/api/activity/create', // 接口路径
            method: 'POST',
            header: {
              'X-WX-SERVICE': 'flask-mysql-login',
              'X-Wx-OpenId': this.data.userInfo?.openId || wx.getStorageSync('userInfo')?.openId,
              'Content-Type': 'application/json'
            },
            data: formData,
            success: (res) => {
              wx.hideLoading()
              console.log('提交成功:', res)

              if (res.data.code === 200) {
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
              } else {
                wx.showToast({
                  title: res.data.msg || '提交失败',
                  icon: 'none'
                })
              }
            },
            fail: (err) => {
              wx.hideLoading()
              console.error('提交失败:', err)
              wx.showToast({
                title: err.errMsg || '网络错误',
                icon: 'error'
              })
            }
          })
        }
      }
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
  }
})