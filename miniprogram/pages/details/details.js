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
    showSuccessPopup: false,
    // 协议强制阅读相关
    noticeViewed: { participant: false, bus: false, self: false },
    canCloseNotice: true,
    noticeCountdown: 0,
    pendingAgreeField: ''
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
    } else {
      // 通过分享链接进入时可能未登录，主动触发登录以确保 userInfo 可用
      this.loginIfNeeded();
    }
  },

  onShow() {
    // 从设置页返回后刷新本地 userInfo
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo });
    }
  },

  // 分享进入时确保用户已登录，否则报名时 nickname 为空
  async loginIfNeeded() {
    try {
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({ success: resolve, fail: reject });
      });
      if (!loginRes.code) return;

      wx.cloud.init();
      const result = await wx.cloud.callContainer({
        config: { env: 'prod-3gktwx67d1dd1e76' },
        path: '/login',
        header: {
          'X-WX-SERVICE': 'flask-mysql-login',
          'content-type': 'application/json'
        },
        method: 'POST',
        data: { code: loginRes.code }
      });

      if (result.data && result.data.code === 200) {
        const userData = result.data.data;
        if (result.data.verifyQuestion) {
          userData.verifyQuestion = result.data.verifyQuestion;
          userData.verifyQuestionIdx = result.data.verifyQuestionIdx;
        }
        getApp().globalData.userInfo = userData;
        wx.setStorageSync('userInfo', userData);
        this.setData({ userInfo: userData });
      }
    } catch (error) {
      console.error('details页自动登录失败:', error);
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
      1: '1⭐', 2: '2⭐',
      3: '3⭐', 4: '4⭐', 5: '5⭐'
    };

    // 获取是否强制保险（后端返回字段名为 is_force_insurance）
    const isForceInsurance = activity.is_force_insurance !== undefined ? activity.is_force_insurance : 0;

    this.setData({
      'activityDetail.name': activity.name || '',
      'activityDetail.time': this.formatTime(activity.activity_time),
      'activityDetail.location': activity.location || '',
      'activityDetail.difficulty': (activity.difficulty || 1) + '⭐',
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
    const parts = timeStr.replace('T', ' ').split(/[- :]/);
    if (parts.length < 5) return timeStr;
    const month = String(parseInt(parts[1])).padStart(2, '0');
    const day = String(parseInt(parts[2])).padStart(2, '0');
    const hour = String(parseInt(parts[3])).padStart(2, '0');
    const minute = String(parseInt(parts[4])).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  },

  formatDate(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.replace('T', ' ').split(/[- :]/);
    if (parts.length < 5) return timeStr;
    const year = parts[0];
    const month = String(parseInt(parts[1])).padStart(2, '0');
    const day = String(parseInt(parts[2])).padStart(2, '0');
    const hour = String(parseInt(parts[3])).padStart(2, '0');
    const minute = String(parseInt(parts[4])).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  previewQRCode(e) {
    const urls = [this.data.activityDetail.groupQR];
    wx.previewImage({ urls, current: e.currentTarget.dataset.url });
  },

  checkSignUpStatus() {
    const { activityDetail, agreeNotice, agreeBus, agreeSelf } = this.data;
    // 后端允许 status=1(报名中) 或 status=3(进行中) 报名
    const isActive = activityDetail.rawStatus === 1 || activityDetail.rawStatus === 3;
    const hasRemain = activityDetail.remainCount > 0;

    // 截止时间对比：手动解析字符串构建本地时间，避免new Date时区偏差
    let notExpired = true;
    const deadlineStr = activityDetail.deadline;
    if (deadlineStr) {
      const parts = deadlineStr.replace('T', ' ').split(/[- :\/]/);
      if (parts.length >= 5) {
        const deadlineDate = new Date(
          parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]),
          parseInt(parts[3]), parseInt(parts[4])
        );
        notExpired = deadlineDate > new Date();
      }
    }

    let agreed = agreeNotice;
    if (activityDetail.travel.includes('bus')) agreed = agreed && agreeBus;
    if (activityDetail.travel.includes('train') || activityDetail.travel.includes('self')) {
      agreed = agreed && agreeSelf;
    }
    const canSignUp = isActive && hasRemain && notExpired && agreed;
    this.setData({ canSignUp });
  },

  onAgreeNoticeChange(e) {
    const checked = e.detail;
    if (checked && !this.data.noticeViewed.participant) {
      this.openNoticeForAgree('participant', '报名参与者须知', 'agreeNotice');
      return;
    }
    this.setData({ agreeNotice: checked }, () => this.checkSignUpStatus());
  },
  onAgreeBusChange(e) {
    const checked = e.detail;
    if (checked && !this.data.noticeViewed.bus) {
      this.openNoticeForAgree('bus', '大巴行程免责声明', 'agreeBus');
      return;
    }
    this.setData({ agreeBus: checked }, () => this.checkSignUpStatus());
  },
  onAgreeSelfChange(e) {
    const checked = e.detail;
    if (checked && !this.data.noticeViewed.self) {
      this.openNoticeForAgree('self', '自驾/高铁行程免责声明', 'agreeSelf');
      return;
    }
    this.setData({ agreeSelf: checked }, () => this.checkSignUpStatus());
  },

  // 勾选协议时强制弹出须知并开始倒计时
  openNoticeForAgree(type, title, agreeField) {
    this.setData({
      showNotice: true,
      noticeType: type,
      noticeTitle: title,
      canCloseNotice: false,
      noticeCountdown: 3,
      pendingAgreeField: agreeField,
      [agreeField]: false
    });
    this.startNoticeCountdown(type, true);
  },

  onNoticeClick(e) {
    const { type } = e.currentTarget.dataset;
    let title = '';
    switch (type) {
      case 'participant': title = '报名参与者须知'; break;
      case 'bus': title = '大巴行程免责声明'; break;
      case 'self': title = '自驾/高铁行程免责声明'; break;
    }
    this.setData({
      showNotice: true,
      noticeType: type,
      noticeTitle: title,
      pendingAgreeField: ''
    });
    // 如果还未阅读过，开始倒计时
    if (!this.data.noticeViewed[type]) {
      this.setData({ canCloseNotice: false, noticeCountdown: 3 });
      this.startNoticeCountdown(type, false);
    }
  },

  // 开始3秒倒计时
  startNoticeCountdown(type, autoCheck) {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    let count = 3;
    this.countdownTimer = setInterval(() => {
      count--;
      if (count > 0) {
        this.setData({ noticeCountdown: count });
      } else {
        clearInterval(this.countdownTimer);
        // 3秒到了：解锁关闭按钮，标记已阅读，但不自动关闭
        this.setData({
          canCloseNotice: true,
          noticeCountdown: 0,
          ['noticeViewed.' + type]: true
        });
      }
    }, 1000);
  },

  onNoticeClose() {
    if (!this.data.canCloseNotice) {
      wx.showToast({ title: `请等待${this.data.noticeCountdown}秒后再关闭`, icon: 'none' });
      return;
    }
    // 用户手动关闭弹窗后，如果有待勾选的协议，自动勾选
    const updateData = { showNotice: false };
    if (this.data.pendingAgreeField) {
      updateData[this.data.pendingAgreeField] = true;
      updateData.pendingAgreeField = '';
    }
    this.setData(updateData, () => this.checkSignUpStatus());
  },

  onSignUpClick() {
    // 校验用户资料完整性：手机号或微信号至少填一项（优先检查，先于canSignUp）
    const userInfo = this.data.userInfo || wx.getStorageSync('userInfo');
    if (!userInfo.phoneNumber && !userInfo.wechatId) {
      wx.showModal({
        title: '资料不完整',
        content: '请先在设置中填写手机号或微信号，以便活动发起者能联系到您',
        confirmText: '去设置',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/settings/settings' });
          }
        }
      });
      return;
    }
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
        this.setData({
          isRegistered: false,
          agreeNotice: false,
          agreeBus: false,
          agreeSelf: false
        });
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
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      // 分享进入时页面栈只有当前页，无法navigateBack，回到首页
      wx.switchTab({ url: '/pages/home/home' });
    }
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

  onUnload() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  },

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