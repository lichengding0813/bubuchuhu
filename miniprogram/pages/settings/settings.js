// pages/settings/settings.js
Page({
  data: {
    userInfo: {
      nickName: '',
      avatarUrl: '',
      phoneNumber: '',
      wechatId: '',
      verified: 0,
      openId: ''
    },
    originalUserInfo: {},
    canSave: false,
    isUploading: false
  },

  onLoad() {
    this.loadUserData();
  },

  onShow() {
    this.loadUserData();
  },

  // 加载用户数据
  loadUserData() {
    try {
      const storageUserInfo = wx.getStorageSync('userInfo');
      if (storageUserInfo) {
        const userInfo = {
          nickName: storageUserInfo.nickName || '',
          avatarUrl: storageUserInfo.avatarUrl || '',
          phoneNumber: storageUserInfo.phoneNumber || '',
          wechatId: storageUserInfo.wechatId || '',
          verified: storageUserInfo.verified || 0,
          openId: storageUserInfo.openId || ''
        };

        this.setData({
          userInfo: userInfo,
          originalUserInfo: JSON.parse(JSON.stringify(userInfo)),
          canSave: false
        });
      }
    } catch (error) {
      console.error('获取用户信息失败', error);
    }
  },

  // 表单字段变更
  onFieldChange(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail;

    this.setData({
      [`userInfo.${field}`]: value
    }, () => {
      // 直接检查是否有修改
      this.checkIfModified();
    });
  },

  // 检查是否有修改
  checkIfModified() {
    const { userInfo, originalUserInfo } = this.data;
    
    // 检查是否有字段发生变化
    const hasChanges = 
      userInfo.nickName !== originalUserInfo.nickName ||
      userInfo.phoneNumber !== originalUserInfo.phoneNumber ||
      userInfo.wechatId !== originalUserInfo.wechatId ||
      userInfo.avatarUrl !== originalUserInfo.avatarUrl;
    
    this.setData({ canSave: hasChanges });
  },

  // 验证手机号（用于保存时的验证）
  isValidPhone(phone) {
    return /^1[3-9]\d{9}$/.test(phone);
  },

  // 点击头像
  onAvatarClick() {
    if (this.data.isUploading) {
      wx.showToast({ title: '上传中，请稍后', icon: 'none' });
      return;
    }

    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        this.setData({ 'userInfo.avatarUrl': tempFilePath }, () => {
          this.checkIfModified();
        });
        this.uploadAvatar(tempFilePath);
      }
    });
  },

  // 上传头像后检测图片是否合规，违规时将图片存到 flagged/ 文件夹供人工复核
  async checkImageSecurity(fileID, tempFilePath) {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/check-image-url",
        method: "POST",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "Content-Type": "application/json"
        },
        data: { url: fileID }
      });
      if (result.data && result.data.code === 200) {
        return true;
      } else {
        const errMsg = result.data?.msg || '图片检测失败';
        // 违规：将图片存到 flagged/ 文件夹（带openid和昵称），再删除原文件
        try {
          const openId = userInfo?.openId || 'unknown';
          const nickName = (userInfo?.nickName || 'unknown').replace(/[\/\\:*?"<>|]/g, '_');
          const ext = tempFilePath.split('.').pop() || 'png';
          const flaggedPath = 'flagged/' + openId + '_' + nickName + '_' + Date.now() + '.' + ext;
          await wx.cloud.uploadFile({ cloudPath: flaggedPath, filePath: tempFilePath });
        } catch (e) { console.error('保存违规图片到flagged失败', e); }
        try { await wx.cloud.deleteFile({ fileList: [fileID] }); } catch (e) {}
        wx.showModal({ title: '图片审核提示', content: errMsg, showCancel: false });
        return false;
      }
    } catch (err) {
      console.error('图片安全检测失败', err);
      return true;
    }
  },

  // 上传头像到云存储
  async uploadAvatar(tempFilePath) {
    const { openId } = this.data.userInfo;
    if (!openId) {
      wx.showToast({ title: '用户信息异常', icon: 'error' });
      return;
    }

    this.setData({ isUploading: true });
    wx.showLoading({ title: '上传中...', mask: true });

    try {
      const timestamp = Date.now();
      const fileExtension = tempFilePath.split('.').pop() || 'png';
      const cloudPath = `avatars/${openId}_${timestamp}.${fileExtension}`;

      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempFilePath,
        config: { env: 'prod-3gktwx67d1dd1e76' }
      });

      const fileID = uploadResult.fileID;

      // 上传成功后检测图片安全性
      wx.showLoading({ title: '检测图片...' });
      const safe = await this.checkImageSecurity(fileID, tempFilePath);
      if (!safe) {
        wx.hideLoading();
        this.setData({ isUploading: false });
        return;
      }

      this.setData({
        'userInfo.avatarUrl': fileID,
        isUploading: false
      }, () => {
        this.checkIfModified();
      });

      wx.hideLoading();
      wx.showToast({ title: '上传成功', icon: 'success' });

    } catch (error) {
      console.error('上传失败', error);
      wx.hideLoading();
      wx.showToast({ title: '上传失败', icon: 'error' });
      this.setData({ isUploading: false });
    }
  },

  // 保存表单
  async onSave() {
    if (!this.data.canSave || this.data.isUploading) return;

    const { nickName, phoneNumber, wechatId, avatarUrl, openId } = this.data.userInfo;

    // 表单验证
    if (!nickName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    if (!this.isValidPhone(phoneNumber)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    if (!wechatId.trim()) {
      wx.showToast({ title: '请输入微信号', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...', mask: true });

    try {
      const updateData = {
        nickName: nickName.trim(),
        phoneNumber: phoneNumber.trim(),
        wechatId: wechatId.trim(),
        avatarUrl: avatarUrl
      };

      const result = await wx.cloud.callContainer({
        config: { env: 'prod-3gktwx67d1dd1e76' },
        path: '/update_profile',
        header: {
          'X-WX-SERVICE': 'flask-mysql-login',
          'X-Wx-OpenId': openId,
          'content-type': 'application/json'
        },
        method: 'POST',
        data: updateData
      });

      if (result.data.code === 200) {
        // 更新storage
        const updatedUser = result.data.data;
        wx.setStorageSync('userInfo', updatedUser);

        // 更新页面数据
        this.setData({
          userInfo: {
            nickName: updatedUser.nickName || nickName,
            avatarUrl: updatedUser.avatarUrl || avatarUrl,
            phoneNumber: updatedUser.phoneNumber || phoneNumber,
            wechatId: updatedUser.wechatId || wechatId,
            openId: openId,
            verified: updatedUser.verified || this.data.userInfo.verified
          },
          originalUserInfo: {
            nickName: updatedUser.nickName || nickName,
            avatarUrl: updatedUser.avatarUrl || avatarUrl,
            phoneNumber: updatedUser.phoneNumber || phoneNumber,
            wechatId: updatedUser.wechatId || wechatId,
            openId: openId,
            verified: updatedUser.verified || this.data.userInfo.verified
          },
          canSave: false
        });

        wx.hideLoading();
        wx.showToast({ title: '保存成功', icon: 'success' });
        
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        throw new Error(result.data.msg || '更新失败');
      }

    } catch (error) {
      console.error('保存失败', error);
      wx.hideLoading();
      wx.showToast({ title: error.message || '保存失败', icon: 'error' });
    }
  }
});