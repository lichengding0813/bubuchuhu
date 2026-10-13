const { post } = require('../../utils/api');

Page({
  data: {
    pendingCount: 0,
    draftCount: 0,
    approvedCount: 0,
    currentTab: 'approved',
    activityList: [],
    draftList: [],
    isLoading: false,
    loadError: '',
    draftLoading: false,
    draftError: '',
    cancellingActivityId: null
  },

  onShow() {
    this.loadData();
    this.loadDrafts();
  },

  onRetry() { return this.data.currentTab === 'draft' ? this.loadDrafts() : this.loadData(); },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;
    this.setData({ currentTab: tab });
    if (tab === 'draft') {
      this.loadDrafts();
    } else {
      this.loadData();
    }
  },

  async loadData() {
    if (this.data.isLoading) return;
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo?.openId) {
      this.setData({ loadError: '请先登录' });
      return;
    }

    this.setData({ isLoading: true, loadError: '' });

    try {
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/my-activities-with-audit",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo.openId,
          "content-type": "application/json"
        },
        method: "GET"
      });

      if (result.data && result.data.code === 200) {
        const activities = result.data.data || [];
        const formatted = activities.map(item => ({
          ...item,
          activity_time_formatted: this.formatDateTime(item.activity_time),
          status: Number(item.status),
          participant_count: item.participant_count || 0,
          is_force_insurance: Number(item.is_force_insurance) === 1 ? 1 : 0
        }));

        const pendingList = formatted.filter(item => item.status === 0);
        const approvedList = formatted.filter(item => item.status !== 0 && item.status !== -1);
        const totalCount = formatted.length;

        let displayList = [];
        if (this.data.currentTab === 'pending') {
          displayList = pendingList;
        } else {
          displayList = approvedList;
        }

        this.setData({
          pendingCount: pendingList.length,
          approvedCount: approvedList.length,
          activityList: displayList
        });
      } else {
        this.setData({ loadError: result.data?.msg || '活动加载失败' });
      }
    } catch (error) {
      console.error('加载活动失败:', error);
      this.setData({ loadError: '活动加载失败' });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  async loadDrafts() {
    if (this.data.draftLoading) return;
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo?.openId) { this.setData({ draftError: '请先登录' }); return; }
    this.setData({ draftLoading: true, draftError: '' });

    try {
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/my-drafts",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo.openId,
          "content-type": "application/json"
        },
        method: "GET"
      });

      if (result.data && result.data.code === 200) {
        const drafts = result.data.data || [];
        const formattedDrafts = drafts.map(item => ({
          ...item,
          activity_time_formatted: this.formatDateTime(item.activity_time),
          updated_at_formatted: this.formatDateTime(item.updated_at),
          is_force_insurance: Number(item.is_force_insurance) === 1 ? 1 : 0
        }));
        this.setData({
          draftList: formattedDrafts,
          draftCount: formattedDrafts.length
        });
      } else {
        this.setData({ draftError: result.data?.msg || '草稿加载失败' });
      }
    } catch (error) {
      console.error('加载草稿失败:', error);
      this.setData({ draftError: '草稿加载失败' });
    } finally { this.setData({ draftLoading: false }); }
  },

  formatDateTime(timeStr) {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    if (isNaN(date.getTime())) return '';
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  },

  // 查看详情
  onActivityClick(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/details/details?id=${id}`
    });
  },

  // 撤回待审核活动
  onWithdraw(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认撤回',
      content: '撤回后活动将存入草稿箱，您可以稍后修改并重新提交审核',
      confirmText: '确认撤回',
      cancelText: '取消',
      confirmColor: '#ff9800',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '撤回中...' });
        try {
          const userInfo = wx.getStorageSync('userInfo');
          const result = await wx.cloud.callContainer({
            config: { env: "prod-3gktwx67d1dd1e76" },
            path: "/api/activity/withdraw",
            method: "POST",
            header: {
              "X-WX-SERVICE": "flask-mysql-login",
              "X-Wx-OpenId": userInfo?.openId,
              "Content-Type": "application/json"
            },
            data: { activity_id: id }
          });
          wx.hideLoading();
          if (result.data && result.data.code === 200) {
            wx.showToast({ title: '已撤回至草稿箱', icon: 'success' });
            this.loadData();
          } else {
            wx.showToast({ title: result.data?.msg || '撤回失败', icon: 'none' });
          }
        } catch (err) {
          wx.hideLoading();
          console.error('撤回失败', err);
          wx.showToast({ title: '网络错误', icon: 'error' });
        }
      }
    });
  },

  // 编辑活动（驳回后修改 或 审核通过后修改）
  onEditActivity(e) {
    const id = e.currentTarget.dataset.id;
    const activity = this.data.activityList.find(item => item.id === id);
    if (activity?.status === 5) return;
    if (activity && activity.status === 2) {
      wx.navigateTo({
        url: `/pages/publish/publish?edit=rejected&id=${id}`
      });
    } else {
      wx.navigateTo({
        url: `/pages/publish/publish?edit=1&id=${id}`
      });
    }
  },

  // 编辑草稿
  onEditDraft(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/publish/publish?draft=1&id=${id}`
    });
  },

  // 删除草稿
  onDeleteDraft(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这个草稿吗？',
      confirmColor: '#ff6b6b',
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '删除中...' });
        try {
          const userInfo = wx.getStorageSync('userInfo');
          const result = await wx.cloud.callContainer({
            config: { env: "prod-3gktwx67d1dd1e76" },
            path: "/api/activity/delete-draft",
            method: "POST",
            header: {
              "X-WX-SERVICE": "flask-mysql-login",
              "X-Wx-OpenId": userInfo?.openId,
              "Content-Type": "application/json"
            },
            data: { draft_id: id }
          });
          wx.hideLoading();

          if (result.data && result.data.code === 200) {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadDrafts();
          } else {
            wx.showToast({ title: result.data?.msg || '删除失败', icon: 'none' });
          }
        } catch (err) {
          wx.hideLoading();
          console.error('删除草稿失败', err);
          wx.showToast({ title: '网络错误', icon: 'error' });
        }
      }
    });
  },

  onCancelActivity(e) {
    const id = e.currentTarget.dataset.id;
    const activity = this.data.activityList.find(item => String(item.id) === String(id));
    if (this.data.cancellingActivityId !== null || !activity || ![1, 3].includes(activity.status)) return;
    this.setData({ cancellingActivityId: id });
    wx.showModal({
      title: '确认取消活动',
      content: '取消后无法恢复，活动将停止报名和抽奖，不再计入成就。',
      confirmText: '取消活动',
      cancelText: '保留活动',
      confirmColor: '#d95f5f',
      success: async ({ confirm }) => {
        if (!confirm) { this.setData({ cancellingActivityId: null }); return; }
        try {
          await post('/api/activity/cancel', { activity_id: id }, { silent: true, showLoading: true, loadingTitle: '取消中' });
          wx.showToast({ title: '活动已取消', icon: 'success' });
          await this.loadData();
        } catch (error) {
          wx.showToast({ title: error.response?.msg || '取消失败，请重试', icon: 'none' });
        } finally {
          this.setData({ cancellingActivityId: null });
        }
      },
      fail: () => this.setData({ cancellingActivityId: null })
    });
  },

  // 查看报名人员列表
  onViewParticipants(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/activity-participants/activity-participants?activity_id=${id}`
    });
  }
});
