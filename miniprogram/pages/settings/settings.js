Page({
  data: {
    canSave: false,
    userInfo: {
      avatar: '',
      nickName: '',
      phone: '',
      wechat: ''
    }
  },

  onLoad() {
    // 从缓存或全局获取用户信息
    this.loadUserInfo()
  },

  // 加载用户信息
  loadUserInfo() {
    // 这里可以从全局变量或缓存中获取用户信息
    // 示例：从缓存获取
    try {
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo) {
        this.setData({
          userInfo: {
            avatar: userInfo.avatar || '',
            nickName: userInfo.nickName || '',
            phone: userInfo.phone || '',
            wechat: userInfo.wechat || ''
          }
        })
      }
    } catch (e) {
      console.error('读取用户信息失败', e)
    }
    
    // 检查是否可以保存
    this.checkCanSave()
  },

  // 检查是否可以保存
  checkCanSave() {
    const { nickName, phone, wechat } = this.data.userInfo
    const phoneValid = /^1[3-9]\d{9}$/.test(phone)
    const wechatValid = wechat && wechat.length > 0
    const nickNameValid = nickName && nickName.length > 0
    
    this.setData({
      canSave: nickNameValid && phoneValid && wechatValid
    })
  },

  // 表单字段变化
  onFieldChange(e) {
    const { field } = e.currentTarget.dataset
    const { value } = e.detail
    
    this.setData({
      [`userInfo.${field}`]: value
    }, () => {
      this.checkCanSave()
    })
  },

  // 点击头像
  onAvatarClick() {
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.chooseImage('camera')
        } else {
          this.chooseImage('album')
        }
      }
    })
  },

  // 选择图片
  chooseImage(sourceType) {
    wx.chooseImage({
      count: 1,
      sourceType: [sourceType],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        
        // 显示上传中
        wx.showLoading({
          title: '上传中...',
        })
        
        // 这里应该调用上传接口
        // 模拟上传
        setTimeout(() => {
          wx.hideLoading()
          
          // 上传成功后更新头像
          this.setData({
            'userInfo.avatar': tempFilePath
          })
          
          wx.showToast({
            title: '头像上传成功',
            icon: 'success'
          })
        }, 1500)
      }
    })
  },

  // 保存
  onSave(e) {
    if (!this.data.canSave) {
      wx.showToast({
        title: '请填写完整信息',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '确认保存',
      content: '确认保存个人信息吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({
            title: '保存中...',
          })
          
          // 这里应该调用保存接口
          setTimeout(() => {
            // 保存到缓存
            try {
              wx.setStorageSync('userInfo', this.data.userInfo)
            } catch (e) {
              console.error('保存失败', e)
            }
            
            wx.hideLoading()
            wx.showToast({
              title: '保存成功',
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
  },

  // 返回上一页
  onBackClick() {
    wx.navigateBack({
      delta: 1
    })
  }
})