Page({
  data: {
    userList: [],
    isLoading: false,
    total: 0,
    page: 1,
    size: 20
  },

  onLoad() {
    this.loadBlacklist();
  },

  onShow() {
    this.loadBlacklist();
  },

  async loadBlacklist() {
    this.setData({ isLoading: true });
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/admin/blacklist",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "content-type": "application/json"
        },
        method: "GET",
        data: {
          page: this.data.page,
          size: this.data.size
        }
      });

      if (result.data && result.data.code === 200) {
        const { list = [], total = 0 } = result.data.data || {};
        // 格式化时间字段
        const userList = list.map(user => ({
          ...user,
          lastLoginTime: this.formatTime(user.lastLoginTime),
          createTime: this.formatTime(user.createTime),
          isUnblocking: false
        }));
        this.setData({ userList, total });
      } else {
        wx.showToast({ title: result.data?.msg || '加载失败', icon: 'none' });
      }
    } catch (error) {
      console.error('加载黑名单失败:', error);
      wx.showToast({ title: '网络错误', icon: 'error' });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  /** 解封用户 */
  async onUnblock(e) {
    const { openid } = e.currentTarget.dataset;
    const userInfo = wx.getStorageSync('userInfo');

    wx.showModal({
      title: '确认解封',
      content: '解封后该用户可重新答题验证并正常使用小程序，确定要继续吗？',
      success: async (res) => {
        if (!res.confirm) return;

        // 标记该用户解封进行中
        const list = this.data.userList.map(u => {
          if (u.openId === openid) return { ...u, isUnblocking: true };
          return u;
        });
        this.setData({ userList: list });

        try {
          const result = await wx.cloud.callContainer({
            config: { env: "prod-3gktwx67d1dd1e76" },
            path: "/api/admin/remove-blacklist",
            header: {
              "X-WX-SERVICE": "flask-mysql-login",
              "X-Wx-OpenId": userInfo?.openId,
              "content-type": "application/json"
            },
            method: "POST",
            data: { openid }
          });

          if (result.data && result.data.code === 200) {
            wx.showToast({ title: '已解封', icon: 'success' });
            // 重新加载列表
            this.loadBlacklist();
          } else {
            wx.showToast({ title: result.data?.msg || '操作失败', icon: 'none' });
            // 恢复状态
            const rollback = this.data.userList.map(u => {
              if (u.openId === openid) return { ...u, isUnblocking: false };
              return u;
            });
            this.setData({ userList: rollback });
          }
        } catch (error) {
          console.error('解封失败:', error);
          wx.showToast({ title: '网络错误', icon: 'error' });
          const rollback = this.data.userList.map(u => {
            if (u.openId === openid) return { ...u, isUnblocking: false };
            return u;
          });
          this.setData({ userList: rollback });
        }
      }
    });
  },

  /** 格式化时间: "2025-07-15T10:30:00" -> "2025-07-15 10:30" 或直接展示 */
  formatTime(raw) {
    if (!raw) return '-';
    try {
      const str = String(raw).replace('T', ' ').substring(0, 16);
      return str || '-';
    } catch (e) {
      return '-';
    }
  }
});
