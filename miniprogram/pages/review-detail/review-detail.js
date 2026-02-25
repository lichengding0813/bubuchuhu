Page({
  data: {
    userParticipated: true, // 当前用户是否参与
    isOrganizer: false, // 当前用户是否是发起人
    commentText: '',
    showPhotoPreview: false,
    currentPhotoIndex: 0,
    hasMorePhotos: false,
    
    // 回顾数据
    reviewData: {
      id: 1,
      name: '周末城市徒步回顾',
      cover: '',
      date: '2024-05-20',
      time: '2024-05-20 15:00',
      location: '市中心公园',
      difficulty: '⭐ 简单',
      distance: 10,
      climb: 200,
      participants: 18,
      summary: `
        <p style="margin-bottom: 12px;">这次周末城市徒步活动圆满结束啦！感谢各位wmls的参与～</p>
        <p style="margin-bottom: 12px;">我们一起从公园南门出发，沿着湖畔栈道，最终到达山顶观景台。天气很好，微风不燥，大家一路说说笑笑，还遇到了几只可爱的小松鼠🐿️</p>
        <p style="margin-bottom: 12px;">在山顶大家一起看了日落，拍了好多美照！期待下次再见～</p>
      `,
      summaryTime: '2024-05-21 10:30',
      photos: [
        { url: '', uploader: '小明', status: 'approved' },
        { url: '', uploader: '小红', status: 'approved' },
        { url: '', uploader: '小张', status: 'approved' },
        { url: '', uploader: '小李', status: 'pending' },
        { url: '', uploader: '小王', status: 'approved' },
        { url: '', uploader: '小刘', status: 'approved' }
      ]
    },
    
    // 评论数据
    comments: [
      {
        avatar: '',
        name: '小明',
        time: '2小时前',
        content: '太好玩了！下次还要来～'
      },
      {
        avatar: '',
        name: '小红',
        time: '3小时前',
        content: '照片拍得真好，求原图！'
      },
      {
        avatar: '',
        name: '小张',
        time: '5小时前',
        content: '感谢组织，期待下次活动！'
      }
    ]
  },

  onLoad(options) {
    const { id } = options
    console.log('回顾详情页加载，回顾ID:', id)
    // 根据id从服务器获取回顾详情
    this.loadReviewDetail(id)
  },

  // 加载回顾详情
  loadReviewDetail(id) {
    // 这里应该调用接口获取数据
    // 模拟判断用户是否是发起人
    this.setData({
      isOrganizer: false
    })
  },

  // 上传照片
  onUploadPhoto() {
    wx.chooseImage({
      count: 9,
      success: (res) => {
        const tempFiles = res.tempFilePaths
        wx.showLoading({
          title: '上传中...',
        })
        
        // 模拟上传
        setTimeout(() => {
          wx.hideLoading()
          wx.showToast({
            title: '上传成功，等待审核',
            icon: 'success'
          })
          
          // 添加上传的照片（审核中状态）
          const newPhotos = tempFiles.map((url, index) => ({
            url: url,
            uploader: '我',
            status: 'pending'
          }))
          
          this.setData({
            'reviewData.photos': [...newPhotos, ...this.data.reviewData.photos]
          })
        }, 2000)
      }
    })
  },

  // 点击照片
  onPhotoClick(e) {
    const { index } = e.currentTarget.dataset
    this.setData({
      showPhotoPreview: true,
      currentPhotoIndex: index
    })
  },

  // 关闭照片预览
  onPhotoPreviewClose() {
    this.setData({
      showPhotoPreview: false
    })
  },

  // 滑动轮播图
  onSwiperChange(e) {
    this.setData({
      currentPhotoIndex: e.detail.current
    })
  },

  // 加载更多照片
  onLoadMorePhotos() {
    wx.showLoading({
      title: '加载中...',
    })
    
    // 模拟加载更多
    setTimeout(() => {
      wx.hideLoading()
      // 这里添加加载更多逻辑
      this.setData({
        hasMorePhotos: false
      })
    }, 1000)
  },

  // 评论输入变化
  onCommentInput(e) {
    this.setData({
      commentText: e.detail.value
    })
  },

  // 提交评论
  onSubmitComment() {
    if (!this.data.commentText) {
      return
    }

    wx.showLoading({
      title: '发表中...',
    })

    // 模拟发表评论
    setTimeout(() => {
      wx.hideLoading()
      
      const newComment = {
        avatar: '',
        name: '我',
        time: '刚刚',
        content: this.data.commentText
      }
      
      this.setData({
        comments: [newComment, ...this.data.comments],
        commentText: ''
      })
      
      wx.showToast({
        title: '评论成功',
        icon: 'success'
      })
    }, 1000)
  },

  // 返回上一页
  onBackClick() {
    wx.navigateBack({
      delta: 1
    })
  },

  // 分享设置
  onShareAppMessage() {
    return {
      title: this.data.reviewData.name,
      path: `/pages/review-detail/review-detail?id=${this.data.reviewData.id}`
    }
  }
})