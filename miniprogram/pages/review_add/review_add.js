// pages/review_add/review_add.js
const { get, post, put } = require('../../utils/api');

Page({
  data: {
    mode: 'add',        // 'add' 或 'edit'
    reviewId: null,
    sourceActivityId: null,
    selectedActivity: null,
    officialActivities: [],
    filteredOfficialActivities: [],
    loadingActivities: false,
    showActivityPicker: false,
    activityKeyword: '',
    importedCover: '',
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
    currentTextColor: '#333333',
    colorList: ['#333333', '#ff4444', '#1989fa', '#ff8800', '#4caf50'],
    fontSizeList: [12, 14, 16, 18, 24, 36],
    fontSizeLabels: ['12px', '14px', '16px', '18px', '24px', '36px'],
    currentFontSize: '16'
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
          sourceActivityId: editData.activity_id || null,
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
    } else {
      this.loadOfficialActivities();
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  async loadOfficialActivities() {
    if (this.data.loadingActivities) return;
    this.setData({ loadingActivities: true });
    try {
      const result = await get('/api/reviews/official-activities', {}, { silent: true });
      const list = (result.data?.list || []).map(item => ({
        ...item,
        id: Number(item.id),
        participant_count: Number(item.participant_count) || 0,
        difficulty_text: this.formatDifficulty(item.difficulty),
        status_text: this.getActivityStatusText(item.status)
      }));
      this.setData({
        officialActivities: list,
        filteredOfficialActivities: list
      });
    } catch (error) {
      console.error('加载官方活动失败:', error);
      wx.showToast({ title: error.response?.msg || '官方活动加载失败', icon: 'none' });
    } finally {
      this.setData({ loadingActivities: false });
    }
  },

  formatDifficulty(value) {
    if (!value) return '待定';
    const text = String(value);
    return text.includes('⭐') ? text : `${text}⭐`;
  },

  getActivityStatusText(status) {
    return ({ 1: '报名中', 3: '进行中', 4: '已结束' })[Number(status)] || '已发布';
  },

  openActivityPicker() {
    this.setData({ showActivityPicker: true });
    if (!this.data.loadingActivities && this.data.officialActivities.length === 0) {
      this.loadOfficialActivities();
    }
  },

  closeActivityPicker() {
    this.setData({ showActivityPicker: false });
  },

  onActivityKeywordInput(e) {
    const keyword = String(e.detail.value || '').trim().toLowerCase();
    const filtered = this.data.officialActivities.filter(item => {
      const content = `${item.name || ''} ${item.location || ''} ${item.time || ''}`.toLowerCase();
      return !keyword || content.includes(keyword);
    });
    this.setData({
      activityKeyword: e.detail.value,
      filteredOfficialActivities: filtered
    });
  },

  onSelectOfficialActivity(e) {
    const activityId = Number(e.currentTarget.dataset.id);
    const activity = this.data.officialActivities.find(item => item.id === activityId);
    if (!activity) return;

    const hasCustomCover = this.data.form.cover && this.data.form.cover !== this.data.importedCover;
    const importedCover = activity.cover_url || '';
    this.setData({
      sourceActivityId: activity.id,
      selectedActivity: activity,
      importedCover,
      showActivityPicker: false,
      'form.name': activity.name || '',
      'form.time': activity.time || '',
      'form.location': activity.location || '',
      'form.difficulty': activity.difficulty_text,
      'form.distance': activity.distance ?? '',
      'form.climb': activity.climb ?? '',
      'form.participants': activity.participant_count,
      'form.cover': hasCustomCover ? this.data.form.cover : importedCover
    });
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
    if (!this.editorCtx) return;
    const { name, value } = e.currentTarget.dataset;
    if (name === 'header') {
      this.editorCtx.format(name, value === '' ? false : parseInt(value));
    } else {
      this.editorCtx.format(name);
    }
  },

  onFontSizeChange(e) {
    if (!this.editorCtx) return;
    const idx = e.detail.value;
    const size = this.data.fontSizeList[idx];
    this.editorCtx.format('fontSize', size + 'px');
    this.setData({ currentFontSize: size });
  },

  onSetColor(e) {
    if (!this.editorCtx) return;
    const color = e.currentTarget.dataset.color;
    this.editorCtx.format('color', color);
    this.setData({ currentTextColor: color });
  },

  onInsertDivider() {
    if (!this.editorCtx) return;
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
    const { mode, reviewId, sourceActivityId, form, submitting } = this.data;
    if (submitting) return;

    if (mode === 'add' && !sourceActivityId) {
      wx.showToast({ title: '请先选择官方活动', icon: 'none' });
      return;
    }

    if (!form.name || !form.time || !form.location) {
      wx.showToast({ title: '请填写必填项', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: mode === 'edit' ? '保存中...' : '创建中...' });

    try {
      let result;
      const submitData = {
        activity_id: sourceActivityId,
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
        result = await put(`/api/reviews/${reviewId}`, submitData, { silent: true });
      } else {
        result = await post('/api/reviews', submitData, { silent: true });
      }

      wx.hideLoading();
      if (result && result.code === 200) {
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
        throw new Error(result?.msg || '操作失败');
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
