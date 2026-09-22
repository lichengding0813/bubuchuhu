const { get, post, put } = require('../../utils/api');

const emptyWallForm = () => ({ id: null, title: '', subtitle: '' });
const emptyAssetForm = () => ({
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
    charms: [],
    isLoading: true,
    isSaving: false,
    isUploading: false,
    loadError: '',
    editorMode: '',
    assetEditorReturn: '',
    wallForm: emptyWallForm(),
    ribbonForm: emptyAssetForm(),
    charmForm: emptyAssetForm(),
    selectedRibbonIds: [],
    selectedCharmIds: [],
    selectableRibbons: [],
    selectableCharms: [],
    previewItems: []
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
    if (Number(userInfo?.isAdmin) === 1 && !this.hasLoaded) this.loadConfig();
  },

  async loadConfig(options = {}) {
    if (!options.silent) this.setData({ isLoading: true, loadError: '' });
    try {
      const result = await get('/api/ribbon-wall/admin/config', {}, { silent: true });
      const data = result.data || {};
      const walls = (data.walls || []).map(wall => {
        const ribbons = (wall.ribbons || []).slice().sort((a, b) => a.slot_index - b.slot_index);
        const charms = (wall.charms || []).slice().sort((a, b) => a.slot_index - b.slot_index);
        return {
          ...wall,
          is_active: Number(wall.is_active || 0),
          ribbonCount: ribbons.length,
          charmCount: charms.length,
          ribbons,
          charms,
          layoutItems: [
            ...ribbons.map(item => ({ type: 'ribbon', id: item.id, slot_index: item.slot_index })),
            ...charms.map(item => ({ type: 'charm', id: item.id, slot_index: item.slot_index }))
          ].sort((a, b) => a.slot_index - b.slot_index)
        };
      });
      const assignments = {};
      walls.forEach(wall => {
        wall.ribbons.forEach(ribbon => {
          assignments[ribbon.id] = {
            wallId: wall.id,
            wallTitle: wall.title,
            wallActive: wall.is_active
          };
        });
      });
      const ribbons = (data.ribbons || []).map(ribbon => ({
        ...ribbon,
        is_active: Number(ribbon.is_active || 0),
        assignedWallId: assignments[ribbon.id]?.wallId || 0,
        assignedWallTitle: assignments[ribbon.id]?.wallTitle || '',
        assignedWallActive: assignments[ribbon.id]?.wallActive || 0
      }));
      const charms = (data.charms || []).map(charm => ({
        ...charm,
        is_active: Number(charm.is_active || 0)
      }));
      this.hasLoaded = true;
      this.setData({ walls, ribbons, charms, isLoading: false, loadError: '' });
      if (this.pendingWallId) {
        const wall = walls.find(item => item.id === this.pendingWallId);
        this.pendingWallId = 0;
        if (wall) this.startWallEditor(wall);
      }
      return { walls, ribbons, charms };
    } catch (error) {
      console.error('加载飘带墙配置失败', error);
      this.setData({
        isLoading: false,
        loadError: error.response?.msg || '配置加载失败，请稍后重试'
      });
      throw error;
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
    const wallForm = wall ? {
      id: wall.id,
      title: wall.title || '',
      subtitle: wall.subtitle || ''
    } : emptyWallForm();
    const ribbonIds = wall ? wall.ribbons.map(item => Number(item.id)) : [];
    const charmIds = wall ? wall.charms.map(item => Number(item.id)).filter(Boolean) : [];
    const previewItems = wall ? wall.layoutItems : [];
    this.setData({ editorMode: 'wall', wallForm, assetEditorReturn: '' });
    this.syncWallSelection(ribbonIds, charmIds, previewItems);
  },

  syncWallSelection(ribbonIds, charmIds, previewItems = []) {
    const selectedRibbonIds = ribbonIds
      .map(Number)
      .filter(id => this.data.ribbons.some(item => item.id === id));
    const selectedCharmIds = charmIds
      .map(Number)
      .filter(id => this.data.charms.some(item => item.id === id));
    const selectedKeys = new Set([
      ...selectedRibbonIds.map(id => `ribbon-${id}`),
      ...selectedCharmIds.map(id => `charm-${id}`)
    ]);
    const seen = new Set();
    const orderedRefs = (previewItems || []).filter(item => {
      const key = `${item.type}-${Number(item.id)}`;
      if (!selectedKeys.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(item => ({ type: item.type, id: Number(item.id) }));
    selectedRibbonIds.forEach(id => {
      const key = `ribbon-${id}`;
      if (!seen.has(key)) {
        seen.add(key);
        orderedRefs.push({ type: 'ribbon', id });
      }
    });
    selectedCharmIds.forEach(id => {
      const key = `charm-${id}`;
      if (!seen.has(key)) {
        seen.add(key);
        orderedRefs.push({ type: 'charm', id });
      }
    });
    const decoratedPreview = orderedRefs.map((ref, index) => {
      const source = ref.type === 'ribbon'
        ? this.data.ribbons.find(item => item.id === ref.id)
        : this.data.charms.find(item => item.id === ref.id);
      return {
        ...ref,
        key: `${ref.type}-${ref.id}`,
        order: index + 1,
        name: source?.name || '',
        image_url: source?.image_url || '',
        typeLabel: ref.type === 'ribbon' ? '飘带' : '挂件'
      };
    });
    this.setData({
      selectedRibbonIds,
      selectedCharmIds,
      selectableRibbons: this.data.ribbons.map(item => ({
        ...item,
        selected: selectedRibbonIds.includes(item.id)
      })),
      selectableCharms: this.data.charms.map(item => ({
        ...item,
        selected: selectedCharmIds.includes(item.id)
      })),
      previewItems: decoratedPreview
    });
  },

  onWallTitleInput(e) {
    this.setData({ 'wallForm.title': e.detail.value });
  },

  onWallSubtitleInput(e) {
    this.setData({ 'wallForm.subtitle': e.detail.value });
  },

  onToggleWallRibbon(e) {
    const ribbonId = Number(e.currentTarget.dataset.id);
    const ribbon = this.data.ribbons.find(item => item.id === ribbonId);
    if (!ribbon) return;
    const ribbonIds = [...this.data.selectedRibbonIds];
    const index = ribbonIds.indexOf(ribbonId);
    if (index >= 0) {
      ribbonIds.splice(index, 1);
    } else {
      if (ribbon.assignedWallActive && ribbon.assignedWallId !== this.data.wallForm.id) {
        wx.showToast({ title: '这条飘带已在其他墙面使用', icon: 'none' });
        return;
      }
      if (!ribbon.is_active) {
        wx.showToast({ title: '请先启用这条飘带', icon: 'none' });
        return;
      }
      if (ribbonIds.length >= 4) {
        wx.showToast({ title: '每面墙固定选择 4 条飘带', icon: 'none' });
        return;
      }
      ribbonIds.push(ribbonId);
    }
    this.syncWallSelection(ribbonIds, this.data.selectedCharmIds, this.data.previewItems);
  },

  onToggleWallCharm(e) {
    const charmId = Number(e.currentTarget.dataset.id);
    const charm = this.data.charms.find(item => item.id === charmId);
    if (!charm) return;
    const charmIds = [...this.data.selectedCharmIds];
    const index = charmIds.indexOf(charmId);
    if (index >= 0) {
      charmIds.splice(index, 1);
    } else {
      if (!charm.is_active) {
        wx.showToast({ title: '请先启用这个挂件', icon: 'none' });
        return;
      }
      if (charmIds.length >= 3) {
        wx.showToast({ title: '每面墙最多选择 3 个挂件', icon: 'none' });
        return;
      }
      charmIds.push(charmId);
    }
    this.syncWallSelection(this.data.selectedRibbonIds, charmIds, this.data.previewItems);
  },

  onMovePreviewItem(e) {
    const index = Number(e.currentTarget.dataset.index);
    const direction = Number(e.currentTarget.dataset.direction);
    const target = index + direction;
    const previewItems = [...this.data.previewItems];
    if (target < 0 || target >= previewItems.length) return;
    [previewItems[index], previewItems[target]] = [previewItems[target], previewItems[index]];
    this.setData({
      previewItems: previewItems.map((item, itemIndex) => ({ ...item, order: itemIndex + 1 }))
    });
  },

  async onSaveWall() {
    if (this.data.isSaving) return;
    const title = (this.data.wallForm.title || '').trim();
    if (!title) {
      wx.showToast({ title: '请填写墙面名称', icon: 'none' });
      return;
    }
    if (this.data.selectedRibbonIds.length !== 4) {
      wx.showToast({ title: '每面墙需要选择 4 条飘带', icon: 'none' });
      return;
    }
    this.setData({ isSaving: true });
    try {
      await post('/api/ribbon-wall/admin/walls/save', {
        id: this.data.wallForm.id || 0,
        title,
        subtitle: (this.data.wallForm.subtitle || '').trim(),
        is_active: 1,
        ordered_items: this.data.previewItems.map(item => ({ type: item.type, id: item.id }))
      }, { silent: true });
      wx.showToast({ title: '墙面已保存', icon: 'success' });
      this.setData({ editorMode: '', isSaving: false, wallForm: emptyWallForm() });
      await this.loadConfig({ silent: true });
    } catch (error) {
      console.error('保存墙面失败', error);
      this.setData({ isSaving: false });
      wx.showToast({ title: error.response?.msg || '保存失败，请重试', icon: 'none' });
    }
  },

  openAssetEditor(type, asset = null, returnToWall = false) {
    const formKey = type === 'ribbon' ? 'ribbonForm' : 'charmForm';
    this.setData({
      editorMode: type,
      assetEditorReturn: returnToWall ? 'wall' : '',
      [formKey]: asset ? {
        id: asset.id,
        name: asset.name || '',
        description: asset.description || '',
        image_url: asset.image_url || '',
        is_active: Number(asset.is_active || 0)
      } : emptyAssetForm()
    });
  },

  onAddRibbon() { this.openAssetEditor('ribbon'); },
  onAddRibbonFromWall() { this.openAssetEditor('ribbon', null, true); },
  onEditRibbon(e) {
    const asset = this.data.ribbons.find(item => item.id === Number(e.currentTarget.dataset.id));
    if (asset) this.openAssetEditor('ribbon', asset);
  },
  onEditRibbonFromWall(e) {
    const asset = this.data.ribbons.find(item => item.id === Number(e.currentTarget.dataset.id));
    if (asset) this.openAssetEditor('ribbon', asset, true);
  },
  onAddCharm() { this.openAssetEditor('charm'); },
  onAddCharmFromWall() { this.openAssetEditor('charm', null, true); },
  onEditCharm(e) {
    const asset = this.data.charms.find(item => item.id === Number(e.currentTarget.dataset.id));
    if (asset) this.openAssetEditor('charm', asset);
  },
  onEditCharmFromWall(e) {
    const asset = this.data.charms.find(item => item.id === Number(e.currentTarget.dataset.id));
    if (asset) this.openAssetEditor('charm', asset, true);
  },

  onRibbonNameInput(e) { this.setData({ 'ribbonForm.name': e.detail.value }); },
  onRibbonDescriptionInput(e) { this.setData({ 'ribbonForm.description': e.detail.value }); },
  onRibbonActiveChange(e) { this.setData({ 'ribbonForm.is_active': e.detail.value ? 1 : 0 }); },
  onCharmNameInput(e) { this.setData({ 'charmForm.name': e.detail.value }); },
  onCharmDescriptionInput(e) { this.setData({ 'charmForm.description': e.detail.value }); },
  onCharmActiveChange(e) { this.setData({ 'charmForm.is_active': e.detail.value ? 1 : 0 }); },
  onChooseRibbonImage() { this.chooseAssetImage('ribbon'); },
  onChooseCharmImage() { this.chooseAssetImage('charm'); },

  chooseAssetImage(type) {
    if (this.data.isUploading) return;
    wx.chooseImage({
      count: 1,
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
      success: result => this.uploadAssetImage(type, result.tempFilePaths[0])
    });
  },

  getImageInfo(src) {
    return new Promise((resolve, reject) => wx.getImageInfo({ src, success: resolve, fail: reject }));
  },

  async uploadAssetImage(type, filePath) {
    this.setData({ isUploading: true });
    let fileID = '';
    try {
      const info = await this.getImageInfo(filePath);
      const ratio = info.width / Math.max(1, info.height);
      const invalid = type === 'ribbon'
        ? ratio < 0.075 || ratio > 0.125
        : ratio < 0.65 || ratio > 1.35;
      if (invalid) {
        wx.showModal({
          title: '图片比例不符',
          content: type === 'ribbon'
            ? '飘带图片需要接近 1:10 的竖长比例。'
            : '挂件图片需要接近正方形，建议使用透明背景 PNG。',
          showCancel: false
        });
        return;
      }
      const match = filePath.toLowerCase().match(/\.([a-z0-9]+)$/);
      const candidate = match ? match[1] : '';
      const extension = ['jpg', 'jpeg', 'png', 'webp'].includes(candidate) ? candidate : 'jpg';
      const folder = type === 'ribbon' ? 'ribbons' : 'charms';
      const userInfo = wx.getStorageSync('userInfo');
      const upload = await wx.cloud.uploadFile({
        cloudPath: `ribbon-wall/${folder}/${userInfo.openId || 'admin'}_${Date.now()}.${extension}`,
        filePath
      });
      fileID = upload.fileID;
      const tempResult = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const httpUrl = tempResult.fileList?.[0]?.tempFileURL;
      if (!httpUrl) throw new Error('无法读取上传图片');
      await post('/check-image-url', { url: httpUrl }, { silent: true });
      this.setData({ [`${type}Form.image_url`]: fileID });
      wx.showToast({ title: '图片已上传', icon: 'success' });
    } catch (error) {
      console.error('上传素材图片失败', error);
      if (fileID) {
        try { await wx.cloud.deleteFile({ fileList: [fileID] }); } catch (_) {}
      }
      wx.showToast({ title: error.response?.msg || error.message || '上传失败', icon: 'none' });
    } finally {
      this.setData({ isUploading: false });
    }
  },

  async saveAsset(type) {
    if (this.data.isSaving || this.data.isUploading) return;
    const isRibbon = type === 'ribbon';
    const form = isRibbon ? this.data.ribbonForm : this.data.charmForm;
    const label = isRibbon ? '飘带' : '挂件';
    const name = (form.name || '').trim();
    if (!name || !form.image_url) {
      wx.showToast({ title: !name ? `请填写${label}名称` : `请上传${label}图片`, icon: 'none' });
      return;
    }
    const wasNew = !form.id;
    const returnToWall = this.data.assetEditorReturn === 'wall';
    const selectedRibbonIds = [...this.data.selectedRibbonIds];
    const selectedCharmIds = [...this.data.selectedCharmIds];
    const previewItems = this.data.previewItems.map(item => ({ type: item.type, id: item.id }));
    const endpoint = isRibbon ? 'ribbons' : 'charms';
    this.setData({ isSaving: true });
    try {
      const payload = {
        name,
        description: (form.description || '').trim(),
        image_url: form.image_url,
        is_active: form.is_active
      };
      const result = form.id
        ? await put(`/api/ribbon-wall/admin/${endpoint}/${form.id}`, payload, { silent: true })
        : await post(`/api/ribbon-wall/admin/${endpoint}`, payload, { silent: true });
      const savedId = Number(form.id || result.data?.id || 0);
      await this.loadConfig({ silent: true });
      if (returnToWall) {
        if (wasNew && savedId) {
          if (isRibbon && selectedRibbonIds.length < 4) selectedRibbonIds.push(savedId);
          if (!isRibbon && selectedCharmIds.length < 3) selectedCharmIds.push(savedId);
          previewItems.push({ type, id: savedId });
        }
        this.setData({ editorMode: 'wall', assetEditorReturn: '', isSaving: false });
        this.syncWallSelection(selectedRibbonIds, selectedCharmIds, previewItems);
      } else {
        this.setData({ editorMode: '', assetEditorReturn: '', isSaving: false });
      }
      wx.showToast({ title: `${label}已保存`, icon: 'success' });
    } catch (error) {
      console.error(`保存${label}失败`, error);
      this.setData({ isSaving: false });
      wx.showToast({ title: error.response?.msg || '保存失败，请重试', icon: 'none' });
    }
  },

  onSaveRibbon() { this.saveAsset('ribbon'); },
  onSaveCharm() { this.saveAsset('charm'); },

  onCloseEditor() {
    if (this.data.isSaving || this.data.isUploading) return;
    if ((this.data.editorMode === 'ribbon' || this.data.editorMode === 'charm')
        && this.data.assetEditorReturn === 'wall') {
      this.setData({
        editorMode: 'wall',
        assetEditorReturn: '',
        ribbonForm: emptyAssetForm(),
        charmForm: emptyAssetForm()
      });
      return;
    }
    this.setData({
      editorMode: '',
      assetEditorReturn: '',
      wallForm: emptyWallForm(),
      ribbonForm: emptyAssetForm(),
      charmForm: emptyAssetForm()
    });
  }
});
