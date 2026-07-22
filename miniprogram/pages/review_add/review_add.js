// pages/review_add/review_add.js
Page({
  data: {
    mode: 'add',        // 'add' 或 'edit'
    reviewId: null,
    form: {
      name: '',
      time: '',
      location: '',
      difficulty: '',
      distance: '',
      climb: '',
      participants: '',
      cover: '',
      cover2: '',
      cover3: '',       // 新增：公益记录图片
      summary: '',
      photos: []
    },
    submitting: false,
    editorReady: false,
    formatStatus: {},
    showColorPicker: false,
    currentTextColor: '#333333',
    colorList: ['#333333', '#ff4444', '#ff8800', '#4caf50', '#1989fa', '#722ed1']
  },

  onLoad(options) {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'prod-3gktwx67d1dd1e76',
        traceUser: true
      });
    }

    const mode = options.mode || 'add';
    this.setData({ mode });
    wx.setNavigationBarTitle({
      title: mode === 'edit' ? '编辑活动回顾' : '新建活动回顾'
    });

    if (mode === 'edit') {
      const app = getApp();
      const editData = app.globalData.editReviewData;
      if (editData) {
        this.setData({
          reviewId: editData.id,
          form: {
            name: editData.name,
            time: editData.time,
            location: editData.location,
            difficulty: editData.difficulty,
            distance: editData.distance,
            climb: editData.climb,
            participants: editData.participants,
            cover: editData.cover || '',
            cover2: editData.cover2 || '',
            cover3: editData.cover3 || '',      // 新增
            summary: editData.summary || '',
            photos: editData.photos || []
          }
        });
      } else {
        wx.showToast({ title: '数据加载失败', icon: 'none' });
      }
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  // ====== 富文本编辑器 ======
  onEditorReady() {
    wx.createSelectorQuery().select('#editor').context((res) => {
      this.editorCtx = res.context;
      this.setData({ editorReady: true });
      // 编辑模式：回填已有内容
      if (this.data.form.summary) {
        this.editorCtx.setContents({ html: this.data.form.summary });
      }
    }).exec();
  },

  onEditorInput(e) {
    this.setData({ 'form.summary': e.detail.html });
  },

  onEditorStatusChange(e) {
    this.setData({ formatStatus: e.detail });
  },

  onFormat(e) {
    const { name, value } = e.currentTarget.dataset;
    if (name === 'header') {
      this.editorCtx.format(name, value === '' ? false : parseInt(value));
    } else {
      this.editorCtx.format(name);
    }
  },

  onToggleColorPicker() {
    this.setData({ showColorPicker: !this.data.showColorPicker });
  },

  onSetColor(e) {
    const color = e.currentTarget.dataset.color;
    this.editorCtx.format('color', color);
    this.setData({ currentTextColor: color, showColorPicker: false });
  },

  onInsertDivider() {
    this.editorCtx.insertDivider();
  },

  // 上传图片后检测是否合规，违规时将图片存到 flagged/ 文件夹供人工复核
  async checkImageSecurity(fileID, tempFilePath) {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      // cloud:// 协议链接后端无法直接下载，先转成 https 临时链接
      let httpUrl = fileID;
      try {
        const tempRes = await wx.cloud.getTempFileURL({ fileList: [fileID] });
        if (tempRes.fileList && tempRes.fileList[0] && tempRes.fileList[0].tempFileURL) {
          httpUrl = tempRes.fileList[0].tempFileURL;
        }
      } catch (e) {
        console.error('getTempFileURL失败，尝试直接传原始URL', e);
      }
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/check-image-url",
        method: "POST",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "Content-Type": "application/json"
        },
        data: { url: httpUrl }
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

  // 上传图片到云存储，返回 cloud:// 格式的 fileID
  async uploadImageToCloud(filePath) {
    wx.showLoading({ title: '上传中...', mask: true });
    try {
      const ext = filePath.split('.').pop();
      const cloudPath = `review/${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;
      const res = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath
      });
      const fileID = res.fileID;
      // 上传成功后检测图片安全性
      wx.showLoading({ title: '检测图片...' });
      const safe = await this.checkImageSecurity(fileID, filePath);
      if (!safe) {
        wx.hideLoading();
        return null;
      }
      wx.hideLoading();
      return fileID;
    } catch (error) {
      wx.hideLoading();
      console.error('上传失败:', error);
      wx.showToast({ title: '上传失败', icon: 'none' });
      return null;
    }
  },

  // 选择封面图（活动合照 / 卜卜合照 / 公益记录）
  async chooseCover(e) {
    const type = e.currentTarget.dataset.type;   // 'cover', 'cover2', 'cover3'
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const filePath = res.tempFilePaths[0];
        const fileID = await this.uploadImageToCloud(filePath);
        if (fileID) {
          this.setData({ [`form.${type}`]: fileID });
        }
      }
    });
  },

  // 添加照片墙照片
  async addPhoto() {
    wx.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...', mask: true });
        const newPhotos = [...this.data.form.photos];
        for (let i = 0; i < res.tempFilePaths.length; i++) {
          const fileID = await this.uploadImageToCloud(res.tempFilePaths[i]);
          if (fileID) {
            newPhotos.push({ url: fileID, uploader: '管理员' });
          }
        }
        this.setData({ 'form.photos': newPhotos });
        wx.hideLoading();
        wx.showToast({ title: '添加成功', icon: 'success' });
      }
    });
  },

  removePhoto(e) {
    const index = e.currentTarget.dataset.index;
    const photos = this.data.form.photos;
    photos.splice(index, 1);
    this.setData({ 'form.photos': photos });
  },

  async onSubmit() {
    const { mode, reviewId, form, submitting } = this.data;
    if (submitting) return;

    if (!form.name || !form.time || !form.location) {
      wx.showToast({ title: '请填写必填项', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: mode === 'edit' ? '保存中...' : '创建中...' });

    try {
      let result;
      const submitData = {
        name: form.name,
        time: form.time,
        location: form.location,
        difficulty: form.difficulty,
        distance: parseFloat(form.distance) || 0,
        climb: parseInt(form.climb) || 0,
        participants: parseInt(form.participants) || 0,
        summary: form.summary,
        cover: form.cover,
        cover2: form.cover2,
        cover3: form.cover3,          // 新增
        photos: form.photos
      };

      if (mode === 'edit') {
        result = await wx.cloud.callContainer({
          config: { env: "prod-3gktwx67d1dd1e76" },
          path: `/api/reviews/${reviewId}`,
          method: "PUT",
          header: {
            "X-WX-SERVICE": "flask-mysql-login",
            "content-type": "application/json"
          },
          data: submitData
        });
      } else {
        result = await wx.cloud.callContainer({
          config: { env: "prod-3gktwx67d1dd1e76" },
          path: "/api/reviews",
          method: "POST",
          header: {
            "X-WX-SERVICE": "flask-mysql-login",
            "content-type": "application/json"
          },
          data: submitData
        });
      }

      wx.hideLoading();
      if (result.data && result.data.code === 200) {
        wx.showToast({ title: mode === 'edit' ? '保存成功' : '创建成功', icon: 'success' });

        if (mode === 'edit') {
          const app = getApp();
          delete app.globalData.editReviewData;
        }

        setTimeout(() => {
          wx.navigateBack();
          const pages = getCurrentPages();
          const prevPage = pages[pages.length - 2];
          if (prevPage) {
            if (prevPage.route === 'pages/review-detail/review-detail') {
              prevPage.refreshDetail && prevPage.refreshDetail();
            } else if (prevPage.loadReviewList) {
              prevPage.loadReviewList(true);
            }
          }
        }, 1500);
      } else {
        throw new Error(result.data?.msg || '操作失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('提交失败:', error);
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onBack() {
    wx.navigateBack();
  }
});