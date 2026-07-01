const CONFIG = require('../../config.js')
const AUTH = require('../../utils/auth')
const API = require('../../utils/api')
const { resolveAssetForDisplay } = require('../../utils/asset')
const { getErrorMessage } = require('../../utils/error')

Page({
  data: {
    logoPath: CONFIG.logoPath,
    appName: CONFIG.appName,
    logging: false,
    error: '',
    showProfilePopup: false,
    isLoggedIn: false,
    submitting: false,
    profileError: '',
    avatarUrl: '',
    avatarTempPath: '',
    displayAvatar: '',
    nickname: '',
    realName: '',
  },

  onLoad() {
    this.bootstrap()
  },

  isProfileComplete(user) {
    return API.isProfileComplete(user)
  },

  hasLoginToken() {
    return !!wx.getStorageSync('token')
  },

  async openProfilePopup(user) {
    if (!this.hasLoginToken()) {
      this.setData({
        showProfilePopup: false,
        isLoggedIn: false,
      })
      return
    }

    const displayAvatar = await resolveAssetForDisplay(user.avatar_url)
    this.setData({
      showProfilePopup: true,
      isLoggedIn: true,
      logging: false,
      profileError: '',
      nickname: user.nickname || '',
      realName: user.real_name || '',
      avatarUrl: displayAvatar || '',
      displayAvatar: displayAvatar || '',
      avatarTempPath: user.avatar_url ? '' : '',
    })
  },

  async bootstrap() {
    const app = getApp()
    app._loginPromise = null

    try {
      const loggedIn = await AUTH.checkHasLogined()
      if (!loggedIn) {
        return
      }

      const user = await API.getMe()
      if (this.isProfileComplete(user)) {
        await app.getUserApiInfo()
        this.goHome()
        return
      }

      await this.openProfilePopup(user)
    } catch (err) {
      console.error('bootstrap failed', err)
    }
  },

  async tryLogin() {
    if (this.data.logging) {
      return
    }

    this.setData({ logging: true, error: '', profileError: '' })
    const app = getApp()
    app._loginPromise = null

    try {
      await AUTH.authorize()
      const user = await API.getMe()

      if (this.isProfileComplete(user)) {
        await app.getUserApiInfo()
        this.goHome()
        return
      }

      await this.openProfilePopup(user)
    } catch (err) {
      console.error('login failed', err)
      this.setData({
        logging: false,
        isLoggedIn: false,
        showProfilePopup: false,
        error: getErrorMessage(err, '登录失败'),
      })
    }
  },

  onChooseAvatar(e) {
    if (!this.data.isLoggedIn || !this.hasLoginToken()) {
      wx.showToast({ title: '请先完成微信登录', icon: 'none' })
      return
    }

    const avatarUrl = e.detail.avatarUrl
    this.setData({
      avatarUrl,
      avatarTempPath: avatarUrl,
      displayAvatar: avatarUrl,
    })
  },

  onAvatarError() {
    this.setData({ displayAvatar: '/images/who.png' })
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  onRealNameInput(e) {
    this.setData({ realName: e.detail.value })
  },

  async submitProfile() {
    const { nickname, realName, avatarTempPath, submitting, isLoggedIn } = this.data
    if (submitting) {
      return
    }

    if (!isLoggedIn || !this.hasLoginToken()) {
      wx.showToast({ title: '请先完成微信登录', icon: 'none' })
      return
    }

    if (!nickname.trim()) {
      wx.showToast({ title: '请填写微信昵称', icon: 'none' })
      return
    }
    if (!realName.trim()) {
      wx.showToast({ title: '请填写真实姓名', icon: 'none' })
      return
    }
    if (!avatarTempPath) {
      wx.showToast({ title: '请选择头像', icon: 'none' })
      return
    }

    this.setData({ submitting: true, profileError: '' })

    try {
      await API.uploadAvatar(avatarTempPath)

      await API.updateProfile({
        nickname: nickname.trim(),
        real_name: realName.trim(),
      })

      await getApp().getUserApiInfo()
      this.setData({ showProfilePopup: false, submitting: false })
      this.goHome()
    } catch (err) {
      this.setData({
        submitting: false,
        profileError: getErrorMessage(err, '保存失败'),
      })
    }
  },

  goHome() {
    wx.switchTab({
      url: '/pages/home/index',
    })
  },
})
