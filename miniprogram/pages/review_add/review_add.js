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
      summary: '',
      photos: []
    },
    submitting: false
  },

  onLoad(options) {
    // 确保云开发已初始化（通常在 app.js 中完成）
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'prod-3gktwx67d1dd1e76', // 替换为您的云开发环境 ID
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
            cover: editData.cover,
            cover2: editData.cover2,
            summary: editData.summary,
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

  // 上传图片到云存储，返回 cloud:// 格式的 fileID
  async uploadImageToCloud(filePath) {
    wx.showLoading({ title: '上传中...', mask: true });
    try {
      // 生成唯一文件名（按时间 + 随机数 + 扩展名）
      const ext = filePath.split('.').pop();
      const cloudPath = `review/${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;
      const res = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath
      });
      wx.hideLoading();
      return res.fileID; // 例如 cloud://xxx.png
    } catch (error) {
      wx.hideLoading();
      console.error('上传失败:', error);
      wx.showToast({ title: '上传失败', icon: 'none' });
      return null;
    }
  },

  // 选择封面图（人合照 / 卜合照）
  async chooseCover(e) {
    const type = e.currentTarget.dataset.type; // 'cover' or 'cover2'
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
      // 准备提交的数据（注意：cover、cover2、photos 中的 url 已经是 cloud:// 字符串）
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
          if (prevPage && prevPage.loadReviewList) {
            prevPage.loadReviewList(true);
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