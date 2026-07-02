const CONFIG = require('../../config.js')
const FAMILY = require('../../utils/family')
const FAMILY_SWITCH = require('../../utils/familySwitch')
const MENU = require('../../utils/menu')
const PARTY = require('../../utils/party')
const DIALOG = require('../../utils/dialog')

Page({
  data: {
    logoPath: CONFIG.logoPath,
    appName: CONFIG.appName,
    displayAvatar: '',
    activeParty: null,
    currentFamilyId: null,
    currentFamilyName: '',
    canSwitchFamily: false,
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
      this.loadCurrentFamily()
    }).catch(() => {})
  },

  async loadCurrentFamily() {
    try {
      const families = await FAMILY.listFamilies()
      const currentFamilyId = MENU.getCurrentFamilyId()
      const current = families.find((f) => Number(f.id) === Number(currentFamilyId)) || families[0]
      if (current) {
        MENU.setCurrentFamilyId(current.id)
      }
      this.setData({
        currentFamilyId: current ? current.id : null,
        currentFamilyName: current ? current.name : '',
        canSwitchFamily: families.length > 1,
      })
    } catch {
      this.setData({
        currentFamilyId: null,
        currentFamilyName: '',
        canSwitchFamily: false,
      })
    }
  },

  showFamilyPicker() {
    const { currentFamilyId, canSwitchFamily } = this.data
    if (!canSwitchFamily) return
    FAMILY.listFamilies().then((families) => {
      FAMILY_SWITCH.pickFamily(families, currentFamilyId).then((picked) => {
        if (!picked || Number(picked.id) === Number(currentFamilyId)) return
        FAMILY_SWITCH.applyFamilySwitch(picked)
        this.setData({
          currentFamilyId: picked.id,
          currentFamilyName: picked.name,
        })
        DIALOG.showToast(`已切换到「${picked.name}」`, { icon: 'none' })
      })
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
