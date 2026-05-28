// pages/activity_add/activity_add.js
Page({
  data: {
    agree: false,
    canSubmit: false,
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
    forceInsurance: 0,   // 0-不强制，1-强制
    // 集合点
    meetingPoints: [{
      time: '',
      location: ''
    }],

    // 自定义时间选择器数据
    pickerValue: [0, 0, 0, 0, 0], // 当前选中的索引 [年,月,日,时,分]
    years: [],
    months: [],
    days: [],
    hours: [],
    minutes: ['00', '30'], // 固定分钟选项
    tempSelectedDateTime: null, // 临时存储用户选择的时间
  },

  // 初始化时间选择器数据
  initPickerData() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const years = [];
    for (let i = currentYear; i <= currentYear + 1; i++) {
      years.push(i);
    }
    const months = Array.from({
      length: 12
    }, (_, i) => i + 1);
    const hours = Array.from({
      length: 24
    }, (_, i) => i.toString().padStart(2, '0'));

    this.setData({
      years,
      months,
      hours,
    });
    // 初始化 days（根据当前年月）
    this.updateDays(currentYear, now.getMonth() + 1);

    // 默认选中当前时间（对齐到最近半小时）
    let defaultDate = new Date();
    let minutes = defaultDate.getMinutes();
    let minuteIndex = minutes < 15 ? 0 : (minutes < 45 ? 1 : 0); // 向下取整到最近的00或30
    if (minutes >= 45) {
      defaultDate.setHours(defaultDate.getHours() + 1);
      minuteIndex = 0;
    }
    defaultDate.setMinutes(minuteIndex === 0 ? 0 : 30, 0, 0);

    const yearIndex = years.indexOf(defaultDate.getFullYear());
    const monthIndex = defaultDate.getMonth();
    const dayIndex = defaultDate.getDate() - 1;
    const hourIndex = defaultDate.getHours();

    this.setData({
      pickerValue: [yearIndex, monthIndex, dayIndex, hourIndex, minuteIndex],
      tempSelectedDateTime: defaultDate
    });
  },

  // 根据年月更新天数
  updateDays(year, month) {
    const daysCount = new Date(year, month, 0).getDate();
    const days = Array.from({
      length: daysCount
    }, (_, i) => i + 1);
    this.setData({
      days
    });
  },

  // 单选框变更
  onForceInsuranceChange(e) {
    this.setData({
      forceInsurance: e.detail
    });
  },


  // 时间选择器滚动事件
  onPickerChange(e) {
    const val = e.detail.value;
    const [yearIdx, monthIdx, dayIdx, hourIdx, minuteIdx] = val;

    const year = this.data.years[yearIdx];
    const month = this.data.months[monthIdx];

    // 动态更新天数（防止2月30日等）
    const oldDaysCount = this.data.days.length;
    const newDaysCount = new Date(year, month, 0).getDate();
    if (oldDaysCount !== newDaysCount) {
      this.updateDays(year, month);
      // 修正日索引超出范围
      let newDayIdx = dayIdx;
      if (dayIdx >= newDaysCount) newDayIdx = newDaysCount - 1;
      val[2] = newDayIdx;
      this.setData({
        pickerValue: val
      });
    } else {
      this.setData({
        pickerValue: val
      });
    }

    // 构建临时日期对象
    const day = this.data.days[val[2]];
    const hour = parseInt(this.data.hours[hourIdx]);
    const minute = parseInt(this.data.minutes[minuteIdx]);
    const selectedDate = new Date(year, month - 1, day, hour, minute);
    this.data.tempSelectedDateTime = selectedDate;
  },

  // 确认自定义时间
  onCustomDateTimeConfirm() {
    const selectedDate = this.data.tempSelectedDateTime;
    if (!selectedDate) return;

    const dateTimeStr = this.formatTime(selectedDate);

    if (this.data.currentDatePickerField.includes('meetingPoints')) {
      const matches = this.data.currentDatePickerField.match(/meetingPoints\[(\d+)\]\.time/);
      if (matches) {
        const index = parseInt(matches[1]);
        const {
          meetingPoints
        } = this.data;
        meetingPoints[index].time = dateTimeStr;
        this.setData({
          meetingPoints: [...meetingPoints]
        }, () => {
          this.checkCanSubmit();
        });
      }
    } else {
      this.setData({
        [this.data.currentDatePickerField]: dateTimeStr
      }, () => {
        this.checkCanSubmit();
      });
    }

    this.setData({
      showDatePicker: false
    });
  },

  // 修改原来的 onMeetingTimePickerClick / onTimePickerClick 中设置 pickerValue 的逻辑
  onTimePickerClick(e) {
    const {
      field
    } = e.currentTarget.dataset;
    let defaultDate = this.data[field] ? new Date(this.data[field].replace(/-/g, '/')) : new Date();
    defaultDate = this.roundToHalfHour(defaultDate.getTime());
    defaultDate = new Date(defaultDate);

    // 设置 pickerValue
    const year = defaultDate.getFullYear();
    const month = defaultDate.getMonth() + 1;
    const day = defaultDate.getDate();
    const hour = defaultDate.getHours();
    const minute = defaultDate.getMinutes();
    const minuteIndex = minute === 0 ? 0 : 1;

    const yearIdx = this.data.years.indexOf(year);
    const monthIdx = month - 1;
    const dayIdx = day - 1;
    const hourIdx = hour;

    this.setData({
      showDatePicker: true,
      currentDatePickerField: field,
      currentDatePickerTitle: field === 'activityTime' ? '选择活动时间' : '选择报名截止时间',
      pickerValue: [yearIdx, monthIdx, dayIdx, hourIdx, minuteIndex],
      tempSelectedDateTime: defaultDate
    });
  },

  onLoad() {
    this.initPickerData();
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
        }, () => {
          this.checkCanSubmit()
        })
      } else {
        // 即使没有微信号，也要重新校验一次（确保按钮状态正确）
        this.checkCanSubmit()
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
    }, () => {
      this.checkCanSubmit()
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

  // 对齐到最近半小时（向下取整，例如 10:22 → 10:00，10:38 → 10:30）
  roundToHalfHour(timestamp) {
    const date = new Date(timestamp);
    const minutes = date.getMinutes();
    const remainder = minutes % 30;
    if (remainder !== 0) {
      date.setMinutes(minutes - remainder, 0, 0);
    }
    return date.getTime();
  },

  // 通用输入处理 - 双向绑定（修复：每次输入后触发校验）
  onInput(e) {
    const {
      field
    } = e.currentTarget.dataset
    const value = e.detail || ''
    this.setData({
      [field]: value
    }, () => {
      this.checkCanSubmit()
    })
  },

  // 集合点地点输入 - 专门处理 location 字段
  onMeetingLocationInput(e) {
    const {
      index
    } = e.currentTarget.dataset
    const value = e.detail.value || e.detail || ''
    const {
      meetingPoints
    } = this.data
    if (meetingPoints[index]) {
      meetingPoints[index].location = value
      this.setData({
        meetingPoints: [...meetingPoints]
      }, () => {
        this.checkCanSubmit()
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
    }, () => {
      this.checkCanSubmit()
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

  // 集合点时间选择（已修改：对齐到半小时）
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

    // 对齐到半小时
    const roundedTime = this.roundToHalfHour(defaultTime.getTime())

    this.setData({
      showDatePicker: true,
      currentDatePickerField: `meetingPoints[${index}].time`,
      currentDatePickerTitle: `选择集合点${index + 1}时间`,
      currentDateTime: roundedTime
    })
  },

  // 活动时间/截止时间选择（已修改：对齐到半小时）
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

    // 对齐到半小时
    const roundedTime = this.roundToHalfHour(defaultTime.getTime())

    this.setData({
      showDatePicker: true,
      currentDatePickerField: field,
      currentDatePickerTitle: field === 'activityTime' ? '选择活动时间' : '选择报名截止时间',
      currentDateTime: roundedTime
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

  // 时间选择器过滤器：分钟仅保留 0 和 30
  filterTime(type, options) {
    if (type === 'minute') {
      return options.filter(option => option % 30 === 0);
    }
    return options;
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

  // 检查是否可以提交（修复：微信号必须非空）
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

    // 微信号必须存在且不为空字符串
    const isWechatValid = wechat && wechat.trim().length > 0

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
      isWechatValid,   // 使用严格校验
      groupQR
    ]

    // 检查集合点
    const meetingPointsValid = meetingPoints.every(p => p.time && p.location)

    // 如果选择了大巴，需要检查大巴群二维码
    const busRequired = !travel.includes('bus') || busQR

    const allRequiredValid = [...requiredFields, meetingPointsValid].every(Boolean)

    const canSubmit = agree && allRequiredValid && busRequired
    this.setData({
      canSubmit
    })
  },

  // 表单提交（增加最终校验）
  onSubmit() {
    // 最终校验：微信号必填
    if (!this.data.wechat || this.data.wechat.trim() === '') {
      wx.showToast({
        title: '请填写发起人微信号',
        icon: 'none'
      })
      return
    }

    // 最终校验：同意条款
    if (!this.data.agree) {
      wx.showToast({
        title: '请阅读并同意发起者须知',
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

          // 难度等级映射
          const difficultyMap = {
            'easy': 1, // 简单
            'medium': 2, // 中等
            'hard': 3, // 困难
            'expert': 4 // 挑战（如果需要）
          }

          // 出行方式映射
          const travelTypeMap = {
            'bus': 1, // 大巴
            'train': 2, // 高铁
            'self': 3, // 自驾
          }

          // 转换出行方式数组
          const travelOptionsNumbers = (this.data.travel || [])
            .map(item => travelTypeMap[item])
            .filter(value => value !== undefined) // 过滤掉无效值

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
            meetingPoints: this.data.meetingPoints || [],
            mandatoryInsurance: this.data.forceInsurance,
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