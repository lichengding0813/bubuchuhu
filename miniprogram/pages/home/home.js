Page({
  data: {
    showAll: false, // 是否展开全部
    // 活动列表数据 - 增加到6个以测试展开效果
    activityList: [{
        id: 1,
        name: '周末城市徒步',
        time: '05/20 15:00',
        location: '市中心公园',
        remainCount: 8,
        totalCount: 20,
        difficulty: '⭐ 简单',
        statusText: '进行中',
        statusBadge: '可报名',
        statusClass: 'ongoing'
      },
      {
        id: 2,
        name: '露营烧烤夜',
        time: '05/25 18:00',
        location: '星野营地',
        remainCount: 0,
        totalCount: 15,
        difficulty: '⭐⭐ 中等',
        statusText: '已满员',
        statusBadge: '已截止',
        statusClass: 'closed'
      },
      {
        id: 3,
        name: '读书分享会',
        time: '05/28 14:00',
        location: '静安图书馆',
        remainCount: 12,
        totalCount: 30,
        difficulty: '⭐ 轻松',
        statusText: '报名中',
        statusBadge: '新活动',
        statusClass: 'ongoing'
      },
      {
        id: 4,
        name: '溯溪探险之旅',
        time: '06/03 09:00',
        location: '桐庐峡谷',
        remainCount: 5,
        totalCount: 12,
        difficulty: '⭐⭐⭐ 挑战',
        statusText: '报名中',
        statusBadge: '热门',
        statusClass: 'ongoing'
      },
      {
        id: 5,
        name: '夜爬西山看日出',
        time: '06/10 23:00',
        location: '西山国家森林公园',
        remainCount: 3,
        totalCount: 10,
        difficulty: '⭐⭐ 中等',
        statusText: '即将开始',
        statusBadge: '余位少',
        statusClass: 'ongoing'
      },
      {
        id: 6,
        name: '摄影采风徒步',
        time: '06/17 13:00',
        location: '朱家角古镇',
        remainCount: 15,
        totalCount: 20,
        difficulty: '⭐ 简单',
        statusText: '报名中',
        statusBadge: '新活动',
        statusClass: 'ongoing'
      }
    ]
  },

  onLoad() {
    console.log('首页加载完成')
  },

  // 点击展开/收起
  onToggleExpand() {
    this.setData({
      showAll: !this.data.showAll
    })
  },

  // 点击发布活动按钮
  onPublishClick() {
    wx.navigateTo({
      url: '/pages/publish/publish'
    })
  },

  // 点击单个活动卡片
  onActivityClick(e) {
    const {
      id
    } = e.currentTarget.dataset

    // 跳转到活动详情页
    wx.navigateTo({
      url: `/pages/details/details?id=${id}`
    })
  }
})