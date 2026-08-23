const OFFICIAL_TITLE_PREFIX = '【步步出沪】';

Page({
  data: {
    editActivityId: null,   // 编辑模式下的活动ID
    draftId: null,          // 草稿编辑模式下的草稿ID
    isOfficialMode: false,  // 官方活动独立发布/共享编辑模式
    canChoosePublishMode: false,
    officialTitlePrefix: OFFICIAL_TITLE_PREFIX,
    agree: false,
    canSubmit: false,
    showNotice: false,
    // 协议强制阅读相关
    noticeViewed: false,
    canCloseNotice: true,
    noticeCountdown: 0,
    pendingAgree: false,
    showDatePicker: false,
    currentDatePickerField: '',
    currentDatePickerTitle: '',
    minDate: new Date().getTime(),
    maxDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).getTime(),
    currentDateTime: new Date().getTime(),

    // 出行方式选项
    travelOptions: [{
        label: '大巴',
        value: 'bus',
        checked: false
      },
      {
        label: '高铁',
        value: 'train',
        checked: false
      },
      {
        label: '自驾',
        value: 'self',
        checked: false
      }
    ],

    // 难度选项（五星制）
    difficultyOptions: [{
        text: '1星',
        value: 1
      },
      {
        text: '2星',
        value: 2
      },
      {
        text: '3星',
        value: 3
      },
      {
        text: '4星',
        value: 4
      },
      {
        text: '5星',
        value: 5
      }
    ],

    // 表单数据
    name: '',
    description: '',
    activityTime: '',
    endTime: '',
    location: '',
    travel: [],
    route: '',
    // 富文本编辑器
    editorReady: false,
    formatStatus: {},
    currentTextColor: '#333333',
    colorList: ['#333333', '#ff4444', '#1989fa', '#ff8800', '#4caf50'],
    fontSizeOptions: [
      { label: '小', value: 14 },
      { label: '标准', value: 16 },
      { label: '大', value: 24 }
    ],
    currentFontSize: 16,
    // 地图选点
    latitude: null,
    longitude: null,
    marker: null,
    distance: '',
    climb: '',
    difficulty: '',
    maxParticipants: 2,
    deadline: '',
    wechat: '',
    groupQR: '',
    cover: '',
    forceInsurance: 0,
    meetingPoints: [{
      time: '',
      location: ''
    }],

    // 自定义时间选择器数据
    pickerValue: [0, 0, 0, 0, 0],
    years: [],
    months: [],
    days: [],
    hours: [],
    minutes: ['00', '30'],
    tempSelectedDateTime: null,
  },

  initPickerData() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const years = [];
    for (let i = currentYear; i <= currentYear + 1; i++) {
      years.push(i);
    }
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));

    this.setData({ years, months, hours });
    this.updateDays(currentYear, now.getMonth() + 1);

    let defaultDate = new Date();
    let minutes = defaultDate.getMinutes();
    let minuteIndex = minutes < 15 ? 0 : (minutes < 45 ? 1 : 0);
    if (minutes >= 45) {
      defaultDate.setHours(defaultDate.getHours() + 1);
      minuteIndex = 0;
    }
    defaultDate.setMinutes(minuteIndex === 0 ? 0 : 30, 0, 0);

    const yearIndex = years.indexOf(defaultDate.getFullYear());
    const monthIndex = defaultDate.getMonth();
    const dayIndex = defaultDate.getDate() - 1;
    const hourIndex = defaultDate.getHours();

    this.setData({
      pickerValue: [yearIndex, monthIndex, dayIndex, hourIndex, minuteIndex],
      tempSelectedDateTime: defaultDate
    });
  },

  updateDays(year, month) {
    const daysCount = new Date(year, month, 0).getDate();
    const days = Array.from({ length: daysCount }, (_, i) => i + 1);
    this.setData({ days });
  },

  onForceInsuranceChange(e) {
    this.setData({ forceInsurance: e.detail });
  },

  onPickerChange(e) {
    const val = e.detail.value;
    const [yearIdx, monthIdx, dayIdx, hourIdx, minuteIdx] = val;
    const year = this.data.years[yearIdx];
    const month = this.data.months[monthIdx];
    const newDaysCount = new Date(year, month, 0).getDate();
    if (this.data.days.length !== newDaysCount) {
      this.updateDays(year, month);
      let newDayIdx = dayIdx;
      if (dayIdx >= newDaysCount) newDayIdx = newDaysCount - 1;
      val[2] = newDayIdx;
      this.setData({ pickerValue: val });
    } else {
      this.setData({ pickerValue: val });
    }
    const day = this.data.days[val[2]];
    const hour = parseInt(this.data.hours[hourIdx]);
    const minute = parseInt(this.data.minutes[minuteIdx]);
    const selectedDate = new Date(year, month - 1, day, hour, minute);
    this.data.tempSelectedDateTime = selectedDate;
  },

  onCustomDateTimeConfirm() {
    const selectedDate = this.data.tempSelectedDateTime;
    if (!selectedDate) return;
    const dateTimeStr = this.formatTime(selectedDate);
    if (this.data.currentDatePickerField.includes('meetingPoints')) {
      const matches = this.data.currentDatePickerField.match(/meetingPoints\[(\d+)\]\.time/);
      if (matches) {
        const index = parseInt(matches[1]);
        const { meetingPoints } = this.data;
        meetingPoints[index].time = dateTimeStr;
        this.setData({ meetingPoints: [...meetingPoints] }, () => this.checkCanSubmit());
      }
    } else {
      const field = this.data.currentDatePickerField;
      const updates = { [field]: dateTimeStr };
      if (field === 'activityTime') {
        if (!this.data.deadline) {
          updates.deadline = this.formatTime(new Date(selectedDate.getTime() - 60 * 60 * 1000));
        }
        if (!this.data.endTime) {
          updates.endTime = this.formatTime(new Date(selectedDate.getTime() + 12 * 60 * 60 * 1000));
        }
      }
      this.setData(updates, () => this.checkCanSubmit());
    }
    this.setData({ showDatePicker: false });
  },

  onTimePickerClick(e) {
    const { field } = e.currentTarget.dataset;
    let defaultDate = this.data[field] ? new Date(this.data[field].replace(/-/g, '/')) : new Date();
    defaultDate = this.roundToHalfHour(defaultDate.getTime());
    defaultDate = new Date(defaultDate);
    const year = defaultDate.getFullYear();
    const month = defaultDate.getMonth() + 1;
    const day = defaultDate.getDate();
    const hour = defaultDate.getHours();
    const minute = defaultDate.getMinutes();
    const minuteIndex = minute === 0 ? 0 : 1;
    const yearIdx = this.data.years.indexOf(year);
    const monthIdx = month - 1;
    const dayIdx = day - 1;
    const hourIdx = hour;
    this.setData({
      showDatePicker: true,
      currentDatePickerField: field,
      currentDatePickerTitle: {
        activityTime: '选择活动开始时间',
        endTime: '选择活动结束时间',
        deadline: '选择报名截止时间'
      }[field] || '选择时间',
      pickerValue: [yearIdx, monthIdx, dayIdx, hourIdx, minuteIndex],
      tempSelectedDateTime: defaultDate
    });
  },

  onLoad(options) {
    const isOfficialMode = Boolean(options && options.official === '1');
    const hasRouteToLoad = Boolean(options && options.id);
    const isDraft = Boolean(options && options.draft === '1');
    this.routeLoaded = !hasRouteToLoad;
    this.routeDirty = false;
    this.lastHydratedRoute = this.routeLoaded ? '' : null;
    this.isHydratingEditor = false;
    this.editorHydrationPromise = null;

    this.initPickerData();
    const userInfo = wx.getStorageSync('userInfo');
    if (isOfficialMode) {
      if (Number(userInfo?.isOfficial) !== 1) {
        wx.showModal({
          title: '权限不足',
          content: '仅官方账号可以发布或修改官方活动',
          showCancel: false,
          success: () => wx.navigateBack()
        });
        return;
      }
      this.setData({ isOfficialMode: true });
      wx.setNavigationBarTitle({
        title: options.id ? '编辑官方活动' : '发布官方活动'
      });
    }
    if (Number(userInfo?.isOfficial) === 1 && !hasRouteToLoad && !isDraft) {
      this.setData({ canChoosePublishMode: true });
    }
    if (userInfo && userInfo.openId) {
      this.setData({ userInfo: { openId: userInfo.openId } });

      // 资料完整性检查前置：手机号或微信号至少填一项
      if (!userInfo.phoneNumber && !userInfo.wechatId) {
        wx.showModal({
          title: '资料不完整',
          content: '请先在设置中填写手机号或微信号，以便参与者能联系到您',
          confirmText: '去设置',
          showCancel: false,
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({ url: '/pages/settings/settings' });
            }
          }
        });
        return;
      }

      // 资料完整，自动填充微信号
      if (userInfo.wechatId) {
        this.setData({ wechat: userInfo.wechatId });
      }
    } else {
      wx.showToast({ title: '请先登录', icon: 'none' });
    }

    // 编辑模式：如果传入活动 id，加载活动数据
    const { id, draft } = options;
    if (draft === '1' && id) {
      // 草稿编辑模式
      this.setData({ draftId: parseInt(id) });
      this.fetchDraftForEdit(id);
    } else if (id) {
      this.setData({ editActivityId: parseInt(id) });
      this.fetchActivityForEdit(id);
    }
  },

  stripOfficialTitlePrefix(title) {
    let value = String(title || '').trim();
    while (value.startsWith(OFFICIAL_TITLE_PREFIX)) {
      value = value.slice(OFFICIAL_TITLE_PREFIX.length).replace(/^\s+/, '');
    }
    return value;
  },

  onPublishModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    const isOfficialMode = mode === 'official';
    if (isOfficialMode === this.data.isOfficialMode) return;
    this.setData({
      isOfficialMode,
      name: this.stripOfficialTitlePrefix(this.data.name)
    }, () => this.checkCanSubmit());
    wx.setNavigationBarTitle({ title: isOfficialMode ? '发布官方活动' : '发起活动' });
  },

  onShow() {
    // 从设置页返回后，重新读取 userInfo 并自动填充微信号
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo.openId) {
      this.setData({ userInfo: { openId: userInfo.openId } });
      if (userInfo.wechatId && !this.data.wechat) {
        this.setData({ wechat: userInfo.wechatId }, () => this.checkCanSubmit());
      }
    }
  },

  async fetchActivityForEdit(activityId) {
    wx.showLoading({ title: '加载活动信息...' });
    try {
      const userInfo = wx.getStorageSync('userInfo');
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
        this.fillFormWithData(result.data.data);
      } else {
        wx.showToast({ title: '加载活动失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('加载活动失败', error);
      wx.showToast({ title: '网络错误', icon: 'error' });
    }
  },

  fillFormWithData(activity) {
    const difficulty = activity.difficulty || 1;
    const loadedOfficial = Number(activity.is_official) === 1;

    const travelTypeMap = { 1: 'bus', 2: 'train', 3: 'self' };
    const travelOptionsFromBackend = (activity.travel_options || []).map(t => travelTypeMap[t.travel_type]).filter(v => v);
    const showBusQR = travelOptionsFromBackend.includes('bus');

    const newTravelOptions = this.data.travelOptions.map(opt => ({
      ...opt,
      checked: travelOptionsFromBackend.includes(opt.value)
    }));

    let meetingPoints = (activity.meeting_points || []).map(point => ({
      time: point.meeting_time || point.time || '',
      location: point.location || '',
      latitude: point.latitude ?? null,
      longitude: point.longitude ?? null
    }));
    if (meetingPoints.length === 0) meetingPoints = [{ time: '', location: '' }];

    const loadedRoute = activity.route || activity.routes || '';
    const formUpdates = {
      name: loadedOfficial ? this.stripOfficialTitlePrefix(activity.name) : (activity.name || ''),
      description: activity.description || '',
      activityTime: this.formatTimeForInput(activity.activity_time),
      endTime: this.formatTimeForInput(activity.end_time),
      location: activity.location || '',
      latitude: activity.latitude ?? null,
      longitude: activity.longitude ?? null,
      marker: activity.latitude != null && activity.longitude != null
        ? { id: 1, latitude: activity.latitude, longitude: activity.longitude }
        : null,
      distance: activity.distance ? String(activity.distance) : '',
      climb: activity.climb ? String(activity.climb) : '',
      difficulty: difficulty,
      maxParticipants: activity.max_participants || 2,
      deadline: this.formatTimeForInput(activity.deadline),
      wechat: activity.wechat_id || '',
      groupQR: activity.group_qr_url || '',
      cover: activity.cover_url || '',
      forceInsurance: Number(activity.is_force_insurance) === 1 ? 1 : 0,
      travelOptions: newTravelOptions,
      travel: travelOptionsFromBackend,
      meetingPoints: meetingPoints
    };
    if (loadedOfficial) {
      formUpdates.isOfficialMode = true;
      formUpdates.canChoosePublishMode = false;
      wx.setNavigationBarTitle({ title: '编辑官方活动' });
    }

    // 接口较慢时，用户可能已经开始输入；这种情况下不覆盖用户内容。
    if (!this.routeDirty) {
      formUpdates.route = loadedRoute;
    }

    this.setData(formUpdates, () => {
      this.routeLoaded = true;
      this.lastHydratedRoute = null;
      this.syncRouteEditor();
      this.checkCanSubmit();
    });
  },

  // ==================== 草稿功能 ====================

  async fetchDraftForEdit(draftId) {
    wx.showLoading({ title: '加载草稿...' });
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/detail",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "content-type": "application/json"
        },
        method: "GET",
        data: { id: draftId }
      });
      wx.hideLoading();
      if (result.data && result.data.code === 200) {
        this.fillFormWithData(result.data.data);
      } else {
        wx.showToast({ title: '加载草稿失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('加载草稿失败', error);
      wx.showToast({ title: '网络错误', icon: 'error' });
    }
  },

  collectFormData() {
    const travelTypeMap = { 'bus': 1, 'train': 2, 'self': 3 };
    const travelOptionsNumbers = (this.data.travel || []).map(item => travelTypeMap[item]).filter(v => v);
    return {
      name: this.data.isOfficialMode
        ? `${OFFICIAL_TITLE_PREFIX}${this.stripOfficialTitlePrefix(this.data.name)}`
        : this.data.name,
      description: this.data.description,
      activityTime: this.data.activityTime,
      endTime: this.data.endTime,
      location: this.data.location,
      latitude: this.data.latitude,
      longitude: this.data.longitude,
      route: this.data.route,
      distance: parseInt(this.data.distance) || 0,
      climb: parseInt(this.data.climb) || 0,
      difficulty: parseInt(this.data.difficulty) || 1,
      maxParticipants: this.data.maxParticipants,
      deadline: this.data.deadline,
      cover: this.data.cover,
      groupQR: this.data.groupQR,
      wechat: this.data.wechat,
      travelOptions: travelOptionsNumbers,
      meetingPoints: this.data.meetingPoints,
      mandatoryInsurance: this.data.forceInsurance,
    };
  },

  async onSaveDraft() {
    await this.syncRouteFromEditor();

    // 草稿不校验必填项，只要有任意内容即可
    const formData = this.collectFormData();
    const hasAnyContent = formData.name || formData.description || formData.location || formData.activityTime;
    if (!hasAnyContent) {
      wx.showToast({ title: '请至少填写一项内容', icon: 'none' });
      return;
    }

    if (this.data.draftId) {
      formData.draft_id = this.data.draftId;
    }

    wx.showLoading({ title: '保存中...' });
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/save-draft",
        method: "POST",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "Content-Type": "application/json"
        },
        data: formData
      });
      wx.hideLoading();
      if (result.data && result.data.code === 200) {
        this.setData({ draftId: result.data.data.draft_id });
        wx.showModal({
          title: '草稿已保存',
          content: '您可在「我的 - 我发起的 - 草稿箱」中找到此草稿，随时继续编辑或发布',
          showCancel: false,
          confirmText: '我知道了',
          confirmColor: '#5faee3',
          success: () => {
            wx.switchTab({ url: '/pages/home/home' });
          }
        });
      } else {
        wx.showToast({ title: result.data?.msg || '保存失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('保存草稿失败', err);
      wx.showToast({ title: '网络错误', icon: 'error' });
    }
  },

  formatTimeForInput(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.replace('T', ' ').split(/[- :]/);
    if (parts.length < 5) return dateStr;
    const year = parts[0];
    const month = String(parseInt(parts[1])).padStart(2, '0');
    const day = String(parseInt(parts[2])).padStart(2, '0');
    const hour = String(parseInt(parts[3])).padStart(2, '0');
    const minute = String(parseInt(parts[4])).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  async onSubmit() {
    await this.syncRouteFromEditor();

    // 校验用户资料完整性：手机号或微信号至少填一项
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo.phoneNumber && !userInfo.wechatId) {
      wx.showModal({
        title: '资料不完整',
        content: '请先在设置中填写手机号或微信号，以便参与者能联系到您',
        confirmText: '去设置',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/settings/settings' });
          }
        }
      });
      return;
    }
    // 校验
    if (!this.data.wechat || this.data.wechat.trim() === '') {
      wx.showToast({ title: '请填写发起人微信号', icon: 'none' });
      return;
    }
    if (!this.data.agree) {
      wx.showToast({ title: '请阅读并同意发起者须知', icon: 'none' });
      return;
    }
    // 校验报名截止时间不能晚于活动开始时间
    if (this.data.deadline && this.data.activityTime) {
      const deadlineTs = new Date(this.data.deadline.replace(/-/g, '/')).getTime();
      const activityTs = new Date(this.data.activityTime.replace(/-/g, '/')).getTime();
      if (deadlineTs > activityTs) {
        wx.showModal({
          title: '时间冲突',
          content: '报名截止时间不能晚于活动开始时间，请修改后再提交',
          showCancel: false,
          confirmText: '我知道了',
          confirmColor: '#5faee3'
        });
        return;
      }
    }
    if (this.data.activityTime && this.data.endTime) {
      const activityTs = new Date(this.data.activityTime.replace(/-/g, '/')).getTime();
      const endTs = new Date(this.data.endTime.replace(/-/g, '/')).getTime();
      if (endTs <= activityTs) {
        wx.showModal({
          title: '时间冲突',
          content: '活动结束时间必须晚于开始时间，请修改后再提交',
          showCancel: false,
          confirmText: '我知道了',
          confirmColor: '#5faee3'
        });
        return;
      }
    }
    // 校验集合点时间不能晚于活动开始时间
    if (this.data.activityTime && this.data.meetingPoints && this.data.meetingPoints.length > 0) {
      const activityTs = new Date(this.data.activityTime.replace(/-/g, '/')).getTime();
      for (let i = 0; i < this.data.meetingPoints.length; i++) {
        const mp = this.data.meetingPoints[i];
        if (mp.time) {
          const mpTs = new Date(mp.time.replace(/-/g, '/')).getTime();
          if (mpTs > activityTs) {
            wx.showModal({
              title: '时间冲突',
              content: `第${i + 1}个集合点的时间不能晚于活动开始时间，请修改后再提交`,
              showCancel: false,
              confirmText: '我知道了',
              confirmColor: '#5faee3'
            });
            return;
          }
        }
      }
    }

    // 根据模式判断提交方式
    if (this.data.isOfficialMode) {
      this.submitOfficialActivity();
    } else if (this.data.editActivityId) {
      this.submitEditActivity();
    } else if (this.data.draftId) {
      this.publishDraft();
    } else {
      this.submitNewActivity();
    }
  },

  async publishDraft() {
    wx.showLoading({ title: '提交中...' });
    const formData = { ...this.collectFormData(), draft_id: this.data.draftId };
    try {
      const userInfo = wx.getStorageSync('userInfo');
      // 1. 先保存草稿内容
      const saveResult = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/save-draft",
        method: "POST",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "Content-Type": "application/json"
        },
        data: formData
      });
      if (!saveResult.data || saveResult.data.code !== 200) {
        wx.hideLoading();
        wx.showToast({ title: saveResult.data?.msg || '保存失败', icon: 'none' });
        return;
      }
      // 2. 再发布草稿（status -1 → 0）
      const publishResult = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/publish-draft",
        method: "POST",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "Content-Type": "application/json"
        },
        data: { draft_id: this.data.draftId }
      });
      wx.hideLoading();
      if (publishResult.data && publishResult.data.code === 200) {
        wx.showToast({ title: '已提交审核', icon: 'success', duration: 2000 });
        setTimeout(() => wx.navigateBack(), 2000);
      } else {
        const errMsg = publishResult.data?.msg || '提交失败';
        wx.showModal({ title: '提交失败', content: errMsg, showCancel: false });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'error' });
    }
  },

  async submitNewActivity() {
    wx.showLoading({ title: '提交中...' });
    const formData = this.collectFormData();
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/create",
        method: "POST",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "Content-Type": "application/json"
        },
        data: formData
      });
      wx.hideLoading();
      if (result.data && result.data.code === 200) {
        wx.showToast({ title: '发起成功', icon: 'success', duration: 2000 });
        setTimeout(() => wx.navigateBack(), 2000);
      } else {
        const errMsg = result.data?.msg || '提交失败';
        if (errMsg.includes('违规')) {
          wx.showModal({ title: '内容审核提示', content: errMsg, showCancel: false });
        } else {
          wx.showToast({ title: errMsg, icon: 'none' });
        }
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'error' });
    }
  },

  async submitOfficialActivity() {
    const isEditing = Boolean(this.data.editActivityId);
    wx.showLoading({ title: isEditing ? '保存中...' : '发布中...' });
    const formData = this.collectFormData();
    if (isEditing) formData.activity_id = this.data.editActivityId;
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: isEditing
          ? "/api/activity/official-activities/update"
          : "/api/activity/official-activities/create",
        method: "POST",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "Content-Type": "application/json"
        },
        data: formData
      });
      wx.hideLoading();
      if (result.data && result.data.code === 200) {
        wx.showToast({
          title: isEditing ? '官方活动已更新' : '官方活动已发布',
          icon: 'success',
          duration: 1800
        });
        setTimeout(() => wx.navigateBack(), 1800);
      } else {
        const errMsg = result.data?.msg || '操作失败';
        if (errMsg.includes('违规')) {
          wx.showModal({ title: '内容安全提示', content: errMsg, showCancel: false });
        } else {
          wx.showToast({ title: errMsg, icon: 'none' });
        }
      }
    } catch (error) {
      wx.hideLoading();
      console.error('保存官方活动失败', error);
      wx.showToast({ title: '网络错误', icon: 'error' });
    }
  },

  async submitEditActivity() {
    wx.showLoading({ title: '重新提交审核...' });
    const formData = { ...this.collectFormData(), activity_id: this.data.editActivityId };
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/api/activity/update-rejected",
        method: "POST",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "Content-Type": "application/json"
        },
        data: formData
      });
      wx.hideLoading();
      if (result.data && result.data.code === 200) {
        wx.showToast({ title: '修改成功', icon: 'success', duration: 2000 });
        setTimeout(() => wx.navigateBack(), 2000);
      } else {
        const errMsg = result.data?.msg || '提交失败';
        if (errMsg.includes('违规')) {
          wx.showModal({ title: '内容审核提示', content: errMsg, showCancel: false });
        } else {
          wx.showToast({ title: errMsg, icon: 'none' });
        }
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'error' });
    }
  },

  // 以下为原有辅助方法（保持不变）
  onBackClick() {
    wx.navigateBack({ delta: 1 });
  },

  formatTime(date) {
    if (!date) return '';
    // 支持字符串或Date对象
    let year, month, day, hour, minute;
    if (typeof date === 'string') {
      const parts = date.replace('T', ' ').split(/[- :]/);
      if (parts.length >= 5) {
        year = parts[0];
        month = String(parseInt(parts[1])).padStart(2, '0');
        day = String(parseInt(parts[2])).padStart(2, '0');
        hour = String(parseInt(parts[3])).padStart(2, '0');
        minute = String(parseInt(parts[4])).padStart(2, '0');
        return `${year}-${month}-${day} ${hour}:${minute}`;
      }
    }
    const d = new Date(date);
    year = d.getFullYear();
    month = String(d.getMonth() + 1).padStart(2, '0');
    day = String(d.getDate()).padStart(2, '0');
    hour = String(d.getHours()).padStart(2, '0');
    minute = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  roundToHalfHour(timestamp) {
    const date = new Date(timestamp);
    const minutes = date.getMinutes();
    const remainder = minutes % 30;
    if (remainder !== 0) {
      date.setMinutes(minutes - remainder, 0, 0);
    }
    return date.getTime();
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail || '';
    this.setData({ [field]: value }, () => this.checkCanSubmit());
  },

  // 活动地点地图选点
  onChooseActivityLocation() {
    this.chooseLocationWithFeedback((res) => {
      this.setData({
        location: res.name || res.address,
        latitude: res.latitude,
        longitude: res.longitude,
        marker: { id: 1, latitude: res.latitude, longitude: res.longitude }
      }, () => this.checkCanSubmit());
    });
  },

  // 集合点地图选点
  onChooseMeetingLocation(e) {
    const index = e.currentTarget.dataset.index;
    this.chooseLocationWithFeedback((res) => {
      const { meetingPoints } = this.data;
      if (meetingPoints[index]) {
        meetingPoints[index].location = res.name || res.address;
        meetingPoints[index].latitude = res.latitude;
        meetingPoints[index].longitude = res.longitude;
        this.setData({ meetingPoints: [...meetingPoints] }, () => this.checkCanSubmit());
      }
    });
  },

  chooseLocationWithFeedback(onSuccess) {
    const openChooser = () => {
      wx.chooseLocation({
        success: onSuccess,
        fail: (error) => this.handleChooseLocationFailure(error)
      });
    };

    if (typeof wx.requirePrivacyAuthorize === 'function') {
      wx.requirePrivacyAuthorize({
        success: openChooser,
        fail: () => wx.showToast({ title: '请先同意隐私保护指引', icon: 'none' })
      });
      return;
    }
    openChooser();
  },

  handleChooseLocationFailure(error) {
    const message = String(error?.errMsg || '');
    if (message.includes('cancel')) return;
    if (message.includes('auth deny') || message.includes('authorize')) {
      wx.showModal({
        title: '需要位置权限',
        content: '请在设置中允许使用位置，用于选择活动地点。',
        confirmText: '去设置',
        success: (result) => {
          if (result.confirm) wx.openSetting();
        }
      });
      return;
    }
    wx.showToast({ title: '地图暂不可用，可先手动输入', icon: 'none' });
  },

  // ====== 富文本编辑器（路线简介） ======
  onEditorReady() {
    wx.createSelectorQuery().select('#editor-route').context((res) => {
      if (!res || !res.context) {
        console.error('路线编辑器初始化失败：未获取到 EditorContext');
        return;
      }

      this.editorCtx = res.context;
      this.setData({ editorReady: true }, () => this.syncRouteEditor());
    }).exec();
  },

  syncRouteEditor() {
    if (!this.editorCtx || !this.routeLoaded || this.routeDirty) {
      return Promise.resolve(false);
    }

    const html = this.data.route || '';
    if (this.lastHydratedRoute === html) {
      return Promise.resolve(true);
    }

    this.isHydratingEditor = true;
    const hydrationPromise = new Promise((resolve) => {
      let hydrationSucceeded = false;
      try {
        this.editorCtx.setContents({
          html,
          success: () => {
            hydrationSucceeded = true;
            this.lastHydratedRoute = html;
          },
          fail: (error) => {
            console.error('路线详情回填失败', error);
          },
          complete: () => {
            // setContents 可能触发 input，延后一拍再恢复用户输入监听。
            setTimeout(() => {
              this.isHydratingEditor = false;
              resolve(hydrationSucceeded);
            }, 0);
          }
        });
      } catch (error) {
        this.isHydratingEditor = false;
        console.error('路线详情回填失败', error);
        resolve(false);
      }
    });

    this.editorHydrationPromise = hydrationPromise;
    hydrationPromise.then(() => {
      if (this.editorHydrationPromise === hydrationPromise) {
        this.editorHydrationPromise = null;
      }
    });
    return hydrationPromise;
  },

  async syncRouteFromEditor() {
    if (this.editorHydrationPromise) {
      await this.editorHydrationPromise;
    }
    if (!this.editorCtx) {
      return this.data.route || '';
    }

    return new Promise((resolve) => {
      try {
        this.editorCtx.getContents({
          success: (result) => {
            const editorHtml = typeof result.html === 'string' ? result.html : '';
            const editorText = typeof result.text === 'string' ? result.text.trim() : '';
            const hydrationWasMissed = !this.routeDirty
              && this.routeLoaded
              && Boolean(this.data.route)
              && this.lastHydratedRoute !== this.data.route
              && !editorText;
            const route = hydrationWasMissed ? this.data.route : editorHtml;

            if (route === this.data.route) {
              resolve(route);
              return;
            }
            this.lastHydratedRoute = route;
            this.setData({ route }, () => {
              this.checkCanSubmit();
              resolve(route);
            });
          },
          fail: (error) => {
            console.warn('读取路线详情失败，继续使用页面缓存内容', error);
            resolve(this.data.route || '');
          }
        });
      } catch (error) {
        console.warn('读取路线详情失败，继续使用页面缓存内容', error);
        resolve(this.data.route || '');
      }
    });
  },

  onEditorInput(e) {
    if (this.isHydratingEditor) return;
    this.routeLoaded = true;
    this.routeDirty = true;
    this.lastHydratedRoute = e.detail.html;
    this.setData({ route: e.detail.html }, () => this.checkCanSubmit());
  },

  onEditorStatusChange(e) {
    const formatStatus = e.detail || {};
    const updates = { formatStatus };
    if (formatStatus.color) {
      updates.currentTextColor = formatStatus.color;
    }
    if (formatStatus.fontSize) {
      const fontSize = parseInt(formatStatus.fontSize, 10);
      if (!Number.isNaN(fontSize)) {
        updates.currentFontSize = fontSize;
      }
    }
    this.setData(updates);
  },

  onFormat(e) {
    if (!this.editorCtx) return;
    const { name, value } = e.currentTarget.dataset;
    if (name === 'header') {
      this.editorCtx.format(name, value === '' ? false : parseInt(value));
    } else {
      this.editorCtx.format(name);
    }
  },

  onSetFontSize(e) {
    if (!this.editorCtx) return;
    const size = parseInt(e.currentTarget.dataset.size, 10);
    if (Number.isNaN(size)) return;
    this.editorCtx.format('fontSize', size + 'px');
    this.setData({ currentFontSize: size });
  },

  onSetColor(e) {
    if (!this.editorCtx) return;
    const color = e.currentTarget.dataset.color;
    this.editorCtx.format('color', color);
    this.setData({ currentTextColor: color });
  },

  onInsertDivider() {
    if (!this.editorCtx) return;
    this.editorCtx.insertDivider();
  },

  onMeetingLocationInput(e) {
    const { index } = e.currentTarget.dataset;
    const value = e.detail.value || e.detail || '';
    const { meetingPoints } = this.data;
    if (meetingPoints[index]) {
      meetingPoints[index].location = value;
      this.setData({ meetingPoints: [...meetingPoints] }, () => this.checkCanSubmit());
    }
  },

  onTravelChange(e) {
    const { value } = e.currentTarget.dataset;
    const { travelOptions } = this.data;
    const newOptions = travelOptions.map(opt => {
      if (opt.value === value) opt.checked = !opt.checked;
      return opt;
    });
    const selectedTravel = newOptions.filter(opt => opt.checked).map(opt => opt.value);
    this.setData({
      travelOptions: newOptions,
      travel: selectedTravel
    }, () => this.checkCanSubmit());
  },

  onDifficultyChange(e) {
    this.setData({ difficulty: e.detail }, () => this.checkCanSubmit());
  },

  onDifficultyTap(e) {
    this.setData({ difficulty: e.currentTarget.dataset.value }, () => this.checkCanSubmit());
  },

  onStepperChange(e) {
    this.setData({ maxParticipants: e.detail }, () => this.checkCanSubmit());
  },

  onAddMeetingPoint() {
    const { meetingPoints } = this.data;
    meetingPoints.push({ time: '', location: '' });
    this.setData({ meetingPoints: [...meetingPoints] }, () => this.checkCanSubmit());
  },

  onRemoveMeetingPoint(e) {
    const { index } = e.currentTarget.dataset;
    const { meetingPoints } = this.data;
    meetingPoints.splice(index, 1);
    this.setData({ meetingPoints: [...meetingPoints] }, () => this.checkCanSubmit());
  },

  onMeetingTimePickerClick(e) {
    const { index } = e.currentTarget.dataset;
    const meetingPoint = this.data.meetingPoints[index];
    let defaultTime = new Date();
    if (meetingPoint.time) defaultTime = new Date(meetingPoint.time.replace(/-/g, '/'));
    else defaultTime.setHours(10, 0, 0, 0);
    defaultTime = new Date(this.roundToHalfHour(defaultTime.getTime()));
    this.updateDays(defaultTime.getFullYear(), defaultTime.getMonth() + 1);
    this.setData({
      showDatePicker: true,
      currentDatePickerField: `meetingPoints[${index}].time`,
      currentDatePickerTitle: `选择集合点${index + 1}时间`,
      pickerValue: [
        this.data.years.indexOf(defaultTime.getFullYear()),
        defaultTime.getMonth(),
        defaultTime.getDate() - 1,
        defaultTime.getHours(),
        defaultTime.getMinutes() === 0 ? 0 : 1
      ],
      tempSelectedDateTime: defaultTime
    });
  },

  onDateTimeCancel() {
    this.setData({ showDatePicker: false });
  },

  // 上传图片后检测是否合规，违规时将图片存到 flagged/ 文件夹供人工复核
  async checkImageSecurity(fileID, tempFilePath) {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      // cloud:// 协议链接后端无法直接下载，先转成 https 临时链接
      let httpUrl = fileID;
      try {
        const tempRes = await wx.cloud.getTempFileURL({ fileList: [fileID] });
        if (tempRes.fileList && tempRes.fileList[0] && tempRes.fileList[0].tempFileURL) {
          httpUrl = tempRes.fileList[0].tempFileURL;
        }
      } catch (e) {
        console.error('getTempFileURL失败，尝试直接传原始URL', e);
      }
      const result = await wx.cloud.callContainer({
        config: { env: "prod-3gktwx67d1dd1e76" },
        path: "/check-image-url",
        method: "POST",
        header: {
          "X-WX-SERVICE": "flask-mysql-login",
          "X-Wx-OpenId": userInfo?.openId,
          "Content-Type": "application/json"
        },
        data: { url: httpUrl }
      });
      if (result.data && result.data.code === 200) {
        return true;
      } else {
        const errMsg = result.data?.msg || '图片检测失败';
        // 违规：将图片存到 flagged/ 文件夹（带openid和昵称），再删除原文件
        try {
          const openId = userInfo?.openId || 'unknown';
          const nickName = (userInfo?.nickName || 'unknown').replace(/[\/\\:*?"<>|]/g, '_');
          const ext = tempFilePath.split('.').pop() || 'png';
          const flaggedPath = 'flagged/' + openId + '_' + nickName + '_' + Date.now() + '.' + ext;
          await wx.cloud.uploadFile({ cloudPath: flaggedPath, filePath: tempFilePath });
        } catch (e) { console.error('保存违规图片到flagged失败', e); }
        try { await wx.cloud.deleteFile({ fileList: [fileID] }); } catch (e) {}
        wx.showModal({ title: '图片审核提示', content: errMsg, showCancel: false });
        return false;
      }
    } catch (err) {
      console.error('图片安全检测失败', err);
      wx.showModal({
        title: '图片暂未通过检测',
        content: '安全检测服务暂时不可用，请稍后重试上传。',
        showCancel: false
      });
      return false;
    }
  },

  async onUploadQR(e) {
    const { openId } = this.data.userInfo || {};
    if (!openId) {
      wx.showToast({ title: '用户信息异常', icon: 'error' });
      return;
    }
    wx.chooseImage({
      count: 1,
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0];
        wx.showLoading({ title: '上传中...', mask: true });
        try {
          const timestamp = Date.now();
          const fileExtension = tempFilePath.split('.').pop() || 'png';
          const cloudPath = `activities/group_qr/${openId}_${timestamp}.${fileExtension}`;
          const uploadResult = await wx.cloud.uploadFile({
            cloudPath,
            filePath: tempFilePath,
            config: { env: 'prod-3gktwx67d1dd1e76' }
          });
          const fileID = uploadResult.fileID;
          // 上传成功后检测图片安全性
          wx.showLoading({ title: '检测图片...' });
          const safe = await this.checkImageSecurity(fileID, tempFilePath);
          if (!safe) {
            wx.hideLoading();
            return;
          }
          this.setData({ groupQR: fileID }, () => this.checkCanSubmit());
          wx.hideLoading();
          wx.showToast({ title: '上传成功', icon: 'success' });
        } catch (error) {
          console.error('上传失败', error);
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'error' });
        }
      }
    });
  },

  async onUploadCover() {
    const { openId } = this.data.userInfo || {};
    if (!openId) {
      wx.showToast({ title: '用户信息异常', icon: 'error' });
      return;
    }
    wx.chooseImage({
      count: 1,
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0];
        wx.showLoading({ title: '上传中...', mask: true });
        try {
          const timestamp = Date.now();
          const fileExtension = tempFilePath.split('.').pop() || 'png';
          const cloudPath = `activities/covers/${openId}_${timestamp}.${fileExtension}`;
          const uploadResult = await wx.cloud.uploadFile({
            cloudPath,
            filePath: tempFilePath,
            config: { env: 'prod-3gktwx67d1dd1e76' }
          });
          const fileID = uploadResult.fileID;
          // 上传成功后检测图片安全性
          wx.showLoading({ title: '检测图片...' });
          const safe = await this.checkImageSecurity(fileID, tempFilePath);
          if (!safe) {
            wx.hideLoading();
            return;
          }
          this.setData({ cover: fileID }, () => this.checkCanSubmit());
          wx.hideLoading();
          wx.showToast({ title: '上传成功', icon: 'success' });
        } catch (error) {
          console.error('上传失败', error);
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'error' });
        }
      }
    });
  },

  onAgreeChange(e) {
    const checked = e.detail;
    if (checked && !this.data.noticeViewed) {
      // 跳转发起者须知页面
      this.setData({ agree: false, pendingAgree: true });
      wx.navigateTo({
        url: '/pages/notice/notice?type=organizer',
        events: {
          viewed: (data) => {
            if (data.type === 'organizer') {
              this.setData({ noticeViewed: true, agree: true, pendingAgree: false }, () => this.checkCanSubmit());
            }
          }
        },
        success: (res) => {
          res.eventChannel.emit('init', { agreeField: '' });
        }
      });
      return;
    }
    this.setData({ agree: checked }, () => this.checkCanSubmit());
  },

  checkCanSubmit() {
    const {
      agree, name, description, activityTime, endTime, location, travel, meetingPoints,
      route, difficulty, maxParticipants, wechat, groupQR
    } = this.data;
    const isWechatValid = wechat && wechat.trim().length > 0;
    const requiredFields = [
      name, description, activityTime, endTime, location, travel.length > 0,
      route, difficulty, maxParticipants >= 2, isWechatValid, groupQR
    ];
    const meetingPointsValid = meetingPoints.every(p => p.time && p.location);
    const allRequiredValid = [...requiredFields, meetingPointsValid].every(Boolean);
    this.setData({ canSubmit: agree && allRequiredValid });
  },

  onNoticeClick() {
    wx.navigateTo({
      url: '/pages/notice/notice?type=organizer',
      events: {
        viewed: (data) => {
          if (data.type === 'organizer') {
            this.setData({ noticeViewed: true }, () => {
              if (this.data.pendingAgree) {
                this.setData({ agree: true, pendingAgree: false }, () => this.checkCanSubmit());
              }
            });
          }
        }
      },
      success: (res) => {
        res.eventChannel.emit('init', { agreeField: '' });
      }
    });
  },

  onUnload() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }
});
