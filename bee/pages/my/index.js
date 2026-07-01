const CONFIG = require('../../config.js')
const API = require('../../utils/api')
const { resolveAssetForDisplay } = require('../../utils/asset')

Page({
  data: {
    nick: '',
    nickShow: false,
    version: CONFIG.version,
    displayAvatar: '',
    apiUserInfoMap: null,
  },

  onLoad() {
    getApp().getUserDetailOK = () => {
      this.loadUserInfo()
    }
  },

  onShow() {
    this.loadUserInfo()
  },

  async loadUserInfo() {
    try {
      await getApp().ensureLogin()
      const user = await API.getMe()
      const apiUserInfoMap = API.normalizeUser(user)
      const displayAvatar = user.avatar_url
        ? await resolveAssetForDisplay(user.avatar_url)
        : ''
      apiUserInfoMap.base.avatarUrl = displayAvatar || apiUserInfoMap.base.avatarUrl
      getApp().globalData.apiUserInfoMap = apiUserInfoMap
      this.setData({
        apiUserInfoMap,
        nick: apiUserInfoMap.base.nick,
        displayAvatar,
      })
    } catch (_) {
      const cached = getApp().globalData.apiUserInfoMap
      if (cached) {
        this.setData({
          apiUserInfoMap: cached,
          nick: cached.base.nick,
          displayAvatar: cached.base.avatarUrl || '',
        })
      }
    }
  },

  async handleLogin() {
    wx.reLaunch({ url: '/pages/login/index' })
  },

  editNick() {
    this.setData({ nickShow: true })
  },

  async _editNick() {
    if (!this.data.nick) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    try {
      await API.updateProfile({ nickname: this.data.nick })
      wx.showToast({ title: '保存成功' })
      await this.loadUserInfo()
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    }
  },

  async onChooseAvatar(e) {
    if (!wx.getStorageSync('token')) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    const tempPath = e.detail.avatarUrl
    this.setData({ displayAvatar: tempPath })
    try {
      await API.uploadAvatar(tempPath)
      wx.showToast({ title: '头像已更新' })
      await this.loadUserInfo()
    } catch (err) {
      wx.showToast({ title: err.message || '上传失败', icon: 'none' })
    }
  },

  onAvatarError() {
    this.setData({ displayAvatar: '/images/default.png' })
  },

  clearStorage() {
    wx.showModal({
      title: '提示',
      content: '确定清除缓存并重新登录吗？',
      success(res) {
        if (res.confirm) {
          wx.clearStorageSync()
          wx.reLaunch({ url: '/pages/login/index' })
        }
      },
    })
  },
})
