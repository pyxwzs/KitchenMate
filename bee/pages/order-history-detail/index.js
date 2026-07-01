const ORDER = require('../../utils/order')

Page({
  data: {
    order: null,
    statusClass: ORDER.STATUS_CLASS,
  },

  onLoad(options) {
    const order = wx.getStorageSync('_history_order_detail')
    wx.removeStorageSync('_history_order_detail')
    if (!order || String(order.id) !== String(options.id || '')) {
      wx.showToast({ title: '订单不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    this.setData({ order })
  },

  onUnload() {
    wx.removeStorageSync('_history_order_detail')
  },
})
