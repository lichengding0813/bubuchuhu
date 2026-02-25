Page({
  data: {
    reviewList: [
      {
        id: 1,
        name: '城市徒步回顾',
        time: '05/20',
        location: '市中心公园',
        photos: 12,
        participants: 18
      },
      {
        id: 2,
        name: '露营烧烤精彩瞬间',
        time: '05/25',
        location: '星野营地',
        photos: 24,
        participants: 15
      }
    ]
  },

  onLoad() {
    console.log('活动回顾页面加载')
  },

  onReviewClick(e) {
    const { id } = e.currentTarget.dataset

    // 跳转到详情页
    wx.navigateTo({
      url: `/pages/review-detail/review-detail?id=${id}`
    })
  }
})