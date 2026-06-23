Page({
  data: {
    activityId: null,
    creatorInfo: null,
    activityDetail: {
      name: '',
      time: '',
      location: '',
      difficulty: '',
      distance: 0,
      climb: 0,
      remainCount: 0,
      totalCount: 0,
      organizer: '',
      wechat: '',
      cover: '',
      groupQR: '',
      busQR: '',
      description: '',
      route: '',
      meetingPoints: [],
      deadline: '',
      status: '',
      travel: [],
      is_force_insurance: 0
    },
    agreeNotice: false,
    agreeBus: false,
    agreeSelf: false,
    canSignUp: false,
    showNotice: false,
    noticeType: 'participant',
    noticeTitle: '报名参与者须知',
    userInfo: null,
    isRegistered: false,
    showSuccessPopup: false
  },

  onLoad(options) {
    const { id } = options;
    if (id) {
      this.setData({ activityId: id });
      this.getActivityDetail(id);
    } else {
      wx.showToast({ title: '活动ID不存在', icon: 'error' });
    }

    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo });
    }
  },

  async getActivityDetail(activityId) {
    wx.showLoading({ title: '加载中...' });

    try {
      const userInfo = this.data.userInfo || wx.getStorageSync('userInfo');
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
        const activity = result.data.data;
        console.log(activity);
        this.formatActivityDetail(activity);
      } else {
        wx.showToast({ title: result.data?.msg || '获取详情失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('获取活动详情失败:', error);
      wx.showToast({ title: '网络错误', icon: 'error' });
    }
  },

  formatActivityDetail(activity) {
    const participantCount = activity.participant_count || 0;
    const remainCount = activity.max_participants - participantCount;

    const travelOptions = (activity.travel_options || []).map(item => {
      switch (item.travel_type) {
        case 1: return 'bus';
        case 2: return 'train';
        case 3: return 'self';
        default: return '';
      }
    }).filter(Boolean);

    const busTravel = (activity.travel_options || []).find(item => item.travel_type === 1);
    const busQR = busTravel ? busTravel.bus_qr_url : '';

    const selfTravel = (activity.travel_options || []).find(item => item.travel_type === 3);
    const selfQR = selfTravel ? selfTravel.bus_qr_url : '';

    const statusMap = {
      0: '待审核', 1: '报名中', 2: '审核拒绝',
      3: '进行中', 4: '已结束', 5: '已取消'
    };
    const difficultyMap = {
      1: '1星 简单', 2: '2星 轻松',
      3: '3星 中等', 4: '4星 困难', 5: '5星 挑战'
    };

    // 获取是否强制保险（后端返回字段名为 is_force_insurance）
    const isForceInsurance = activity.is_force_insurance !== undefined ? activity.is_force_insurance : 0;

    this.setData({
      'activityDetail.name': activity.name || '',
      'activityDetail.time': this.formatTime(activity.activity_time),
      'activityDetail.location': activity.location || '',
      'activityDetail.difficulty': difficultyMap[activity.difficulty] || '1星 简单',
      'activityDetail.distance': activity.distance || 0,
      'activityDetail.climb': activity.climb || 0,
      'activityDetail.remainCount': remainCount,
      'activityDetail.totalCount': activity.max_participants || 0,
      'activityDetail.organizer': activity.creator_name || '未知',
      'activityDetail.wechat': activity.wechat_id || '',
      'activityDetail.cover': activity.cover_url || '',
      'activityDetail.groupQR': activity.group_qr_url || '',
      'activityDetail.busQR': busQR,
      'activityDetail.selfQR': selfQR,
      'activityDetail.description': activity.description || '',
      'activityDetail.route': activity.routes || activity.route || '',
      'activityDetail.meetingPoints': activity.meeting_points || [],
      'activityDetail.deadline': this.formatDate(activity.deadline),
      'activityDetail.status': statusMap[activity.status] || '',
      'activityDetail.travel': travelOptions,
      'activityDetail.rawStatus': activity.status,
      'activityDetail.creatorAvatar': activity.creator_avatar || '',
      'activityDetail.is_force_insurance': isForceInsurance,   // 新增
    });

    // 获取当前用户是否已报名
    const isRegistered = activity.has_registered === true;
    this.setData({
      isRegistered: isRegistered,
      agreeNotice: isRegistered ? true : this.data.agreeNotice,
      agreeBus: isRegistered ? true : this.data.agreeBus,
      agreeSelf: isRegistered ? true : this.data.agreeSelf,
    }, () => {
      this.checkSignUpStatus();
    });
  },

  formatTime(timeStr) {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  },

  formatDate(timeStr) {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  previewQRCode(e) {
    const urls = [this.data.activityDetail.groupQR];
    if (this.data.activityDetail.busQR) {
      urls.push(this.data.activityDetail.busQR);
    }
    wx.previewImage({ urls, current: e.currentTarget.dataset.url });
  },

  checkSignUpStatus() {
    const { activityDetail, agreeNotice, agreeBus, agreeSelf } = this.data;
    const isActive = activityDetail.rawStatus === 1;
    const hasRemain = activityDetail.remainCount > 0;
    const now = new Date();
    const deadline = new Date(activityDetail.deadline);
    const notExpired = deadline > now;

    let agreed = agreeNotice;
    if (activityDetail.travel.includes('bus')) agreed = agreed && agreeBus;
    if (activityDetail.travel.includes('train') || activityDetail.travel.includes('self')) {
      agreed = agreed && agreeSelf;
    }
    const canSignUp = isActive && hasRemain && notExpired && agreed;
    this.setData({ canSignUp });
  },

  onAgreeNoticeChange(e) {
    this.setData({ agreeNotice: e.detail }, () => this.checkSignUpStatus());
  },
  onAgreeBusChange(e) {
    this.setData({ agreeBus: e.detail }, () => this.checkSignUpStatus());
  },
  onAgreeSelfChange(e) {
    this.setData({ agreeSelf: e.detail }, () => this.checkSignUpStatus());
  },

  onNoticeClick(e) {
    const { type } = e.currentTarget.dataset;
    let title = '';
    switch (type) {
      case 'participant': title = '报名参与者须知'; break;
      case 'bus': title = '大巴行程免责声明'; break;
      case 'self': title = '自驾/高铁行程免责声明'; break;
    }
    this.setData({ showNotice: true, noticeType: type, noticeTitle: title });
  },

  onNoticeClose() {
    this.setData({ showNotice: false });
  },

  onSignUpClick() {
    if (!this.data.canSignUp) {
      wx.showToast({ title: '当前不可报名', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认报名',
      content: '请确认已仔细阅读所有须知并同意相关条款',
      success: (res) => {
        if (res.confirm) this.signUpActivity();
      }
    });
  },

  onCancelSignUpClick() {
    wx.showModal({
      title: '确认取消报名',
      content: '取消后需重新报名，确定要取消吗？',
      success: (res) => {
        if (res.confirm) this.cancelParticipation();
      }
    });
  },

  async cancelParticipation() {
    wx.showLoading({ title: '取消中...' });
    try {
      const userInfo = this.data.userInfo || wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/cancel-participation",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "content-type": "application/json"
        },
        method: "POST",
        data: { activity_id: this.data.activityId }
      });
      wx.hideLoading();
      if (result.data && result.data.code === 200) {
        wx.showToast({
          title: '已取消报名',
          icon: 'success',
          duration: 1500,
          success: () => setTimeout(() => this.getActivityDetail(this.data.activityId), 1500)
        });
      } else {
        wx.showToast({ title: result.data?.msg || '取消失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'error' });
    }
  },

  async signUpActivity() {
    wx.showLoading({ title: '报名中...' });
    try {
      const userInfo = this.data.userInfo || wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/participate",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "content-type": "application/json"
        },
        method: "POST",
        data: {
          activity_id: this.data.activityId,
          nickname: userInfo?.nickName || '',
          phone: userInfo?.phoneNumber || '',
          wechat_id: userInfo?.wechatId || '',
          travel_option: null,
          remark: ''
        }
      });
      wx.hideLoading();
      if (result.data && result.data.code === 200) {
        this.setData({ showSuccessPopup: true, isRegistered: true });
      } else {
        wx.showToast({ title: result.data?.msg || '报名失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('报名失败:', error);
      wx.showToast({ title: '网络错误', icon: 'error' });
    }
  },

  onBackClick() {
    wx.navigateBack({ delta: 1 });
  },

  onSuccessPopupClose() {
    this.setData({ showSuccessPopup: false });
    this.getActivityDetail(this.data.activityId);
  },

  onPreviewGroupQR() {
    if (this.data.activityDetail.groupQR) {
      wx.previewImage({ urls: [this.data.activityDetail.groupQR] });
    }
  },

  onCopyWechat() {
    if (this.data.activityDetail.wechat) {
      wx.setClipboardData({
        data: this.data.activityDetail.wechat,
        success: () => wx.showToast({ title: '微信号已复制', icon: 'success' })
      });
    }
  },

  preventTouchMove() {},

  onShareAppMessage() {
    const { activityId, activityDetail } = this.data;
    const title = activityDetail.name || '步步出沪｜活动详情';
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    const path = `${currentPage.route}?id=${activityId}`;
    const imageUrl = activityDetail.cover || '';
    return { title, path, imageUrl };
  }
});