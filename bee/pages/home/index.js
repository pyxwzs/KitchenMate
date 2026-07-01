const CONFIG = require('../../config.js')
const PARTY = require('../../utils/party')

Page({
  data: {
    logoPath: CONFIG.logoPath,
    appName: CONFIG.appName,
    displayAvatar: '',
    activeParty: null,
  },

  onLoad() {
    getApp().getUserDetailOK = (apiUserInfoMap) => {
      this.processGotUserDetail(apiUserInfoMap)
    }
  },

  onShow() {
    getApp().ensureLogin().then(apiUserInfoMap => {
      this.processGotUserDetail(apiUserInfoMap)
      this.loadParty()
    }).catch(() => {})
  },

  async loadParty() {
    try {
      const party = await PARTY.syncPartyContext()
      this.setData({ activeParty: party })
    } catch {
      this.setData({ activeParty: null })
    }
  },

  processGotUserDetail(apiUserInfoMap) {
    if (!apiUserInfoMap) {
      return
    }
    this.setData({
      apiUserInfoMap,
      nick: apiUserInfoMap.base.nick,
      displayAvatar: apiUserInfoMap.base.avatarUrl || '',
    })
  },

  onAvatarError() {
    this.setData({ displayAvatar: '/images/who.png' })
  },

  goLogin() {
    wx.reLaunch({ url: '/pages/login/index' })
  },

  goOrder() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/index' })
  },

  goOrders() {
    wx.switchTab({ url: '/pages/all-orders/index' })
  },

  goParty() {
    wx.navigateTo({ url: '/pages/party/index' })
  },
})
