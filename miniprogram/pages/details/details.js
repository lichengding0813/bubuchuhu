const { get, post } = require('../../utils/api');
const { subscribeUserReminders } = require('../../utils/notifications');

Page({
  data: {
    activityId: null,
    weather: {},
    weatherLoading: false,
    weatherMessage: '',
    hasLottery: false,
    lotteryInfo: {},
    lotteryCountdown: '',
    lotteryCountdownLabel: '距结束',
    lotteryActionText: '点击参与抽奖',
    showLotteryPopup: false,
    lotteryDrawn: false,
    creatorInfo: null,
    activityDetail: {
      name: '',
      time: '',
      endTime: '',
      location: '',
      latitude: null,
      longitude: null,
      difficulty: '',
      distance: 0,
      climb: 0,
      remainCount: 0,
      totalCount: 0,
      participantCount: 0,
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
      is_force_insurance: 0,
      isOfficial: false,
      registrationClosed: false,
      activityStarted: false,
      activityEnded: false
    },
    agreeNotice: false,
    agreeBus: false,
    agreeSelf: false,
    canSignUp: false,
    userInfo: null,
    isRegistered: false,
    showSuccessPopup: false,
    // 协议强制阅读相关
    noticeViewed: { participant: false, bus: false, self: false },
    companionCount: 0,
    maxCompanion: 3,
    registeredCompanionCount: 0,
    bottomExpanded: false
  },

  toggleBottom() {
    this.setData({ bottomExpanded: !this.data.bottomExpanded });
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
    if (this.data.hasLottery && !this.data.lotteryDrawn) {
      this.startLotteryCountdown();
    }
  },

  onHide() {
    this.stopLotteryCountdown();
  },

  // 分享进入时确保用户已登录，否则报名时 nickname 为空
  async loginIfNeeded() {
    try {
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({ success: resolve, fail: reject });
      });
      if (!loginRes.code) return;

      const result = await post('/login', { code: loginRes.code }, { silent: true });

      if (result.code === 200) {
        const userData = result.data;
        if (result.verifyQuestion) {
          userData.verifyQuestion = result.verifyQuestion;
          userData.verifyQuestionIdx = result.verifyQuestionIdx;
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
      const result = await get('/api/activity/detail', { id: activityId }, { silent: true });

      wx.hideLoading();

      if (result.code === 200) {
        const activity = result.data;
        this.formatActivityDetail(activity);
      }
    } catch (error) {
      wx.hideLoading();
      console.error('获取活动详情失败:', error);
      wx.showToast({ title: error.response?.msg || '网络错误', icon: 'none' });
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
    const meetingPoints = (activity.meeting_points || []).map((point, index) => ({
      ...point,
      _key: point.id || `${point.meeting_time || point.time || ''}_${point.location || ''}_${index}`
    }));

    const statusMap = {
      0: '待审核', 1: '报名中', 2: '审核拒绝',
      3: '进行中', 4: '已结束', 5: '已取消'
    };
    const difficultyMap = {
      1: '1⭐', 2: '2⭐',
      3: '3⭐', 4: '4⭐', 5: '5⭐'
    };

    // 获取是否强制保险（后端返回字段名为 is_force_insurance）
    const isForceInsurance = Number(activity.is_force_insurance) === 1 ? 1 : 0;
    const now = Date.now();
    const toTimestamp = value => {
      const parsed = this.parseTimeStr(value);
      return parsed
        ? new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, parsed.second || 0).getTime()
        : 0;
    };
    const deadlineTimestamp = toTimestamp(activity.deadline);
    const startTimestamp = toTimestamp(activity.activity_time);
    const endTimestamp = toTimestamp(activity.end_time);
    const activityEnded = Number(activity.status) === 4 || (endTimestamp > 0 && now >= endTimestamp);
    const activityStarted = activityEnded || Number(activity.status) === 3 || (startTimestamp > 0 && now >= startTimestamp);
    const registrationClosed = activityEnded || Boolean(activity.registration_closed) || (deadlineTimestamp > 0 && now >= deadlineTimestamp);
    const displayStatus = activityEnded
      ? '已结束'
      : registrationClosed && Number(activity.status) === 1
        ? '报名已截止'
        : statusMap[activity.status] || '';

    this.setData({
      'activityDetail.name': activity.name || '',
      'activityDetail.time': this.formatTime(activity.activity_time),
      'activityDetail.endTime': this.formatTime(activity.end_time),
      'activityDetail.location': activity.location || '',
      'activityDetail.latitude': activity.latitude ?? null,
      'activityDetail.longitude': activity.longitude ?? null,
      'activityDetail.difficulty': (activity.difficulty || 1) + '⭐',
      'activityDetail.distance': activity.distance || 0,
      'activityDetail.climb': activity.climb || 0,
      'activityDetail.remainCount': remainCount,
      'activityDetail.totalCount': activity.max_participants || 0,
      'activityDetail.participantCount': participantCount,
      'activityDetail.organizer': activity.creator_name || '未知',
      'activityDetail.wechat': activity.wechat_id || '',
      'activityDetail.cover': activity.cover_url || '',
      'activityDetail.groupQR': activity.group_qr_url || '',
      'activityDetail.busQR': busQR,
      'activityDetail.selfQR': selfQR,
      'activityDetail.description': activity.description || '',
      'activityDetail.route': activity.routes || activity.route || '',
      'activityDetail.meetingPoints': meetingPoints,
      'activityDetail.deadline': this.formatDate(activity.deadline),
      'activityDetail.status': displayStatus,
      'activityDetail.travel': travelOptions,
      'activityDetail.rawStatus': activity.status,
      'activityDetail.creatorAvatar': activity.creator_avatar || '',
      'activityDetail.is_force_insurance': isForceInsurance,   // 新增
      'activityDetail.isOfficial': Number(activity.is_official) === 1,
      'activityDetail.registrationClosed': registrationClosed,
      'activityDetail.activityStarted': activityStarted,
      'activityDetail.activityEnded': activityEnded,
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
    this.loadWeather(activity.location, activity.latitude, activity.longitude);
    this.checkActivityLottery(activity.id || this.data.activityId);
  },

  async checkActivityLottery(activityId) {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      if (!userInfo?.openId) return;
      const result = await get('/api/lottery/activity-status', { activity_id: activityId }, { silent: true });
      const lottery = result.data;
      if (lottery && lottery.eligible && lottery.phase !== 'ended') {
        const notStarted = lottery.phase === 'not_started';
        this.setData({
          hasLottery: true,
          lotteryInfo: lottery,
          lotteryDrawn: !lottery.can_draw,
          lotteryCountdownLabel: notStarted ? '距开始' : '距结束',
          lotteryActionText: notStarted
            ? '抽奖尚未开始'
            : lottery.can_draw
              ? `参与抽奖 · 剩${lottery.chances_remaining}次`
              : '机会已用完'
        }, () => this.startLotteryCountdown());
        return;
      }
      this.stopLotteryCountdown();
      this.setData({ hasLottery: false, lotteryInfo: {}, lotteryCountdown: '', lotteryDrawn: false });
    } catch (err) {
      console.log('抽奖检查失败（可忽略）:', err);
    }
  },

  onLotteryClick() {
    const lottery = this.data.lotteryInfo;
    if (lottery.phase === 'not_started') {
      wx.showToast({ title: '抽奖还未开始', icon: 'none' });
      return;
    }
    if (!lottery.can_draw) {
      this.setData({ showLotteryPopup: true });
      return;
    }
    this.setData({ showLotteryPopup: true });
  },

  onLotteryClose() {
    this.setData({ showLotteryPopup: false });
  },

  onLotteryDrawn(e) {
    const result = e.detail || {};
    const lotteryInfo = {
      ...this.data.lotteryInfo,
      chances_remaining: Number(result.chances_remaining || 0),
      chances_used: Number(this.data.lotteryInfo.chances_used || 0) + 1,
      my_prize_count: Number(this.data.lotteryInfo.my_prize_count || 0) + (result.prize_id ? 1 : 0),
      can_draw: Number(result.chances_remaining || 0) > 0
    };
    this.setData({
      lotteryInfo,
      lotteryDrawn: !lotteryInfo.can_draw,
      lotteryActionText: lotteryInfo.can_draw
        ? `参与抽奖 · 剩${lotteryInfo.chances_remaining}次`
        : '机会已用完'
    });
  },

  getLotteryEndTimestamp(value) {
    const time = this.parseTimeStr(value);
    if (!time) return 0;
    return new Date(
      time.year,
      time.month - 1,
      time.day,
      time.hour,
      time.minute,
      time.second || 0
    ).getTime();
  },

  startLotteryCountdown() {
    this.stopLotteryCountdown();
    if (!this.data.hasLottery) return;
    this.updateLotteryCountdown();
    if (this.data.hasLottery) {
      this.lotteryCountdownTimer = setInterval(() => this.updateLotteryCountdown(), 1000);
    }
  },

  stopLotteryCountdown() {
    if (this.lotteryCountdownTimer) {
      clearInterval(this.lotteryCountdownTimer);
      this.lotteryCountdownTimer = null;
    }
  },

  updateLotteryCountdown() {
    const lottery = this.data.lotteryInfo;
    const targetValue = lottery.phase === 'not_started' ? lottery.start_time : lottery.end_time;
    const targetTimestamp = this.getLotteryEndTimestamp(targetValue);
    const remaining = targetTimestamp - Date.now();
    if (!targetTimestamp || remaining <= 0) {
      this.stopLotteryCountdown();
      this.checkActivityLottery(this.data.activityId);
      return;
    }
    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = value => String(value).padStart(2, '0');
    const countdown = days > 0
      ? `${days}天 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    this.setData({ lotteryCountdown: countdown });
  },

  async loadWeather(city, latitude, longitude) {
    this.setData({ weatherLoading: true, weatherMessage: '', weather: {} });
    try {
      const result = await get('/api/weather', { city, latitude, longitude }, { silent: true });
      const daily = result.data?.daily || [];
      if (result.code === 200 && daily.length > 0) {
        this.setData({ weather: result.data, weatherMessage: '' });
      } else {
        this.setData({ weather: {}, weatherMessage: '暂无天气预报' });
      }
    } catch (err) {
      console.log('天气加载失败（可忽略）:', err);
      this.setData({ weather: {}, weatherMessage: err.response?.msg || '天气暂时无法获取' });
    } finally {
      this.setData({ weatherLoading: false });
    }
  },

  openActivityLocation() {
    const { latitude, longitude, location } = this.data.activityDetail;
    if (latitude == null || longitude == null) return;
    wx.openLocation({ latitude: Number(latitude), longitude: Number(longitude), name: location });
  },

  openMeetingLocation(e) {
    const point = this.data.activityDetail.meetingPoints[e.currentTarget.dataset.index];
    if (!point || point.latitude == null || point.longitude == null) return;
    wx.openLocation({
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      name: point.location || '集合点'
    });
  },

  // 安全解析时间字符串
  // wx.cloud.callContainer 会把 "YYYY-MM-DD HH:MM:SS" 当作 UTC 转成 Date 对象
  // 所以需要用 UTC getter 取回原始值（即后端的北京时间）
  parseTimeStr(timeStr) {
    if (!timeStr) return null;
    // 如果已经是 Date 对象，直接取 UTC 组件
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
    // 尝试 YYYY-MM-DD HH:MM:SS 格式
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
    // 兜底：Date 解析后取 UTC 组件
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

  formatTime(timeStr) {
    const t = this.parseTimeStr(timeStr);
    if (!t) return timeStr || '';
    const month = String(t.month).padStart(2, '0');
    const day = String(t.day).padStart(2, '0');
    const hour = String(t.hour).padStart(2, '0');
    const minute = String(t.minute).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  },

  formatDate(timeStr) {
    const t = this.parseTimeStr(timeStr);
    if (!t) return timeStr || '';
    const year = t.year;
    const month = String(t.month).padStart(2, '0');
    const day = String(t.day).padStart(2, '0');
    const hour = String(t.hour).padStart(2, '0');
    const minute = String(t.minute).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  previewQRCode(e) {
    const urls = [this.data.activityDetail.groupQR];
    wx.previewImage({ urls, current: e.currentTarget.dataset.url });
  },

  previewCoverImage(e) {
    const src = e.currentTarget.dataset.src;
    if (!src) return;
    wx.previewImage({ urls: [src], current: src });
  },

  checkSignUpStatus() {
    const { activityDetail, agreeNotice, agreeBus, agreeSelf } = this.data;
    // 后端允许 status=1(报名中) 或 status=3(进行中) 报名
    const isActive = activityDetail.rawStatus === 1 || activityDetail.rawStatus === 3;
    const hasRemain = activityDetail.remainCount > 0;

    // 截止时间对比：用 parseTimeStr 统一解析
    let notExpired = true;
    const deadlineStr = activityDetail.deadline;
    if (deadlineStr) {
      const t = this.parseTimeStr(deadlineStr);
      if (t) {
        const deadlineDate = new Date(t.year, t.month - 1, t.day, t.hour, t.minute);
        notExpired = deadlineDate > new Date();
      }
    }

    let agreed = agreeNotice;
    if (activityDetail.travel.includes('bus')) agreed = agreed && agreeBus;
    if (activityDetail.travel.includes('train') || activityDetail.travel.includes('self')) {
      agreed = agreed && agreeSelf;
    }
    const registrationClosed = !notExpired || activityDetail.activityStarted;
    const canSignUp = isActive && hasRemain && !registrationClosed && agreed;
    this.setData({
      canSignUp,
      'activityDetail.registrationClosed': registrationClosed
    });
  },

  onAgreeNoticeChange(e) {
    const checked = e.detail;
    if (checked && !this.data.noticeViewed.participant) {
      this.openNoticeForAgree('participant', 'agreeNotice');
      return;
    }
    this.setData({ agreeNotice: checked }, () => this.checkSignUpStatus());
  },
  onAgreeBusChange(e) {
    const checked = e.detail;
    if (checked && !this.data.noticeViewed.bus) {
      this.openNoticeForAgree('bus', 'agreeBus');
      return;
    }
    this.setData({ agreeBus: checked }, () => this.checkSignUpStatus());
  },
  onAgreeSelfChange(e) {
    const checked = e.detail;
    if (checked && !this.data.noticeViewed.self) {
      this.openNoticeForAgree('self', 'agreeSelf');
      return;
    }
    this.setData({ agreeSelf: checked }, () => this.checkSignUpStatus());
  },

  // 勾选协议时跳转须知页面
  openNoticeForAgree(type, agreeField) {
    wx.navigateTo({
      url: `/pages/notice/notice?type=${type}`,
      events: {
        viewed: (data) => {
          if (data.type) {
            this.setData({ ['noticeViewed.' + data.type]: true });
          }
          if (data.agreeField) {
            this.setData({ [data.agreeField]: true }, () => this.checkSignUpStatus());
          }
        }
      },
      success: (res) => {
        res.eventChannel.emit('init', { agreeField });
      }
    });
  },

  onNoticeClick(e) {
    const { type } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/notice/notice?type=${type}`,
      events: {
        viewed: (data) => {
          if (data.type) {
            this.setData({ ['noticeViewed.' + data.type]: true });
          }
          if (data.agreeField) {
            this.setData({ [data.agreeField]: true }, () => this.checkSignUpStatus());
          }
        }
      },
      success: (res) => {
        res.eventChannel.emit('init', { agreeField: '' });
      }
    });
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
      // 未就绪：自动展开底部区域让用户看到需要操作的内容
      if (!this.data.bottomExpanded) {
        this.setData({ bottomExpanded: true });
      }
      const { agreeNotice, agreeBus, agreeSelf, activityDetail } = this.data;
      let tip = '当前不可报名';
      if (activityDetail.activityEnded) {
        tip = '活动已结束';
      } else if (activityDetail.registrationClosed) {
        tip = '活动报名已截止';
      } else if (!agreeNotice) {
        tip = '请先阅读并同意《报名参与者须知》';
      } else if (activityDetail.travel && activityDetail.travel[0] === 'bus' && !agreeBus) {
        tip = '请先阅读并同意《大巴行程免责声明》';
      } else if (activityDetail.travel && (activityDetail.travel[0] === 'train' || activityDetail.travel[1] === 'train' || activityDetail.travel[0] === 'self' || activityDetail.travel[1] === 'self' || activityDetail.travel[2] === 'self') && !agreeSelf) {
        tip = '请先阅读并同意《自驾/高铁行程免责声明》';
      }
      wx.showToast({ title: tip, icon: 'none' });
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
    if (this.data.activityDetail.activityEnded) {
      wx.showToast({ title: '活动已结束', icon: 'none' });
      return;
    }
    if (this.data.activityDetail.activityStarted) {
      wx.showToast({ title: '活动已开始', icon: 'none' });
      return;
    }
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
      const result = await post(
        '/api/activity/cancel-participation',
        { activity_id: this.data.activityId },
        { silent: true }
      );
      wx.hideLoading();
      if (result.code === 200) {
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
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.response?.msg || '网络错误', icon: 'none' });
    }
  },

  onCompanionChange(e) {
    const count = parseInt(e.detail) || 0;
    // 确保不超过剩余名额
    const remain = this.data.activityDetail.remainCount;
    const maxAllowed = Math.min(3, remain - 1);
    const finalCount = Math.max(0, Math.min(count, maxAllowed));
    this.setData({ companionCount: finalCount, maxCompanion: Math.max(0, maxAllowed) }, () => {
      this.checkSignUpStatus();
    });
  },

  async signUpActivity() {
    wx.showLoading({ title: '报名中...' });
    try {
      const userInfo = this.data.userInfo || wx.getStorageSync('userInfo');
      const result = await post('/api/activity/participate', {
          activity_id: this.data.activityId,
          nickname: userInfo?.nickName || '',
          phone: userInfo?.phoneNumber || '',
          wechat_id: userInfo?.wechatId || '',
          travel_option: null,
          remark: '',
          companion_count: this.data.companionCount
      }, { silent: true });
      wx.hideLoading();
      if (result.code === 200) {
        this.setData({ showSuccessPopup: true, isRegistered: true, registeredCompanionCount: this.data.companionCount });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('报名失败:', error);
      wx.showToast({ title: error.response?.msg || '网络错误', icon: 'none' });
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

  async onSubscribeActivityReminders() {
    try {
      const result = await subscribeUserReminders();
      wx.showToast({
        title: result.accepted > 0 ? '活动提醒已开启' : '暂未开启提醒',
        icon: result.accepted > 0 ? 'success' : 'none'
      });
    } catch (error) {
      console.error('订阅活动提醒失败:', error);
      wx.showToast({ title: '提醒设置未完成', icon: 'none' });
    }
  },

  onPreviewGroupQR() {
    if (this.data.activityDetail.groupQR) {
      wx.previewImage({ urls: [this.data.activityDetail.groupQR] });
    }
  },

  // 点击“已报名”按钮
  onViewRegistration() {
    // 这里可以提前获取报名信息并存入 data，然后显示弹窗
    this.setData({
      showSuccessPopup: true
    });
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
    this.stopLotteryCountdown();
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
