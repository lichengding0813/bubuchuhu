const { get, post } = require('../../utils/api');

Page({
  data: {
    userList: [], candidateList: [], isLoading: false, isSearching: false,
    loadError: '', searchError: '',
    hasSearched: false, keyword: '', total: 0, page: 1, size: 20,
    addingOpenId: '', recordPopupVisible: false, recordUser: null,
    attemptRecords: [], recordsLoading: false, recordsError: ''
  },

  onShow() { this.loadBlacklist(); },

  formatTime(raw) {
    if (!raw) return '-';
    return String(raw).replace('T', ' ').substring(0, 16) || '-';
  },

  formatUser(user) {
    const openId = user.openId || '';
    const source = user.blacklistSource === 'manual' ? 'manual' : 'verification';
    return {
      ...user,
      displayOpenId: openId.length > 14 ? `${openId.slice(0, 7)}…${openId.slice(-5)}` : openId,
      lastLoginTime: this.formatTime(user.lastLoginTime),
      createTime: this.formatTime(user.createTime),
      blacklistedAt: this.formatTime(user.blacklistedAt),
      source,
      sourceLabel: source === 'manual' ? '管理员手动' : '答题错误超限',
      isUnblocking: false
    };
  },

  async loadBlacklist() {
    this.setData({ isLoading: true, loadError: '' });
    try {
      const result = await get('/api/admin/blacklist', {
        page: this.data.page, size: this.data.size
      }, { silent: true });
      const list = (result.data?.list || []).map(user => this.formatUser(user));
      this.setData({ userList: list, total: result.data?.total || list.length });
    } catch (error) {
      console.error('加载黑名单失败:', error);
      this.setData({ loadError: error.response?.msg || '黑名单加载失败' });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  onKeywordInput(e) { this.setData({ keyword: e.detail.value || '' }); },
  onClearSearch() { this.searchRequestId = (this.searchRequestId || 0) + 1;
    this.setData({ keyword: '', candidateList: [], hasSearched: false, isSearching: false, searchError: '' }); },

  async onSearch() {
    if (this.data.isSearching) return;
    const keyword = this.data.keyword.trim();
    if (!keyword) {
      wx.showToast({ title: '请输入昵称、微信号或用户标识', icon: 'none' });
      return;
    }
    const requestId = (this.searchRequestId || 0) + 1;
    this.searchRequestId = requestId;
    this.setData({ isSearching: true, hasSearched: true, searchError: '', candidateList: [] });
    try {
      const result = await get('/api/admin/blacklist-candidates', { keyword }, { silent: true });
      if (requestId !== this.searchRequestId) return;
      const candidateList = (result.data?.list || []).map(user => {
        const openId = user.openId || '';
        return { ...user, displayOpenId: openId.length > 14 ? `${openId.slice(0, 7)}…${openId.slice(-5)}` : openId };
      });
      this.setData({ candidateList });
    } catch (error) {
      if (requestId !== this.searchRequestId) return;
      this.setData({ searchError: '搜索失败' });
    } finally {
      if (requestId === this.searchRequestId) this.setData({ isSearching: false });
    }
  },

  onAddBlacklist(e) {
    if (this.data.addingOpenId) return;
    const { openid, nickname } = e.currentTarget.dataset;
    wx.showModal({
      title: '手动拉黑用户',
      content: `确定将“${nickname || '该用户'}”加入黑名单吗？加入后将无法继续使用小程序。`,
      confirmText: '确认拉黑', confirmColor: '#e26767',
      success: async (modalResult) => {
        if (!modalResult.confirm) return;
        if (this.data.addingOpenId) return;
        this.setData({ addingOpenId: openid });
        try {
          await post('/api/admin/blacklist', { openid }, { silent: true });
          this.setData({ candidateList: this.data.candidateList.filter(item => item.openId !== openid) });
          await this.loadBlacklist();
          wx.showToast({ title: '已加入黑名单', icon: 'success' });
        } catch (error) {
          console.error('手动拉黑失败:', error);
          wx.showToast({ title: error.response?.msg || '操作失败', icon: 'none' });
        } finally {
          this.setData({ addingOpenId: '' });
        }
      }
    });
  },

  onUnblock(e) {
    const { openid } = e.currentTarget.dataset;
    if (this.data.userList.some(user => user.openId === openid && user.isUnblocking)) return;
    wx.showModal({
      title: '确认解封',
      content: '解封后将重置答错次数，用户需要重新完成答题验证。确定继续吗？',
      confirmColor: '#4d9fd7',
      success: async (modalResult) => {
        if (!modalResult.confirm) return;
        if (this.data.userList.some(user => user.openId === openid && user.isUnblocking)) return;
        this.setData({ userList: this.data.userList.map(user => user.openId === openid ? { ...user, isUnblocking: true } : user) });
        try {
          await post('/api/admin/remove-blacklist', { openid }, { silent: true });
          await this.loadBlacklist();
          wx.showToast({ title: '已解封', icon: 'success' });
        } catch (error) {
          console.error('解封失败:', error);
          wx.showToast({ title: error.response?.msg || '操作失败', icon: 'none' });
          this.setData({ userList: this.data.userList.map(user => user.openId === openid ? { ...user, isUnblocking: false } : user) });
        }
      }
    });
  },

  async onViewAttempts(e) {
    const { openid, nickname } = e.currentTarget.dataset;
    const requestId = (this.recordsRequestId || 0) + 1;
    this.recordsRequestId = requestId;
    this.setData({
      recordPopupVisible: true,
      recordUser: { openId: openid, nickName: nickname || '匿名用户' },
      attemptRecords: [], recordsLoading: true, recordsError: ''
    });
    try {
      const result = await get('/api/admin/verification-attempts', { openid }, { silent: true });
      if (requestId !== this.recordsRequestId) return;
      const attemptRecords = (result.data?.list || []).map(record => ({
        ...record,
        createdAt: this.formatTime(record.created_at),
        isCorrect: Number(record.is_correct) === 1
      }));
      this.setData({ recordUser: result.data?.user || this.data.recordUser, attemptRecords });
    } catch (error) {
      console.error('加载答题记录失败:', error);
      if (requestId !== this.recordsRequestId) return;
      this.setData({ recordsError: '记录加载失败' });
    } finally {
      if (requestId === this.recordsRequestId) this.setData({ recordsLoading: false });
    }
  },

  retryRecords() {
    const user = this.data.recordUser || {};
    return this.onViewAttempts({ currentTarget: { dataset: { openid: user.openId, nickname: user.nickName } } });
  },
  closeRecordPopup() {
    this.recordsRequestId = (this.recordsRequestId || 0) + 1;
    this.setData({ recordPopupVisible: false, recordsLoading: false });
  },
  stopPropagation() {}
});
