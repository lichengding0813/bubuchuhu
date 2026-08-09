const { get, post } = require('../../utils/api');

Page({
  data: {
    accountList: [],
    candidateList: [],
    total: 0,
    keyword: '',
    isLoading: false,
    isSearching: false,
    hasSearched: false,
    addingOpenId: '',
    removingOpenId: ''
  },

  onShow() {
    this.loadAccounts();
  },

  async request(path, method = 'GET', data = {}) {
    const options = { silent: true };
    return method === 'GET'
      ? get(path, data, options)
      : post(path, data, options);
  },

  formatUser(user) {
    const openId = user.openId || '';
    return {
      ...user,
      displayOpenId: openId.length > 14 ? `${openId.slice(0, 7)}…${openId.slice(-5)}` : openId
    };
  },

  async loadAccounts() {
    this.setData({ isLoading: true });
    try {
      const result = await this.request('/api/admin/official-accounts');
      if (result.code === 200) {
        const list = (result.data?.list || []).map(item => this.formatUser(item));
        this.setData({ accountList: list, total: result.data?.total || list.length });
      } else {
        wx.showToast({ title: result.msg || '加载失败', icon: 'none' });
      }
    } catch (error) {
      console.error('加载官方账号失败', error);
      wx.showToast({ title: '网络错误', icon: 'error' });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value || '' });
  },

  onClearSearch() {
    this.setData({ keyword: '', candidateList: [], hasSearched: false });
  },

  async onSearch() {
    const keyword = this.data.keyword.trim();
    if (!keyword) {
      wx.showToast({ title: '请输入昵称、微信号或用户标识', icon: 'none' });
      return;
    }

    this.setData({ isSearching: true, hasSearched: true });
    try {
      const result = await this.request('/api/admin/official-account-candidates', 'GET', { keyword });
      if (result.code === 200) {
        const list = (result.data?.list || []).map(item => this.formatUser(item));
        this.setData({ candidateList: list });
      } else {
        wx.showToast({ title: result.msg || '搜索失败', icon: 'none' });
      }
    } catch (error) {
      console.error('搜索用户失败', error);
      wx.showToast({ title: '网络错误', icon: 'error' });
    } finally {
      this.setData({ isSearching: false });
    }
  },

  onAdd(e) {
    const { openid, nickname } = e.currentTarget.dataset;
    wx.showModal({
      title: '加入官方账号',
      content: `确定将“${nickname || '该用户'}”加入官方账号白名单吗？加入后可直接发布并共同管理官方活动。`,
      confirmText: '确认加入',
      confirmColor: '#2f80c5',
      success: async (modalResult) => {
        if (!modalResult.confirm) return;
        this.setData({ addingOpenId: openid });
        try {
          const result = await this.request('/api/admin/official-accounts', 'POST', { openid });
          if (result.code === 200) {
            this.updateCurrentUserOfficial(openid, 1);
            this.setData({ candidateList: this.data.candidateList.filter(item => item.openId !== openid) });
            await this.loadAccounts();
            wx.showToast({ title: '已加入官方账号', icon: 'success' });
          } else {
            wx.showToast({ title: result.msg || '添加失败', icon: 'none' });
          }
        } catch (error) {
          console.error('添加官方账号失败', error);
          wx.showToast({ title: '网络错误', icon: 'error' });
        } finally {
          this.setData({ addingOpenId: '' });
        }
      }
    });
  },

  onRemove(e) {
    const { openid, nickname } = e.currentTarget.dataset;
    wx.showModal({
      title: '移出官方账号',
      content: `确定将“${nickname || '该用户'}”移出白名单吗？移出后将失去官方活动管理权限，已发布的官方活动不受影响。`,
      confirmText: '确认移出',
      confirmColor: '#ee6666',
      success: async (modalResult) => {
        if (!modalResult.confirm) return;
        this.setData({ removingOpenId: openid });
        try {
          const result = await this.request('/api/admin/official-accounts/remove', 'POST', { openid });
          if (result.code === 200) {
            this.updateCurrentUserOfficial(openid, 0);
            await this.loadAccounts();
            wx.showToast({ title: '已移出白名单', icon: 'success' });
          } else {
            wx.showToast({ title: result.msg || '移除失败', icon: 'none' });
          }
        } catch (error) {
          console.error('移除官方账号失败', error);
          wx.showToast({ title: '网络错误', icon: 'error' });
        } finally {
          this.setData({ removingOpenId: '' });
        }
      }
    });
  },

  updateCurrentUserOfficial(openid, isOfficial) {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || userInfo.openId !== openid) return;
    const updated = { ...userInfo, isOfficial };
    wx.setStorageSync('userInfo', updated);
    getApp().globalData.userInfo = updated;
  }
});
