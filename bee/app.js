const CONFIG = require('config.js')
const AUTH = require('utils/auth')
const API = require('utils/api')
const { resolveAssetForDisplay } = require('utils/asset')
const i18n = require("i18n/index")
const { getErrorMessage, isNetworkError } = require('utils/error')
const DIALOG = require('utils/dialog')

App({
  onLaunch: function() {
    i18n.getLanguage()
    this.setTabBarLanguage()
    const $t = i18n.$t()
    if (!CONFIG.useDevLogin) {
      const AUTH_VERSION_KEY = 'authSessionVersion'
      if (wx.getStorageSync(AUTH_VERSION_KEY) !== CONFIG.authSessionVersion) {
        AUTH.loginOut()
        wx.setStorageSync(AUTH_VERSION_KEY, CONFIG.authSessionVersion)
      }
    }
    if (!CONFIG.useDevLogin && wx.getStorageSync('loginType') === 'dev') {
      AUTH.loginOut()
    }
    const that = this
    const updateManager = wx.getUpdateManager()
    updateManager.onUpdateReady(function () {
      DIALOG.showConfirm({
        title: '更新提示',
        content: $t.common.upgrade,
        confirmText: $t.common.confirm,
        cancelText: $t.common.cancel,
      }).then((confirmed) => {
        if (confirmed) {
          updateManager.applyUpdate()
        }
      })
    })
    wx.getNetworkType({
      success(res) {
        if (res.networkType === 'none') {
          that.globalData.isConnected = false
          DIALOG.showToast('网络异常', { icon: 'none' })
        }
      }
    })
    wx.onNetworkStatusChange(function(res) {
      if (!res.isConnected) {
        that.globalData.isConnected = false
        DIALOG.showToast('网络异常', { icon: 'none' })
      } else {
        that.globalData.isConnected = true
        DIALOG.hideToast()
      }
    })
  },

  onShow() {
    const pages = getCurrentPages()
    const currentRoute = pages.length ? pages[pages.length - 1].route : ''
    // 扫码加入聚会/家庭时由页面自行静默登录，避免被全局 ensureLogin 打断
    const selfAuthRoutes = ['pages/login/index', 'pages/party/index', 'pages/family/join']
    if (selfAuthRoutes.includes(currentRoute)) {
      return
    }
    this.ensureLogin().catch(err => {
      console.error('show login failed', err)
    })
  },

  initLanguage(_this) {
    _this.setData({
      language: i18n.getLanguage(),
      $t: i18n.$t(),
    })
  },

  changeLang(_this) {
    const langs = i18n.langs
    const nameArray = langs.map(ele => ele.name)
    wx.showActionSheet({
      itemList: nameArray,
      success: (e) => {
        const lang = langs[e.tapIndex]
        wx.setStorageSync('Language', lang.code)
        _this.setData({
          language: i18n.getLanguage(),
          $t: i18n.$t(),
        })
        this.setTabBarLanguage()
      }
    })
  },

  setTabBarLanguage() {
    i18n.setTabBarLanguage()
  },

  ensureLogin() {
    if (this._loginPromise) {
      return this._loginPromise
    }
    this._loginPromise = AUTH.checkHasLogined()
      .then(isLogined => {
        if (!isLogined) {
          this._loginPromise = null
          return AUTH.authorize()
        }
      })
      .then(() => this.getUserApiInfo())
      .then(async (apiUserInfoMap) => {
        try {
          const user = await API.getMe()
          if (!API.isProfileComplete(user)) {
            const pages = getCurrentPages()
            const currentRoute = pages.length ? pages[pages.length - 1].route : ''
            if (currentRoute !== 'pages/login/index') {
              wx.reLaunch({ url: '/pages/login/index' })
            }
          }
        } catch (_) {
          // ignore
        }
        return apiUserInfoMap
      })
      .catch(err => {
        this._loginPromise = null
        DIALOG.showToast(getErrorMessage(err, '登录失败'), { icon: 'none', duration: 2500 })
        if (!isNetworkError(err)) {
          const pages = getCurrentPages()
          const currentRoute = pages.length ? pages[pages.length - 1].route : ''
          if (currentRoute !== 'pages/login/index') {
            wx.reLaunch({
              url: '/pages/login/index',
            })
          }
        }
        throw err
      })
    return this._loginPromise
  },

  async getUserApiInfo() {
    const token = wx.getStorageSync('token')
    if (!token) {
      return null
    }
    try {
      const user = await API.getMe()
      const apiUserInfoMap = API.normalizeUser(user)
      apiUserInfoMap.base.avatarUrl = await resolveAssetForDisplay(user.avatar_url)
      this.globalData.apiUserInfoMap = apiUserInfoMap
      if (this.getUserDetailOK) {
        this.getUserDetailOK(apiUserInfoMap)
      }
      return apiUserInfoMap
    } catch (e) {
      console.error('getUserApiInfo failed', e)
      return null
    }
  },

  globalData: {
    isConnected: true,
    apiUserInfoMap: null,
  }
})
