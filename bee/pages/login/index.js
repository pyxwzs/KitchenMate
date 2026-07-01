const CONFIG = require('../../config.js')
const AUTH = require('../../utils/auth')
const API = require('../../utils/api')
const PROFILE_GATE = require('../../utils/profileGate')
const JOIN_ACTIONS = require('../../utils/joinActions')
const { resolveAssetForDisplay } = require('../../utils/asset')
const { getErrorMessage } = require('../../utils/error')
const DIALOG = require('../../utils/dialog')

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
    needProfile: false,
    hasExistingAvatar: false,
    pendingActionText: '',
    profileSubmitText: '完成并进入',
  },

  onLoad(options) {
    this._needProfile = options.needProfile === '1'
    this.bootstrap()
  },

  isProfileComplete(user) {
    return API.isProfileComplete(user)
  },

  hasLoginToken() {
    return !!wx.getStorageSync('token')
  },

  refreshPendingUi() {
    const pending = PROFILE_GATE.peekPending()
    const needProfile = this._needProfile || !!pending
    this.setData({
      needProfile,
      pendingActionText: PROFILE_GATE.pendingActionLabel(pending),
      profileSubmitText: pending ? `完成并${PROFILE_GATE.pendingActionLabel(pending)}` : '完成并进入',
    })
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
    const hasExistingAvatar = !!user.avatar_url
    this.refreshPendingUi()
    this.setData({
      showProfilePopup: true,
      isLoggedIn: true,
      logging: false,
      profileError: '',
      nickname: user.nickname || '',
      realName: user.real_name || '',
      avatarUrl: displayAvatar || '',
      displayAvatar: displayAvatar || '',
      avatarTempPath: hasExistingAvatar ? '__existing__' : '',
      hasExistingAvatar,
    })
  },

  async bootstrap() {
    const app = getApp()
    app._loginPromise = null
    this.refreshPendingUi()

    try {
      const loggedIn = await AUTH.checkHasLogined()
      if (!loggedIn) {
        if (this._needProfile) {
          await this.tryLogin()
        }
        return
      }

      const user = await API.getMe()
      if (this.isProfileComplete(user)) {
        const resumed = await this.resumePendingAction()
        if (!resumed) {
          await app.getUserApiInfo()
          this.goHome()
        }
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
        const resumed = await this.resumePendingAction()
        if (!resumed) {
          await app.getUserApiInfo()
          this.goHome()
        }
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
      DIALOG.showToast('请先完成微信登录', { icon: 'none' })
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

  async resumePendingAction() {
    const pending = PROFILE_GATE.consumePending()
    if (!pending) {
      return false
    }

    try {
      if (pending.type === 'family_join') {
        const family = await JOIN_ACTIONS.performFamilyJoin(pending.inviteCode)
        wx.redirectTo({ url: `/pages/family/detail?id=${family.id}` })
        return true
      }
      if (pending.type === 'party_join') {
        const party = await JOIN_ACTIONS.performPartyJoin(pending.joinCode)
        if (pending.redirectToOrder) {
          wx.switchTab({ url: '/pages/index/index' })
        } else {
          wx.redirectTo({ url: '/pages/party/index' })
        }
        return true
      }
    } catch (err) {
      await DIALOG.showError(err, '操作失败')
      return true
    }
    return false
  },

  async submitProfile() {
    const { nickname, realName, avatarTempPath, submitting, isLoggedIn, hasExistingAvatar } = this.data
    if (submitting) {
      return
    }

    if (!isLoggedIn || !this.hasLoginToken()) {
      DIALOG.showToast('请先完成微信登录', { icon: 'none' })
      return
    }

    if (!nickname.trim()) {
      DIALOG.showToast('请填写微信昵称', { icon: 'none' })
      return
    }
    if (!realName.trim()) {
      DIALOG.showToast('请填写真实姓名', { icon: 'none' })
      return
    }
    const needUploadAvatar = avatarTempPath && avatarTempPath !== '__existing__'
    if (!needUploadAvatar && !hasExistingAvatar) {
      DIALOG.showToast('请选择头像', { icon: 'none' })
      return
    }

    this.setData({ submitting: true, profileError: '' })

    try {
      if (needUploadAvatar) {
        await API.uploadAvatar(avatarTempPath)
      }

      await API.updateProfile({
        nickname: nickname.trim(),
        real_name: realName.trim(),
      })

      await getApp().getUserApiInfo()
      this.setData({ showProfilePopup: false, submitting: false })

      const resumed = await this.resumePendingAction()
      if (!resumed) {
        this.goHome()
      }
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
