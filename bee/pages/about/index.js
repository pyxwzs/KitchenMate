const CONFIG = require('../../config.js')

Page({
  data: {
    logoPath: CONFIG.logoPath,
    appName: CONFIG.appName,
    version: CONFIG.version,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '关于我们' })
  },
})
