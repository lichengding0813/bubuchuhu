const { get, post, put } = require('../../utils/api');
const { CLOUD_ASSET_PREFIX } = require('../../utils/config');

const RIBBON_CLOUD_ROOT = `${CLOUD_ASSET_PREFIX}/ribbon-wall`;

const CHARM_OPTIONS = [
  { label: '无挂件', value: '' },
  { label: '粉色球', value: `${RIBBON_CLOUD_ROOT}/charms/ball-pink.png` },
  { label: '萝卜朋友', value: `${RIBBON_CLOUD_ROOT}/charms/carrot-friend.png` },
  { label: '红色球', value: `${RIBBON_CLOUD_ROOT}/charms/ball-red.png` },
  { label: '蓝色球', value: `${RIBBON_CLOUD_ROOT}/charms/ball-blue.png` },
  { label: '绿色球', value: `${RIBBON_CLOUD_ROOT}/charms/ball-green.png` },
  { label: '黄色球', value: `${RIBBON_CLOUD_ROOT}/charms/ball-yellow.png` }
];

const emptyWallForm = () => ({
  id: null,
  title: '',
  subtitle: '',
  is_active: 0,
  charm_urls: ['', '', '']
});

const emptyRibbonForm = () => ({
  id: null,
  name: '',
  description: '',
  image_url: '',
  is_active: 1
});

Page({
  data: {
    walls: [],
    ribbons: [],
    isLoading: true,
    isSaving: false,
    loadError: '',
    editorMode: '',
    wallForm: emptyWallForm(),
    ribbonForm: emptyRibbonForm(),
    selectedRibbonIds: [],
    selectedRibbonList: [],
    selectableRibbons: [],
    charmOptions: CHARM_OPTIONS,
    charmPickerIndexes: [0, 0, 0],
    isUploading: false
  },

  onLoad(options) {
    const userInfo = wx.getStorageSync('userInfo');
    if (Number(userInfo?.isAdmin) !== 1) {
      wx.showModal({
        title: '无权限',
        content: '飘带墙配置仅向超级管理员开放。',
        showCancel: false,
        success: () => wx.switchTab({ url: '/pages/profile/profile' })
      });
      return;
    }
    this.pendingWallId = Number(options.wallId || 0);
  },

  onShow() {
    const userInfo = wx.getStorageSync('userInfo');
    if (Number(userInfo?.isAdmin) === 1) this.loadConfig();
  },

  async loadConfig() {
    this.setData({ isLoading: true, loadError: '' });
    try {
      const result = await get('/api/ribbon-wall/admin/config', {}, { silent: true });
      const data = result.data || {};
      const walls = (data.walls || []).map(wall => ({
        ...wall,
        is_active: Number(wall.is_active || 0),
        ribbonCount: (wall.ribbons || []).length,
        ribbons: (wall.ribbons || []).slice().sort((a, b) => a.slot_index - b.slot_index)
      }));
      const assignments = {};
      walls.forEach(wall => {
        wall.ribbons.forEach(ribbon => {
          assignments[ribbon.id] = { wallId: wall.id, wallTitle: wall.title, wallActive: wall.is_active };
        });
      });
      const ribbons = (data.ribbons || []).map(ribbon => ({
        ...ribbon,
        is_active: Number(ribbon.is_active || 0),
        assignedWallId: assignments[ribbon.id]?.wallId || 0,
        assignedWallTitle: assignments[ribbon.id]?.wallTitle || '',
        assignedWallActive: assignments[ribbon.id]?.wallActive || 0
      }));
      this.setData({ walls, ribbons, isLoading: false });
      if (this.pendingWallId) {
        const wall = walls.find(item => item.id === this.pendingWallId);
        this.pendingWallId = 0;
        if (wall) this.startWallEditor(wall);
      }
    } catch (error) {
      console.error('加载飘带墙配置失败', error);
      this.setData({
        isLoading: false,
        loadError: error.response?.msg || '配置加载失败，请稍后重试'
      });
    }
  },

  onRetry() {
    this.loadConfig();
  },

  onAddWall() {
    this.startWallEditor(null);
  },

  onEditWall(e) {
    const wallId = Number(e.currentTarget.dataset.id);
    const wall = this.data.walls.find(item => item.id === wallId);
    if (wall) this.startWallEditor(wall);
  },

  startWallEditor(wall) {
    const charmUrls = ['', '', ''];
    (wall?.charms || []).forEach(charm => {
      const index = Number(charm.slot_index) - 1;
      if (index >= 0 && index < 3) charmUrls[index] = charm.image_url || '';
    });
    const wallForm = wall ? {
      id: wall.id,
      title: wall.title || '',
      subtitle: wall.subtitle || '',
      is_active: Number(wall.is_active || 0),
      charm_urls: charmUrls
    } : emptyWallForm();
    const selectedRibbonIds = wall
      ? (wall.ribbons || []).map(item => item.id)
      : [];
    this.setData({
      editorMode: 'wall',
      wallForm,
      charmPickerIndexes: wallForm.charm_urls.map(url => {
        const index = CHARM_OPTIONS.findIndex(option => option.value === url);
        return index >= 0 ? index : 0;
      })
    });
    this.syncWallRibbonSelection(selectedRibbonIds);
  },

  onWallTitleInput(e) {
    this.setData({ 'wallForm.title': e.detail.value });
  },

  onWallSubtitleInput(e) {
    this.setData({ 'wallForm.subtitle': e.detail.value });
  },

  onWallActiveChange(e) {
    this.setData({ 'wallForm.is_active': e.detail.value ? 1 : 0 });
  },

  onCharmChange(e) {
    const slot = Number(e.currentTarget.dataset.slot);
    const optionIndex = Number(e.detail.value || 0);
    const pickerIndexes = [...this.data.charmPickerIndexes];
    const charmUrls = [...this.data.wallForm.charm_urls];
    pickerIndexes[slot] = optionIndex;
    charmUrls[slot] = CHARM_OPTIONS[optionIndex]?.value || '';
    this.setData({ charmPickerIndexes: pickerIndexes, 'wallForm.charm_urls': charmUrls });
  },

  syncWallRibbonSelection(ids) {
    const selectedRibbonIds = ids.map(Number);
    const selectedRibbonList = selectedRibbonIds
      .map(id => this.data.ribbons.find(item => item.id === id))
      .filter(Boolean);
    const selectableRibbons = this.data.ribbons.map(item => ({
      ...item,
      selected: selectedRibbonIds.includes(item.id)
    }));
    this.setData({ selectedRibbonIds, selectedRibbonList, selectableRibbons });
  },

  onToggleWallRibbon(e) {
    const ribbonId = Number(e.currentTarget.dataset.id);
    const ribbon = this.data.ribbons.find(item => item.id === ribbonId);
    if (!ribbon) return;
    const ids = [...this.data.selectedRibbonIds];
    const index = ids.indexOf(ribbonId);
    if (index >= 0) {
      ids.splice(index, 1);
    } else {
      if (ribbon.assignedWallActive && ribbon.assignedWallId !== this.data.wallForm.id) {
        wx.showToast({ title: '请先下线该飘带所在墙面', icon: 'none' });
        return;
      }
      if (!ribbon.is_active) {
        wx.showToast({ title: '请先启用这条飘带', icon: 'none' });
        return;
      }
      if (ids.length >= 4) {
        wx.showToast({ title: '每面墙最多放 4 条飘带', icon: 'none' });
        return;
      }
      ids.push(ribbonId);
    }
    this.syncWallRibbonSelection(ids);
  },

  onMoveSelectedRibbon(e) {
    const index = Number(e.currentTarget.dataset.index);
    const direction = Number(e.currentTarget.dataset.direction);
    const target = index + direction;
    const ids = [...this.data.selectedRibbonIds];
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    this.syncWallRibbonSelection(ids);
  },

  async onSaveWall() {
    if (this.data.isSaving) return;
    const wallForm = this.data.wallForm;
    const title = (wallForm.title || '').trim();
    if (!title) {
      wx.showToast({ title: '请填写墙面名称', icon: 'none' });
      return;
    }
    if (wallForm.is_active && this.data.selectedRibbonIds.length !== 4) {
      wx.showToast({ title: '发布墙面需要配置 4 条飘带', icon: 'none' });
      return;
    }
    this.setData({ isSaving: true });
    try {
      const payload = {
        id: wallForm.id || 0,
        title,
        subtitle: (wallForm.subtitle || '').trim(),
        is_active: wallForm.is_active,
        charm_urls: wallForm.charm_urls,
        ribbon_ids: this.data.selectedRibbonIds
      };
      await post('/api/ribbon-wall/admin/walls/save', payload, { silent: true });
      wx.showToast({ title: '墙面已保存', icon: 'success' });
      this.setData({ editorMode: '', isSaving: false });
      await this.loadConfig();
    } catch (error) {
      console.error('保存墙面失败', error);
      this.setData({ isSaving: false });
      wx.showToast({ title: error.response?.msg || '保存失败，请重试', icon: 'none' });
    }
  },

  onAddRibbon() {
    this.setData({ editorMode: 'ribbon', ribbonForm: emptyRibbonForm() });
  },

  onEditRibbon(e) {
    const ribbonId = Number(e.currentTarget.dataset.id);
    const ribbon = this.data.ribbons.find(item => item.id === ribbonId);
    if (!ribbon) return;
    this.setData({
      editorMode: 'ribbon',
      ribbonForm: {
        id: ribbon.id,
        name: ribbon.name || '',
        description: ribbon.description || '',
        image_url: ribbon.image_url || '',
        is_active: Number(ribbon.is_active || 0)
      }
    });
  },

  onRibbonNameInput(e) {
    this.setData({ 'ribbonForm.name': e.detail.value });
  },

  onRibbonDescriptionInput(e) {
    this.setData({ 'ribbonForm.description': e.detail.value });
  },

  onRibbonActiveChange(e) {
    this.setData({ 'ribbonForm.is_active': e.detail.value ? 1 : 0 });
  },

  onChooseRibbonImage() {
    if (this.data.isUploading) return;
    wx.chooseImage({
      count: 1,
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
      success: result => this.uploadRibbonImage(result.tempFilePaths[0])
    });
  },

  getImageInfo(src) {
    return new Promise((resolve, reject) => wx.getImageInfo({ src, success: resolve, fail: reject }));
  },

  async uploadRibbonImage(filePath) {
    this.setData({ isUploading: true });
    let fileID = '';
    try {
      const info = await this.getImageInfo(filePath);
      const ratio = info.width / Math.max(1, info.height);
      if (ratio < 0.075 || ratio > 0.125) {
        wx.showModal({
          title: '图片比例不符',
          content: '飘带图片需要接近 1:10 的竖长比例，请裁切后重新上传。',
          showCancel: false
        });
        return;
      }
      const extensionMatch = filePath.toLowerCase().match(/\.([a-z0-9]+)$/);
      const candidateExtension = extensionMatch ? extensionMatch[1] : '';
      const extension = ['jpg', 'jpeg', 'png', 'webp'].includes(candidateExtension)
        ? candidateExtension
        : 'jpg';
      const userInfo = wx.getStorageSync('userInfo');
      const upload = await wx.cloud.uploadFile({
        cloudPath: `ribbon-wall/ribbons/${userInfo.openId || 'admin'}_${Date.now()}.${extension}`,
        filePath
      });
      fileID = upload.fileID;
      const tempResult = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const httpUrl = tempResult.fileList?.[0]?.tempFileURL;
      if (!httpUrl) throw new Error('无法读取上传图片');
      await post('/check-image-url', { url: httpUrl }, { silent: true });
      this.setData({ 'ribbonForm.image_url': fileID });
      wx.showToast({ title: '图片已上传', icon: 'success' });
    } catch (error) {
      console.error('上传飘带图片失败', error);
      if (fileID) {
        try { await wx.cloud.deleteFile({ fileList: [fileID] }); } catch (_) {}
      }
      wx.showToast({ title: error.response?.msg || error.message || '上传失败', icon: 'none' });
    } finally {
      this.setData({ isUploading: false });
    }
  },

  async onSaveRibbon() {
    if (this.data.isSaving || this.data.isUploading) return;
    const form = this.data.ribbonForm;
    const name = (form.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写飘带名称', icon: 'none' });
      return;
    }
    if (!form.image_url) {
      wx.showToast({ title: '请上传飘带图片', icon: 'none' });
      return;
    }
    const payload = {
      name,
      description: (form.description || '').trim(),
      image_url: form.image_url,
      is_active: form.is_active
    };
    this.setData({ isSaving: true });
    try {
      if (form.id) {
        await put(`/api/ribbon-wall/admin/ribbons/${form.id}`, payload, { silent: true });
      } else {
        await post('/api/ribbon-wall/admin/ribbons', payload, { silent: true });
      }
      wx.showToast({ title: '飘带已保存', icon: 'success' });
      this.setData({ editorMode: '', isSaving: false });
      await this.loadConfig();
    } catch (error) {
      console.error('保存飘带失败', error);
      this.setData({ isSaving: false });
      wx.showToast({ title: error.response?.msg || '保存失败，请重试', icon: 'none' });
    }
  },

  onCloseEditor() {
    if (this.data.isSaving || this.data.isUploading) return;
    this.setData({ editorMode: '', wallForm: emptyWallForm(), ribbonForm: emptyRibbonForm() });
  }
});
