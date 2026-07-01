const FAMILY = require('../../utils/family')
const AUTH = require('../../utils/auth')
const SCAN = require('../../utils/scan')
const MENU = require('../../utils/menu')

Page({
  data: {
    inviteCode: '',
    joinState: 'idle', // idle | loading | success | error
    joinTitle: '',
    joinSubtitle: '',
    joinError: '',
  },

  onLoad(options) {
    if (options.scene) {
      const raw = decodeURIComponent(options.scene || '').trim().toUpperCase()
      if (/^[A-Z0-9]{4,10}$/.test(raw)) {
        this._sceneInviteCode = raw
      }
    }
  },

  onShow() {
    if (this._sceneInviteCode) {
      const code = this._sceneInviteCode
      this._sceneInviteCode = null
      this.doJoin(code, { fromScan: true })
    }
  },

  onInput(e) {
    this.setData({ inviteCode: e.detail.value.toUpperCase(), joinState: 'idle' })
  },

  async scanToJoin() {
    try {
      const code = await SCAN.scanJoinCode('family')
      if (!code) return
      this.setData({ inviteCode: code })
      this.doJoin(code, { fromScan: true })
    } catch (err) {
      this.setData({
        joinState: 'error',
        joinError: err.message || '扫码失败',
      })
    }
  },

  submitJoin() {
    const inviteCode = this.data.inviteCode.trim()
    if (!inviteCode) {
      this.setData({
        joinState: 'error',
        joinError: '请输入邀请码',
      })
      return
    }
    this.doJoin(inviteCode)
  },

  dismissError() {
    this.setData({ joinState: 'idle', joinError: '' })
  },

  async doJoin(inviteCode, { fromScan = false } = {}) {
    this.setData({
      joinState: 'loading',
      inviteCode,
      joinError: '',
      joinTitle: '',
      joinSubtitle: '',
    })

    try {
      await AUTH.silentLogin()
      const family = await FAMILY.joinFamily(inviteCode)
      MENU.setCurrentFamilyId(family.id)
      this.setData({
        joinState: 'success',
        joinTitle: `已加入「${family.name}」`,
        joinSubtitle: fromScan ? '欢迎回家，即将进入家庭' : '即将进入家庭详情',
      })
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/family/detail?id=${family.id}` })
      }, 1200)
    } catch (err) {
      this.setData({
        joinState: 'error',
        joinError: err.message || '加入失败，请检查邀请码',
      })
    }
  },
})
