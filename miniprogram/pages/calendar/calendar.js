const { get } = require('../../utils/api');

Page({
  data: {
    year: 0,
    month: 0,
    days: [],
    selectedDate: '',
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
    for (let i = 0; i < firstDay; i++) days.push({ isEmpty: true, day: '' });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
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
    this.setData({ year, month }, () => this.loadCalendar());
  },

  nextMonth() {
    let { year, month } = this.data;
    if (month === 12) { year++; month = 1; } else { month++; }
    this.setData({ year, month }, () => this.loadCalendar());
  },

  async onDateTap(e) {
    const dateStr = e.currentTarget.dataset.date;
    if (!dateStr) return;
    this.setData({ selectedDate: dateStr });
    try {
      const { year, month } = this.data;
      const result = await get('/api/activity/calendar', { year, month, date: dateStr }, { silent: true });
      if (result.code === 200) {
        this.setData({ dayActivities: result.data.list || [] });
      }
    } catch (err) {
      console.error('加载当日活动失败:', err);
    }
  },

  onActivityClick(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/details/details?id=${id}` });
  }
});
