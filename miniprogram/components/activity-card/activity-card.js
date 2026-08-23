/**
 * 活动卡片组件
 * 
 * Properties:
 *   activity: Object - 活动数据（需包含 id, name, time, location 等字段）
 *   isEnded: Boolean - 是否为已结束活动（影响样式）
 * 
 * Events:
 *   click: 点击卡片，携带 { id }
 */
const { formatActivityTime, getDifficultyText } = require('../../utils/time.js');

Component({
  properties: {
    activity: {
      type: Object,
      value: {}
    },
    isEnded: {
      type: Boolean,
      value: false
    }
  },

  observers: {
    'activity': function(activity) {
      if (!activity || !activity.id) return;

      const participantCount = Number(activity.participant_count) || 0;
      const remainCount = (activity.max_participants || 0) - participantCount;
      const isEnded = this.properties.isEnded || Number(activity.status) === 4;

      this.setData({
        _time: formatActivityTime(activity.activity_time),
        _difficulty: getDifficultyText(activity.difficulty),
        _remainCount: remainCount,
        _totalCount: activity.max_participants || 0,
        _participantCount: participantCount,
        _statusBadge: this._getStatusBadge(activity, remainCount),
        _statusClass: this._getStatusClass(activity.status),
        _isEnded: isEnded
      });
    }
  },

  data: {
    _time: '',
    _difficulty: '',
    _remainCount: 0,
    _totalCount: 0,
    _participantCount: 0,
    _statusBadge: '',
    _statusClass: '',
    _isEnded: false
  },

  methods: {
    _getStatusBadge(activity, remainCount) {
      if (activity.status === 4) return '已结束';
      if (activity.status === 5) return '已取消';
      if (activity.status === 2) return '已拒绝';
      if (activity.has_registered) return '已报名';
      if (activity.status === 1) {
        if (remainCount <= 0) return '已满员';
        return '可报名';
      }
      return '已截止';
    },

    _getStatusClass(status) {
      const map = { 0: 'pending', 1: 'ongoing', 2: 'rejected', 3: 'active', 4: 'ended', 5: 'cancelled' };
      return map[status] || 'closed';
    },

    onClick() {
      this.triggerEvent('click', { id: this.properties.activity.id });
    }
  }
});
