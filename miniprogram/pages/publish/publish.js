Page({
  data: {
    editActivityId: null,   // 编辑模式下的活动ID
    agree: false,
    canSubmit: false,
    showNotice: false,
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
    location: '',
    travel: [],
    route: '',
    distance: '',
    climb: '',
    difficulty: '',
    maxParticipants: 2,
    deadline: '',
    wechat: '',
    groupQR: '',
    cover: '',
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
      this.setData({
        [this.data.currentDatePickerField]: dateTimeStr
      }, () => this.checkCanSubmit());
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
      currentDatePickerTitle: field === 'activityTime' ? '选择活动时间' : '选择报名截止时间',
      pickerValue: [yearIdx, monthIdx, dayIdx, hourIdx, minuteIndex],
      tempSelectedDateTime: defaultDate
    });
  },

  onLoad(options) {
    this.initPickerData();
    wx.cloud.init({ env: 'prod-3gktwx67d1dd1e76' });

    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo.openId) {
      this.setData({ userInfo: { openId: userInfo.openId } });
      if (userInfo.wechatId) {
        this.setData({ wechat: userInfo.wechatId });
      }
    } else {
      wx.showToast({ title: '请先登录', icon: 'none' });
    }

    // 新建模式默认报名截止时间
    const now = new Date();
    const defaultDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    defaultDeadline.setHours(defaultDeadline.getHours() - 1);
    this.setData({ deadline: this.formatTime(defaultDeadline) }, () => this.checkCanSubmit());

    // 编辑模式：如果传入活动 id，加载活动数据
    const { id } = options;
    if (id) {
      this.setData({ editActivityId: parseInt(id) });
      this.fetchActivityForEdit(id);
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

    const travelTypeMap = { 1: 'bus', 2: 'train', 3: 'self' };
    const travelOptionsFromBackend = (activity.travel_options || []).map(t => travelTypeMap[t.travel_type]).filter(v => v);
    const showBusQR = travelOptionsFromBackend.includes('bus');

    const newTravelOptions = this.data.travelOptions.map(opt => ({
      ...opt,
      checked: travelOptionsFromBackend.includes(opt.value)
    }));

    let meetingPoints = (activity.meeting_points || []).map(point => ({
      time: point.meeting_time || point.time || '',
      location: point.location || ''
    }));
    if (meetingPoints.length === 0) meetingPoints = [{ time: '', location: '' }];

    this.setData({
      name: activity.name || '',
      description: activity.description || '',
      activityTime: this.formatTimeForInput(activity.activity_time),
      location: activity.location || '',
      route: activity.route || activity.routes || '',
      distance: activity.distance ? String(activity.distance) : '',
      climb: activity.climb ? String(activity.climb) : '',
      difficulty: difficulty,
      maxParticipants: activity.max_participants || 2,
      deadline: this.formatTimeForInput(activity.deadline),
      wechat: activity.wechat_id || '',
      groupQR: activity.group_qr_url || '',
      cover: activity.cover_url || '',
      forceInsurance: activity.is_force_insurance === 1 ? 1 : 0,
      travelOptions: newTravelOptions,
      travel: travelOptionsFromBackend,
      meetingPoints: meetingPoints
    }, () => {
      this.checkCanSubmit();
    });
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

  onSubmit() {
    // 校验
    if (!this.data.wechat || this.data.wechat.trim() === '') {
      wx.showToast({ title: '请填写发起人微信号', icon: 'none' });
      return;
    }
    if (!this.data.agree) {
      wx.showToast({ title: '请阅读并同意发起者须知', icon: 'none' });
      return;
    }

    // 根据是否有 editActivityId 判断编辑还是新建
    if (this.data.editActivityId) {
      this.submitEditActivity();
    } else {
      this.submitNewActivity();
    }
  },

  async submitNewActivity() {
    wx.showLoading({ title: '提交中...' });
    const travelTypeMap = { 'bus': 1, 'train': 2, 'self': 3 };
    const travelOptionsNumbers = (this.data.travel || []).map(item => travelTypeMap[item]).filter(v => v);
    const formData = {
      name: this.data.name,
      description: this.data.description,
      activityTime: this.data.activityTime,
      location: this.data.location,
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
        wx.showToast({ title: result.data?.msg || '提交失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'error' });
    }
  },

  async submitEditActivity() {
    wx.showLoading({ title: '重新提交审核...' });
    const travelTypeMap = { 'bus': 1, 'train': 2, 'self': 3 };
    const travelOptionsNumbers = (this.data.travel || []).map(item => travelTypeMap[item]).filter(v => v);
    const formData = {
      activity_id: this.data.editActivityId,
      name: this.data.name,
      description: this.data.description,
      activityTime: this.data.activityTime,
      location: this.data.location,
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
        wx.showToast({ title: result.data?.msg || '提交失败', icon: 'none' });
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
    const roundedTime = this.roundToHalfHour(defaultTime.getTime());
    this.setData({
      showDatePicker: true,
      currentDatePickerField: `meetingPoints[${index}].time`,
      currentDatePickerTitle: `选择集合点${index + 1}时间`,
      currentDateTime: roundedTime
    });
  },

  onDateTimeConfirm(e) {
    const dateTime = new Date(e.detail);
    const dateTimeStr = this.formatTime(dateTime);
    if (this.data.currentDatePickerField.includes('meetingPoints')) {
      const matches = this.data.currentDatePickerField.match(/meetingPoints\[(\d+)\]\.time/);
      if (matches) {
        const index = parseInt(matches[1]);
        const { meetingPoints } = this.data;
        meetingPoints[index].time = dateTimeStr;
        this.setData({ meetingPoints: [...meetingPoints] }, () => this.checkCanSubmit());
      }
    } else {
      this.setData({ [this.data.currentDatePickerField]: dateTimeStr }, () => this.checkCanSubmit());
    }
    this.setData({ showDatePicker: false });
  },

  onDateTimeCancel() {
    this.setData({ showDatePicker: false });
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
          this.setData({ groupQR: uploadResult.fileID }, () => this.checkCanSubmit());
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
          this.setData({ cover: uploadResult.fileID }, () => this.checkCanSubmit());
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
    this.setData({ agree: e.detail }, () => this.checkCanSubmit());
  },

  checkCanSubmit() {
    const {
      agree, name, description, activityTime, location, travel, meetingPoints,
      route, difficulty, maxParticipants, wechat, groupQR
    } = this.data;
    const isWechatValid = wechat && wechat.trim().length > 0;
    const requiredFields = [
      name, description, activityTime, location, travel.length > 0,
      route, difficulty, maxParticipants >= 2, isWechatValid, groupQR
    ];
    const meetingPointsValid = meetingPoints.every(p => p.time && p.location);
    const allRequiredValid = [...requiredFields, meetingPointsValid].every(Boolean);
    this.setData({ canSubmit: agree && allRequiredValid });
  },

  onNoticeClick() {
    this.setData({ showNotice: true });
  },

  onNoticeClose() {
    this.setData({ showNotice: false });
  }
});