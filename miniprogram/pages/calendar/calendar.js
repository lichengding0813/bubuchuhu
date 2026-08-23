const { get } = require('../../utils/api');
const { formatActivityTime, getDifficultyText } = require('../../utils/time');

Page({
  data: {
    year: 0,
    month: 0,
    days: [],
    selectedDate: '',
    selectedDateLabel: '',
    dayActivities: [],
    activityMap: {}
  },

  onLoad() {
    const now = new Date();
    this.setData({ year: now.getFullYear(), month: now.getMonth() + 1 });
    this.loadCalendar();
  },

  async loadCalendar() {
    try {
      const { year, month } = this.data;
      const result = await get('/api/activity/calendar', { year, month }, { silent: true });
      if (result.code === 200) {
        const activityMap = result.data || {};
        this.setData({ activityMap });
        this.buildDays();
      }
    } catch (err) {
      console.error('日历加载失败:', err);
      this.buildDays();
    }
  },

  buildDays() {
    const { year, month, activityMap } = this.data;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push({ key: `empty-${year}-${month}-${i}`, isEmpty: true, day: '' });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        key: dateStr,
        day: d,
        dateStr,
        isEmpty: false,
        isToday: dateStr === todayStr,
        hasActivity: !!activityMap[dateStr]
      });
    }
    this.setData({ days });
  },

  prevMonth() {
    let { year, month } = this.data;
    if (month === 1) { year--; month = 12; } else { month--; }
    this.setData({ year, month, selectedDate: '', selectedDateLabel: '', dayActivities: [] }, () => this.loadCalendar());
  },

  nextMonth() {
    let { year, month } = this.data;
    if (month === 12) { year++; month = 1; } else { month++; }
    this.setData({ year, month, selectedDate: '', selectedDateLabel: '', dayActivities: [] }, () => this.loadCalendar());
  },

  async onDateTap(e) {
    const dateStr = e.currentTarget.dataset.date;
    if (!dateStr) return;
    const dateParts = dateStr.split('-').map(Number);
    this.setData({
      selectedDate: dateStr,
      selectedDateLabel: `${dateParts[0]}年${dateParts[1]}月${dateParts[2]}日`,
      dayActivities: []
    });
    try {
      const { year, month } = this.data;
      const result = await get('/api/activity/calendar', { year, month, date: dateStr }, { silent: true });
      if (result.code === 200) {
        const dayActivities = (result.data.list || []).map(item => {
          const participantCount = Number(item.participant_count) || 0;
          const totalCount = Number(item.max_participants) || 0;
          const remainCount = Math.max(totalCount - participantCount, 0);
          const status = Number(item.status);
          return {
            ...item,
            time: formatActivityTime(item.activity_time),
            coverUrl: item.cover_url,
            difficultyText: getDifficultyText(item.difficulty),
            participantCount,
            totalCount,
            remainCount,
            isOfficial: Number(item.is_official) === 1,
            isEnded: status === 4,
            statusBadge: this.getStatusBadge(status, remainCount, item.has_registered),
            statusClass: this.getStatusClass(status)
          };
        });
        this.setData({ dayActivities });
      }
    } catch (err) {
      console.error('加载当日活动失败:', err);
    }
  },

  onActivityClick(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/details/details?id=${id}` });
  },

  getStatusBadge(status, remainCount, hasRegistered) {
    if (status === 4) return '已结束';
    if (status === 5) return '已取消';
    if (status === 2) return '已拒绝';
    if (hasRegistered) return '已报名';
    if (status === 1) return remainCount <= 0 ? '已满员' : '可报名';
    return '已截止';
  },

  getStatusClass(status) {
    const statusClassMap = {
      0: 'pending', 1: 'ongoing', 2: 'rejected',
      3: 'active', 4: 'ended', 5: 'cancelled'
    };
    return statusClassMap[status] || 'closed';
  }
});
