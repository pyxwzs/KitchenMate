const FAMILY = require('../../utils/family')
const SCAN = require('../../utils/scan')
const MENU = require('../../utils/menu')
const DIALOG = require('../../utils/dialog')
const PROFILE_GATE = require('../../utils/profileGate')
const JOIN_ACTIONS = require('../../utils/joinActions')

Page({
  data: {
    inviteCode: '',
    joinState: 'idle', // idle | loading | success
    joinTitle: '',
    joinSubtitle: '',
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
      await DIALOG.showError(err, '扫码失败')
      this.setData({ joinState: 'idle' })
    }
  },

  async submitJoin() {
    const inviteCode = this.data.inviteCode.trim()
    if (!inviteCode) {
      await DIALOG.showAlert('请输入邀请码')
      return
    }
    this.doJoin(inviteCode)
  },

  async doJoin(inviteCode, options) {
    options = options || {}
    const fromScan = !!options.fromScan
    this.setData({
      joinState: 'loading',
      inviteCode,
      joinTitle: '',
      joinSubtitle: '',
    })

    try {
      const ready = await PROFILE_GATE.ensureProfileReady({
        pending: {
          type: 'family_join',
          inviteCode,
          fromScan: !!fromScan,
        },
      })
      if (!ready.ok) {
        this.setData({ joinState: 'idle' })
        return
      }

      const family = await JOIN_ACTIONS.performFamilyJoin(inviteCode)
      this.setData({
        joinState: 'success',
        joinTitle: `已加入「${family.name}」`,
        joinSubtitle: fromScan ? '欢迎回家，即将进入家庭' : '即将进入家庭详情',
      })
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/family/detail?id=${family.id}` })
      }, 1200)
    } catch (err) {
      this.setData({ joinState: 'idle' })
      await DIALOG.showError(err, '加入失败，请检查邀请码')
    }
  },
})
