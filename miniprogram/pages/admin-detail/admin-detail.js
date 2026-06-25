Page({
  data: {
    activityId: null,
    activityDetail: {},
    travelOptions: [],
    meetingPoints: [],
    busQR: null,
    participantCount: 0,
    difficultyText: '',
    statusText: '',
    
    // 驳回弹窗
    showRejectDialog: false,
    rejectReason: ''
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ activityId: options.id });
      this.loadActivityDetail();
    }
  },

  // 加载活动详情
  async loadActivityDetail() {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const { activityId } = this.data;
      
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/detail",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "content-type": "application/json"
        },
        method: "GET",
        data: { id: activityId }
      });
      
      wx.hideLoading();
      
      if (result.data && result.data.code === 200) {
        const detail = result.data.data;
        
        // 处理出行方式（1=大巴, 2=高铁, 3=自驾）
        let travelOptions = [];
        let busQR = null;
        if (detail.travel_options && detail.travel_options.length > 0) {
          detail.travel_options.forEach(opt => {
            if (opt.travel_type === 1) {
              travelOptions.push('bus');
              busQR = opt.bus_qr_url;
            } else if (opt.travel_type === 2) {
              travelOptions.push('train');
            } else if (opt.travel_type === 3) {
              travelOptions.push('self');
            }
          });
        }
        
        // 处理集合点
        const meetingPoints = detail.meeting_points || [];
        
        // 格式化时间
        const deadlineFormatted = this.formatDateTime(detail.deadline);
        const activityTimeFormatted = this.formatActivityTime(detail.activity_time);
        
        this.setData({
          activityDetail: {
            ...detail,
            deadline_formatted: deadlineFormatted,
            activity_time_formatted: activityTimeFormatted
          },
          travelOptions: travelOptions,
          meetingPoints: meetingPoints,
          busQR: busQR,
          participantCount: detail.participant_count || 0,
          difficultyText: this.getDifficultyText(detail.difficulty),
          statusText: this.getStatusText(detail.status)
        });
      } else {
        wx.showToast({ title: result.data?.msg || '加载失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('加载活动详情失败:', error);
      wx.showToast({ title: '加载失败', icon: 'error' });
    }
  },

  // 安全解析时间字符串（兼容 callContainer 的二次转换）
  parseTimeStr(timeStr) {
    if (!timeStr) return null;
    if (timeStr instanceof Date) {
      return {
        year: timeStr.getUTCFullYear(),
        month: timeStr.getUTCMonth() + 1,
        day: timeStr.getUTCDate(),
        hour: timeStr.getUTCHours(),
        minute: timeStr.getUTCMinutes(),
        second: timeStr.getUTCSeconds()
      };
    }
    const str = String(timeStr).replace('T', ' ');
    const parts = str.split(/[- :]/);
    if (parts.length >= 5 && !isNaN(parseInt(parts[0]))) {
      return {
        year: parseInt(parts[0]),
        month: parseInt(parts[1]),
        day: parseInt(parts[2]),
        hour: parseInt(parts[3]),
        minute: parseInt(parts[4]),
        second: parts.length >= 6 ? parseInt(parts[5]) : 0
      };
    }
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
        second: d.getUTCSeconds()
      };
    }
    return null;
  },

  // 通过审核
  onApproveClick() {
    wx.showModal({
      title: '确认通过',
      content: '确定要通过该活动吗？',
      confirmText: '确认通过',
      confirmColor: '#1e4d7c',
      success: (res) => {
        if (res.confirm) {
          this.reviewActivity('approve');
        }
      }
    });
  },

  // 驳回 - 显示弹窗
  onRejectClick() {
    this.setData({
      showRejectDialog: true,
      rejectReason: ''
    });
  },

  // 驳回原因输入
  onRejectReasonInput(e) {
    this.setData({ rejectReason: e.detail.value });
  },

  // 取消驳回
  cancelReject() {
    this.setData({
      showRejectDialog: false,
      rejectReason: ''
    });
  },

  // 确认驳回
  async confirmReject() {
    const { activityId, rejectReason } = this.data;
    
    wx.showLoading({ title: '处理中...' });
    
    const userInfo = wx.getStorageSync('userInfo');
    
    try {
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/admin/review-activity",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "content-type": "application/json"
        },
        method: "POST",
        data: {
          activity_id: parseInt(activityId),
          action: 'reject',
          reject_reason: rejectReason
        }
      });

      wx.hideLoading();

      if (result.data && result.data.code === 200) {
        wx.showToast({ title: '已驳回', icon: 'success' });
        this.setData({
          showRejectDialog: false,
          rejectReason: ''
        });
        // 返回上一页并刷新
        const pages = getCurrentPages();
        const prevPage = pages[pages.length - 2];
        if (prevPage && prevPage.loadActivities) {
          prevPage.loadActivities(true);
          prevPage.loadTotalCount();
        }
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: result.data?.msg || '操作失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('驳回失败:', error);
      wx.showToast({ title: '操作失败', icon: 'error' });
    }
  },

  // 审核活动
  async reviewActivity(action) {
    wx.showLoading({ title: '处理中...' });

    const userInfo = wx.getStorageSync('userInfo');
    const { activityId } = this.data;

    try {
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/admin/review-activity",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "content-type": "application/json"
        },
        method: "POST",
        data: {
          activity_id: parseInt(activityId),
          action: action,
          reject_reason: ''
        }
      });

      wx.hideLoading();

      if (result.data && result.data.code === 200) {
        wx.showToast({ title: action === 'approve' ? '已通过' : '已驳回', icon: 'success' });
        // 返回上一页并刷新
        const pages = getCurrentPages();
        const prevPage = pages[pages.length - 2];
        if (prevPage && prevPage.loadActivities) {
          prevPage.loadActivities(true);
          prevPage.loadTotalCount();
        }
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: result.data?.msg || '操作失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('审核失败:', error);
      wx.showToast({ title: '操作失败', icon: 'error' });
    }
  },

  // 返回
  onBackClick() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.switchTab({ url: '/pages/home/home' });
    }
  },

  preventTouchMove() {
    return;
  },

  // ========== 工具函数 ==========
  formatActivityTime(timeStr) {
    const t = this.parseTimeStr(timeStr);
    if (!t) return '';
    const month = String(t.month).padStart(2, '0');
    const day = String(t.day).padStart(2, '0');
    const hour = String(t.hour).padStart(2, '0');
    const minute = String(t.minute).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  },

  formatDateTime(timeStr) {
    const t = this.parseTimeStr(timeStr);
    if (!t) return '';
    const year = t.year;
    const month = String(t.month).padStart(2, '0');
    const day = String(t.day).padStart(2, '0');
    const hour = String(t.hour).padStart(2, '0');
    const minute = String(t.minute).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  getDifficultyText(level) {
    const map = {
      1: '1⭐ 简单',
      2: '2⭐ 轻松',
      3: '3⭐ 中等',
      4: '4⭐ 困难',
      5: '5⭐ 挑战'
    };
    return map[level] || '1⭐ 简单';
  },

  getStatusText(status) {
    const map = {
      0: '待审核',
      1: '报名中',
      2: '已驳回',
      3: '进行中',
      4: '已结束',
      5: '已取消'
    };
    return map[status] || '未知';
  }
});
