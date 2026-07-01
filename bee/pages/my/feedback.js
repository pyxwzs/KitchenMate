Page({
  data: {
    autosize: {
      minHeight: 100,
    },
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '意见反馈' })
  },

  bindSave() {
    if (!this.data.name) {
      wx.showToast({ title: '请填写姓名', icon: 'none' })
      return
    }
    if (!this.data.content) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' })
      return
    }
    wx.showToast({ title: '感谢反馈' })
    setTimeout(() => {
      wx.navigateBack()
    }, 1000)
  },

  afterPicRead(e) {
    const picsList = (this.data.picsList || []).concat(e.detail.file)
    this.setData({ picsList })
  },

  afterPicDel(e) {
    const picsList = this.data.picsList || []
    picsList.splice(e.detail.index, 1)
    this.setData({ picsList })
  },
})
