const CONFIG = require('../../config.js')
const API = require('../../utils/api')
const { resolveAssetForDisplay } = require('../../utils/asset')
const DIALOG = require('../../utils/dialog')

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
      DIALOG.showToast('请输入昵称', { icon: 'none' })
      return
    }
    try {
      await API.updateProfile({ nickname: this.data.nick })
      DIALOG.showToast('保存成功', { icon: 'success' })
      await this.loadUserInfo()
    } catch (err) {
      DIALOG.showToast(err.message || '保存失败', { icon: 'none' })
    }
  },

  async onChooseAvatar(e) {
    if (!wx.getStorageSync('token')) {
      DIALOG.showToast('请先登录', { icon: 'none' })
      return
    }
    const tempPath = e.detail.avatarUrl
    this.setData({ displayAvatar: tempPath })
    try {
      await API.uploadAvatar(tempPath)
      DIALOG.showToast('头像已更新', { icon: 'success' })
      await this.loadUserInfo()
    } catch (err) {
      DIALOG.showToast(err.message || '上传失败', { icon: 'none' })
    }
  },

  onAvatarError() {
    this.setData({ displayAvatar: '/images/default.png' })
  },

  async clearStorage() {
    const confirmed = await DIALOG.showConfirm({
      title: '提示',
      content: '确定清除缓存并重新登录吗？',
      confirmText: '确定',
    })
    if (!confirmed) return
    wx.clearStorageSync()
    wx.reLaunch({ url: '/pages/login/index' })
  },
})
