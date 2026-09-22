const { get, put } = require('../../utils/api');

Page({
  data: {
    walls: [],
    total: 0,
    litCount: 0,
    progressWidth: 0,
    progressHint: '',
    filter: 'all',
    currentWall: 0,
    isAdmin: false,
    isLoading: true,
    loadError: '',
    selectedRibbon: null,
    detailVisible: false,
    isSubmitting: false,
    successRibbon: null,
    successVisible: false
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo?.openId) {
      wx.showModal({
        title: '请先登录',
        content: '登录后才能记录和同步飘带收藏。',
        showCancel: false,
        success: () => wx.navigateBack()
      });
      return;
    }
    this.setData({ isAdmin: Number(userInfo.isAdmin) === 1 });
  },

  onShow() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo?.openId) this.loadCollection();
  },

  async onPullDownRefresh() {
    await this.loadCollection({ silent: true });
    wx.stopPullDownRefresh();
  },

  decorateWalls(walls, filter = this.data.filter) {
    return (walls || []).map((wall, wallIndex) => {
      const ribbons = (wall.ribbons || []).map(ribbon => {
        const owned = Boolean(ribbon.owned_status);
        const visible = filter === 'all'
          || (filter === 'lit' && owned)
          || (filter === 'unlit' && !owned);
        return {
          ...ribbon,
          owned_status: owned,
          visible,
          number: String(ribbon.id).padStart(2, '0'),
          left: 12.5 + (Number(ribbon.slot_index || 1) - 1) * 25,
          image_failed: Boolean(ribbon.image_failed)
        };
      });
      const charms = (wall.charms || []).map(charm => ({
        ...charm,
        left: Number(charm.slot_index || 1) * 25
      }));
      return {
        ...wall,
        wallIndex,
        ribbons,
        charms,
        visibleCount: ribbons.filter(item => item.visible).length
      };
    });
  },

  async loadCollection(options = {}) {
    if (!options.silent) this.setData({ isLoading: true, loadError: '' });
    try {
      const result = await get('/api/ribbon-wall', {}, { silent: true });
      const data = result.data || {};
      const total = Number(data.total || 0);
      const litCount = Number(data.lit_count || 0);
      const walls = this.decorateWalls(data.walls || []);
      const currentWall = Math.min(this.data.currentWall, Math.max(0, walls.length - 1));
      this.setData({
        walls,
        total,
        litCount,
        currentWall,
        progressWidth: total ? Math.round(litCount / total * 100) : 0,
        progressHint: this.progressHint(litCount, total),
        isAdmin: Boolean(data.can_manage),
        isLoading: false,
        loadError: ''
      });
    } catch (error) {
      console.error('加载飘带墙失败', error);
      this.setData({
        isLoading: false,
        loadError: error.response?.msg || '飘带墙加载失败，请稍后重试'
      });
    }
  },

  progressHint(litCount, total) {
    if (!total) return '暂无已发布的飘带';
    if (litCount === total) return '整面飘带墙已经全部点亮';
    if (litCount === 0) return '点击你已经拥有的飘带进行点亮';
    return `再点亮 ${total - litCount} 款，就能完成当前收藏`;
  },

  onRetry() {
    this.loadCollection();
  },

  onFilterTap(e) {
    const filter = e.currentTarget.dataset.filter;
    if (!['all', 'lit', 'unlit'].includes(filter)) return;
    this.setData({ filter, walls: this.decorateWalls(this.data.walls, filter) });
  },

  onSwiperChange(e) {
    this.setData({ currentWall: Number(e.detail.current || 0) });
  },

  onDotTap(e) {
    this.setData({ currentWall: Number(e.currentTarget.dataset.index || 0) });
  },

  openDetail(e) {
    const ribbonId = Number(e.currentTarget.dataset.id);
    let selected = null;
    this.data.walls.some(wall => {
      selected = wall.ribbons.find(item => item.id === ribbonId) || null;
      return Boolean(selected);
    });
    if (!selected) return;
    this.setData({ selectedRibbon: { ...selected }, detailVisible: true });
  },

  closeDetail() {
    if (this.data.isSubmitting) return;
    this.setData({ detailVisible: false, selectedRibbon: null });
  },

  onDetailMaskTap() {
    this.closeDetail();
  },

  stopPropagation() {},

  onChangeOwned() {
    const ribbon = this.data.selectedRibbon;
    if (!ribbon || this.data.isSubmitting) return;
    const targetOwned = !ribbon.owned_status;
    wx.showModal({
      title: targetOwned ? '确认点亮这条飘带？' : '确认取消点亮？',
      content: targetOwned
        ? '请确认你已经拥有这条实体飘带。'
        : '取消后将恢复为未点亮状态，之后仍可再次点亮。',
      confirmText: targetOwned ? '确认点亮' : '确认取消',
      confirmColor: targetOwned ? '#2f91c8' : '#d46d6d',
      success: result => {
        if (result.confirm) this.saveOwnedStatus(ribbon, targetOwned);
      }
    });
  },

  async saveOwnedStatus(ribbon, ownedStatus) {
    this.setData({ isSubmitting: true });
    try {
      await put(
        `/api/ribbon-wall/ribbons/${ribbon.id}/owned`,
        { owned_status: ownedStatus },
        { silent: true }
      );
      const walls = this.data.walls.map(wall => ({
        ...wall,
        ribbons: wall.ribbons.map(item => item.id === ribbon.id
          ? { ...item, owned_status: ownedStatus }
          : item)
      }));
      const litCount = Math.max(0, this.data.litCount + (ownedStatus ? 1 : -1));
      const decoratedWalls = this.decorateWalls(walls);
      const wallIndex = decoratedWalls.findIndex(wall =>
        wall.ribbons.some(item => item.id === ribbon.id)
      );
      this.setData({
        walls: decoratedWalls,
        litCount,
        progressWidth: this.data.total ? Math.round(litCount / this.data.total * 100) : 0,
        progressHint: this.progressHint(litCount, this.data.total),
        detailVisible: false,
        selectedRibbon: null,
        isSubmitting: false,
        currentWall: wallIndex >= 0 ? wallIndex : this.data.currentWall,
        successRibbon: ownedStatus ? { ...ribbon, owned_status: true } : null,
        successVisible: ownedStatus
      });
      if (!ownedStatus) wx.showToast({ title: '已取消点亮', icon: 'success' });
    } catch (error) {
      console.error('保存飘带状态失败', error);
      this.setData({ isSubmitting: false });
      wx.showToast({ title: error.response?.msg || '保存失败，请重试', icon: 'none' });
    }
  },

  closeSuccess() {
    this.setData({ successVisible: false, successRibbon: null });
  },

  openWallAdmin(e) {
    if (!this.data.isAdmin) return;
    const wallId = Number(e.currentTarget.dataset.id || 0);
    wx.navigateTo({
      url: `/pages/ribbon-wall-admin/ribbon-wall-admin${wallId ? `?wallId=${wallId}` : ''}`
    });
  },

  onRibbonImageError(e) {
    const ribbonId = Number(e.currentTarget.dataset.id);
    const walls = this.data.walls.map(wall => ({
      ...wall,
      ribbons: wall.ribbons.map(item => item.id === ribbonId
        ? { ...item, image_failed: true }
        : item)
    }));
    const selectedRibbon = this.data.selectedRibbon?.id === ribbonId
      ? { ...this.data.selectedRibbon, image_failed: true }
      : this.data.selectedRibbon;
    this.setData({ walls, selectedRibbon });
  }
});
