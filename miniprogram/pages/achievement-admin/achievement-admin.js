const { get, post, put } = require('../../utils/api');

const emptyForm = () => ({
  id: null,
  name: '',
  description: '',
  image_url: '',
  sort_order: 0,
  is_active: 1,
  activity_ids: []
});

const activitySelection = (activities, activityIds) => {
  const selectedIds = new Set(activityIds.map(Number));
  return {
    activityOptions: activities.filter(item => !selectedIds.has(Number(item.id))),
    linkedActivities: activityIds.map(id => activities.find(item => Number(item.id) === Number(id)) || {
      id: Number(id),
      name: `活动 #${id}`,
      activity_time: ''
    })
  };
};

Page({
  data: {
    loading: true,
    loadError: '',
    saving: false,
    uploading: false,
    editorOpen: false,
    milestones: [],
    eventBadges: [],
    activities: [],
    activityOptions: [],
    showActivityPicker: false,
    linkedActivities: [],
    form: emptyForm()
  },

  onLoad() {
    const user = wx.getStorageSync('userInfo');
    if (Number(user?.isAdmin) !== 1) {
      wx.showModal({
        title: '无权限',
        content: '成就管理仅向超级管理员开放。',
        showCancel: false,
        success: () => wx.switchTab({ url: '/pages/profile/profile' })
      });
    }
  },

  onShow() {
    if (Number(wx.getStorageSync('userInfo')?.isAdmin) === 1 && !this.hasLoaded) {
      this.loadConfig();
    }
  },

  async loadConfig(options = {}) {
    if (!options.silent) this.setData({ loading: true, loadError: '' });
    try {
      const result = await get('/api/achievement-center/admin/config', {}, { silent: true });
      const data = result.data || {};
      const badges = data.badges || [];
      const activities = (data.activities || []).map(item => ({ ...item, id: Number(item.id) }));
      this.hasLoaded = true;
      this.setData({
        loading: false,
        loadError: '',
        milestones: badges.filter(item => Number(item.achievement_type) === 1),
        eventBadges: badges.filter(item => Number(item.achievement_type) === 2).map(item => ({
          ...item,
          is_active: Number(item.is_active || 0),
          activity_ids: (item.activity_ids || []).map(Number),
          activityNames: (item.activity_ids || []).map(id =>
            activities.find(activity => activity.id === Number(id))?.name || `活动 #${id}`
          ).join('、')
        })),
        activities
      });
    } catch (error) {
      console.error('加载成就管理失败', error);
      this.setData({
        loading: false,
        loadError: error.response?.msg || '配置加载失败，请稍后重试'
      });
    }
  },

  onRetry() { this.loadConfig(); },

  openNewBadge() {
    this.openEditor(emptyForm());
  },

  openBadge(e) {
    const badge = this.data.eventBadges.find(item => Number(item.id) === Number(e.currentTarget.dataset.id));
    if (!badge) return;
    this.openEditor({
      id: badge.id,
      name: badge.name || '',
      description: badge.description || '',
      image_url: badge.image_url || '',
      sort_order: Number(badge.sort_order || 0),
      is_active: Number(badge.is_active || 0),
      activity_ids: (badge.activity_ids || []).map(Number)
    });
  },

  openEditor(form) {
    this.setData({
      editorOpen: true,
      form,
      ...activitySelection(this.data.activities, form.activity_ids || [])
    });
  },

  closeEditor() {
    if (this.data.saving || this.data.uploading) return;
    this.setData({ editorOpen: false, form: emptyForm(), linkedActivities: [], showActivityPicker: false });
  },

  onNameInput(e) { this.setData({ 'form.name': e.detail.value }); },
  onDescriptionInput(e) { this.setData({ 'form.description': e.detail.value }); },
  onSortInput(e) { this.setData({ 'form.sort_order': e.detail.value }); },
  onActiveChange(e) { this.setData({ 'form.is_active': e.detail.value ? 1 : 0 }); },

  openActivityPicker() {
    if (this.data.saving || this.data.uploading) return;
    this.setData({ showActivityPicker: true });
  },

  closeActivityPicker() { this.setData({ showActivityPicker: false }); },

  onActivityChange(e) {
    if (this.data.saving || this.data.uploading) return;
    const activity = this.data.activityOptions.find(item => Number(item.id) === Number(e.detail.id));
    if (!activity?.id || this.data.form.activity_ids.includes(activity.id)) return;
    if (this.data.form.activity_ids.length >= 100) {
      wx.showToast({ title: '最多关联100场活动', icon: 'none' });
      return;
    }
    this.updateActivitySelection([...this.data.form.activity_ids, activity.id]);
    this.closeActivityPicker();
  },

  removeActivity(e) {
    if (this.data.saving || this.data.uploading) return;
    const id = Number(e.currentTarget.dataset.id);
    this.updateActivitySelection(this.data.form.activity_ids.filter(activityId => activityId !== id));
  },

  updateActivitySelection(activityIds) {
    this.setData({
      'form.activity_ids': activityIds,
      ...activitySelection(this.data.activities, activityIds)
    });
  },

  chooseImage() {
    if (this.data.saving || this.data.uploading) return;
    wx.chooseImage({
      count: 1,
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
      success: result => this.uploadImage(result.tempFilePaths[0])
    });
  },

  getImageInfo(src) {
    return new Promise((resolve, reject) => wx.getImageInfo({ src, success: resolve, fail: reject }));
  },

  async uploadImage(filePath) {
    this.setData({ uploading: true });
    let fileID = '';
    try {
      const info = await this.getImageInfo(filePath);
      const ratio = info.width / Math.max(1, info.height);
      if (ratio < 0.8 || ratio > 1.2) {
        wx.showModal({ title: '图片比例不符', content: '徽章图片需要接近正方形，建议使用透明背景 PNG。', showCancel: false });
        return;
      }
      const match = filePath.toLowerCase().match(/\.([a-z0-9]+)$/);
      const candidate = match ? match[1] : '';
      const extension = ['jpg', 'jpeg', 'png', 'webp'].includes(candidate) ? candidate : 'png';
      const user = wx.getStorageSync('userInfo');
      const upload = await wx.cloud.uploadFile({
        cloudPath: `achievement-center/badges/event/${user.openId || 'admin'}_${Date.now()}.${extension}`,
        filePath
      });
      fileID = upload.fileID;
      const temp = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const httpUrl = temp.fileList?.[0]?.tempFileURL;
      if (!httpUrl) throw new Error('无法读取上传图片');
      await post('/check-image-url', { url: httpUrl }, { silent: true });
      this.setData({ 'form.image_url': fileID });
      wx.showToast({ title: '图片已上传', icon: 'success' });
    } catch (error) {
      console.error('上传徽章图片失败', error);
      if (fileID) {
        try { await wx.cloud.deleteFile({ fileList: [fileID] }); } catch (_) {}
      }
      wx.showToast({ title: error.response?.msg || error.message || '上传失败', icon: 'none' });
    } finally {
      this.setData({ uploading: false });
    }
  },

  async saveBadge() {
    if (this.data.saving || this.data.uploading) return;
    const form = this.data.form;
    if (!(form.name || '').trim() || !form.image_url) {
      wx.showToast({ title: !form.name.trim() ? '请填写徽章名称' : '请上传徽章图片', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      const payload = {
        name: form.name.trim(),
        description: (form.description || '').trim(),
        image_url: form.image_url,
        sort_order: Number(form.sort_order || 0),
        is_active: Number(form.is_active || 0),
        activity_ids: form.activity_ids || []
      };
      if (form.id) await put(`/api/achievement-center/admin/badges/${form.id}`, payload, { silent: true });
      else await post('/api/achievement-center/admin/badges', payload, { silent: true });
      await this.loadConfig({ silent: true });
      this.setData({ saving: false, editorOpen: false, form: emptyForm(), linkedActivities: [], showActivityPicker: false });
      wx.showToast({ title: '徽章已保存', icon: 'success' });
    } catch (error) {
      console.error('保存彩蛋徽章失败', error);
      this.setData({ saving: false });
      wx.showToast({ title: error.response?.msg || '保存失败，请重试', icon: 'none' });
    }
  }
});
