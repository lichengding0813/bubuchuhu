const { get, post } = require('../../utils/api');
const {
  parseTimeStr,
  formatActivityTime,
  formatFullTime,
  getStatusText,
  getDifficultyText
} = require('../../utils/time');
const { getWeatherEmoji } = require('../../utils/weather');

Page({
  data: {
    activityId: null,
    activityDetail: {},
    weather: {},
    weatherLoading: false,
    weatherMessage: '',
    showRejectDialog: false,
    rejectReason: '',
    reviewing: false
  },

  onLoad(options) {
    if (!options.id) {
      wx.showToast({ title: '活动ID不存在', icon: 'none' });
      return;
    }
    this.setData({ activityId: options.id });
    this.loadActivityDetail();
  },

  async loadActivityDetail() {
    wx.showLoading({ title: '加载中...' });
    try {
      const result = await get('/api/activity/detail', { id: this.data.activityId }, { silent: true });
      const detail = result.data || {};
      this.setData({ activityDetail: this.formatActivityDetail(detail) });
      this.loadWeather(detail.location, detail.latitude, detail.longitude, detail.activity_time);
    } catch (error) {
      console.error('加载活动详情失败:', error);
      wx.showToast({ title: error.response?.msg || '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  formatActivityDetail(activity) {
    const participantCount = Number(activity.participant_count || 0);
    const totalCount = Number(activity.max_participants || 0);
    const travel = (activity.travel_options || []).map(item => {
      if (Number(item.travel_type) === 1) return 'bus';
      if (Number(item.travel_type) === 2) return 'train';
      if (Number(item.travel_type) === 3) return 'self';
      return '';
    }).filter(Boolean);
    const meetingPoints = (activity.meeting_points || []).map((point, index) => ({
      ...point,
      _key: point.id || `${point.meeting_time || point.time || ''}_${point.location || ''}_${index}`
    }));
    const rawStatus = Number(activity.status);
    const toTimestamp = value => {
      const parsed = parseTimeStr(value);
      return parsed
        ? new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, parsed.second || 0).getTime()
        : 0;
    };
    const now = Date.now();
    const endTimestamp = toTimestamp(activity.end_time);
    const deadlineTimestamp = toTimestamp(activity.deadline);
    const activityEnded = rawStatus === 4 || (endTimestamp > 0 && now >= endTimestamp);
    const registrationClosed = activityEnded
      || Boolean(activity.registration_closed)
      || (deadlineTimestamp > 0 && now >= deadlineTimestamp);
    const displayStatus = activityEnded
      ? '已结束'
      : registrationClosed && rawStatus === 1
        ? '报名已截止'
        : getStatusText(rawStatus);

    return {
      ...activity,
      name: activity.name || '',
      time: formatActivityTime(activity.activity_time),
      endTime: formatActivityTime(activity.end_time),
      location: activity.location || '',
      latitude: activity.latitude ?? null,
      longitude: activity.longitude ?? null,
      difficulty: getDifficultyText(Number(activity.difficulty || 1)),
      distance: Number(activity.distance || 0),
      climb: Number(activity.climb || 0),
      remainCount: Math.max(totalCount - participantCount, 0),
      totalCount,
      participantCount,
      organizer: activity.creator_name || '未知',
      wechat: activity.wechat_id || '',
      cover: activity.cover_url || activity.cover || '',
      groupQR: activity.group_qr_url || '',
      creatorAvatar: activity.creator_avatar || '',
      description: activity.description || '',
      route: activity.routes || activity.route || '',
      meetingPoints,
      deadline: formatFullTime(activity.deadline),
      status: displayStatus,
      rawStatus,
      travel,
      is_force_insurance: Number(activity.is_force_insurance) === 1 ? 1 : 0,
      isOfficial: Number(activity.is_official) === 1
    };
  },

  async loadWeather(city, latitude, longitude, activityTime) {
    const parsedDate = parseTimeStr(activityTime);
    if (!parsedDate) return;
    const date = [
      parsedDate.year,
      String(parsedDate.month).padStart(2, '0'),
      String(parsedDate.day).padStart(2, '0')
    ].join('-');

    this.setData({ weatherLoading: true, weatherMessage: '', weather: {} });
    try {
      const result = await get('/api/activity/calendar-weather', {
        date,
        city,
        latitude,
        longitude
      }, { silent: true });
      if (result.data?.date !== date) {
        this.setData({ weather: {}, weatherMessage: '暂无天气预报' });
        return;
      }
      this.setData({
        weather: {
          city: result.data.city || city,
          daily: [{
            ...result.data,
            dateLabel: this.formatWeatherDate(result.data.date),
            emoji: getWeatherEmoji(result.data.text_day)
          }]
        }
      });
    } catch (error) {
      console.log('审核详情天气加载失败（可忽略）:', error);
      this.setData({ weather: {}, weatherMessage: error.response?.msg || '天气暂时无法获取' });
    } finally {
      this.setData({ weatherLoading: false });
    }
  },

  formatWeatherDate(value) {
    const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})/);
    return match ? `${match[1]}/${match[2]}` : String(value || '');
  },

  previewCoverImage(e) {
    const src = e.currentTarget.dataset.src;
    if (src) wx.previewImage({ urls: [src], current: src });
  },

  previewQRCode(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.previewImage({ urls: [url], current: url });
  },

  openActivityLocation() {
    const { latitude, longitude, location } = this.data.activityDetail;
    if (latitude == null || longitude == null) return;
    wx.openLocation({
      latitude: Number(latitude),
      longitude: Number(longitude),
      name: location || '活动地点'
    });
  },

  openMeetingLocation(e) {
    const point = this.data.activityDetail.meetingPoints?.[e.currentTarget.dataset.index];
    if (!point || point.latitude == null || point.longitude == null) return;
    wx.openLocation({
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      name: point.location || '集合点'
    });
  },

  onApproveClick() {
    if (this.data.reviewing) return;
    wx.showModal({
      title: '确认通过',
      content: '确定要通过该活动吗？',
      confirmText: '确认通过',
      confirmColor: '#3e8dcc',
      success: res => {
        if (res.confirm) this.submitReview('approve', '');
      }
    });
  },

  onRejectClick() {
    if (this.data.reviewing) return;
    this.setData({ showRejectDialog: true, rejectReason: '' });
  },

  onRejectReasonInput(e) {
    this.setData({ rejectReason: e.detail.value });
  },

  cancelReject() {
    this.setData({ showRejectDialog: false, rejectReason: '' });
  },

  confirmReject() {
    if (this.data.reviewing) return;
    this.submitReview('reject', this.data.rejectReason);
  },

  async submitReview(action, rejectReason) {
    this.setData({ reviewing: true });
    wx.showLoading({ title: '处理中...', mask: true });
    try {
      await post('/api/admin/review-activity', {
        activity_id: Number(this.data.activityId),
        action,
        reject_reason: rejectReason || ''
      }, { silent: true });
      this.setData({ showRejectDialog: false, rejectReason: '' });
      wx.showToast({ title: action === 'approve' ? '已通过' : '已驳回', icon: 'success' });
      this.refreshPreviousPage();
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (error) {
      console.error('审核活动失败:', error);
      wx.showToast({ title: error.response?.msg || '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ reviewing: false });
    }
  },

  refreshPreviousPage() {
    const pages = getCurrentPages();
    const previousPage = pages[pages.length - 2];
    if (!previousPage) return;
    if (typeof previousPage.loadActivities === 'function') previousPage.loadActivities(true);
    if (typeof previousPage.loadTotalCount === 'function') previousPage.loadTotalCount();
  },

  onBackClick() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack({ delta: 1 });
    else wx.switchTab({ url: '/pages/home/home' });
  },

  preventTouchMove() {}
});
