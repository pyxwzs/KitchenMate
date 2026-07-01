const API = require('../../utils/api')
const { resolveAssetForDisplay } = require('../../utils/asset')
const FAMILY = require('../../utils/family')
const MENU = require('../../utils/menu')
const PARTY = require('../../utils/party')

Page({
  data: {
    familyId: null,
    family: null,
    roleLabels: FAMILY.ROLE_LABELS,
    isAdmin: false,
    isCook: false,
    isOnlyAdmin: false,
    myUserId: null,
    shareText: '',
    activeParty: null,
    qrPopupShow: false,
    qrImagePath: '',
    qrIsOfficial: false,
  },

  onLoad(options) {
    const familyId = Number(options.id)
    MENU.setCurrentFamilyId(familyId)
    this.setData({
      familyId,
      myUserId: wx.getStorageSync('uid'),
    })
    this.loadDetail()
  },

  async formatMember(member) {
    const user = member.user || {}
    const displayName = user.real_name || user.nickname || `用户${user.id}`
    return {
      ...member,
      displayName,
      avatarUrl: await resolveAssetForDisplay(user.avatar_url),
    }
  },

  async loadDetail() {
    const { familyId } = this.data
    try {
      const family = await FAMILY.getFamilyDetail(familyId)
      family.members = await Promise.all(
        (family.members || []).map(item => this.formatMember(item))
      )
      const cookId = family.cook && family.cook.id
      const isAdmin = family.my_role === 'admin'
      const adminCount = (family.members || []).filter(m => m.role === 'admin').length
      const isOnlyAdmin = isAdmin && adminCount <= 1

      const [invite, activeParty] = await Promise.all([
        FAMILY.getInviteInfo(familyId),
        PARTY.getActiveParty(familyId).catch(() => null),
      ])

      if (activeParty && activeParty.status === 'active') {
        PARTY.setPartyContext(activeParty)
      }

      this.setData({
        family,
        shareText: invite.share_text,
        isAdmin,
        isCook: cookId === this.data.myUserId,
        isOnlyAdmin,
        activeParty,
      })
    } catch (err) {
      wx.showToast({
        title: err.message || '加载失败',
        icon: 'none',
      })
    }
  },

  copyInviteCode() {
    wx.setClipboardData({
      data: this.data.family.invite_code,
      success: () => wx.showToast({ title: '邀请码已复制' }),
    })
  },

  copyShareText() {
    wx.setClipboardData({
      data: this.data.shareText,
      success: () => wx.showToast({ title: '邀请文案已复制' }),
    })
  },

  async showQrCode() {
    const { family } = this.data
    if (!family) return
    this.setData({ qrPopupShow: true, qrImagePath: '', qrIsOfficial: false })
    try {
      const path = await FAMILY.downloadFamilyWxacode(family.id)
      this.setData({ qrImagePath: path, qrIsOfficial: true })
    } catch (_) {
      this.setData({ qrImagePath: '' })
    }
  },

  hideQrCode() {
    this.setData({ qrPopupShow: false })
  },

  saveQrCode() {
    const { qrImagePath } = this.data
    if (!qrImagePath) return
    wx.saveImageToPhotosAlbum({
      filePath: qrImagePath,
      success: () => wx.showToast({ title: '已保存到相册' }),
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('auth')) {
          wx.showToast({ title: '请先授权访问相册', icon: 'none' })
        }
      },
    })
  },

  onMemberTap(e) {
    const member = e.currentTarget.dataset.member
    if (!this.data.isAdmin || member.user_id === this.data.myUserId) {
      return
    }

    wx.showActionSheet({
      itemList: ['设为管理员', '设为厨师', '设为食客', '移出家庭'],
      itemColor: '#333333',
      success: async (res) => {
        if (res.tapIndex === 3) {
          this.confirmRemoveMember(member)
          return
        }
        const roles = ['admin', 'chef', 'diner']
        const role = roles[res.tapIndex]
        try {
          await FAMILY.updateMemberRole(this.data.familyId, member.id, role)
          wx.showToast({ title: '角色已更新' })
          this.loadDetail()
        } catch (err) {
          wx.showToast({
            title: err.message || '更新失败',
            icon: 'none',
          })
        }
      },
    })
  },

  confirmRemoveMember(member) {
    wx.showModal({
      title: '移出成员',
      content: `确定将「${member.displayName}」移出家庭吗？`,
      confirmText: '移出',
      confirmColor: '#e64340',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await FAMILY.removeMember(this.data.familyId, member.id)
          wx.showToast({ title: '已移出' })
          this.loadDetail()
        } catch (err) {
          wx.showToast({ title: err.message || '操作失败', icon: 'none' })
        }
      },
    })
  },

  leaveFamily() {
    const { family, isOnlyAdmin } = this.data
    if (isOnlyAdmin) {
      wx.showToast({ title: '请先指定其他管理员再退出', icon: 'none' })
      return
    }
    wx.showModal({
      title: '退出家庭',
      content: `确定退出「${family.name}」吗？退出后将无法查看该家庭菜单和订单。`,
      confirmText: '退出',
      confirmColor: '#e64340',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await FAMILY.leaveFamily(this.data.familyId)
          this.afterLeaveFamily()
          wx.showToast({ title: '已退出家庭' })
          setTimeout(() => {
            wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/family/index' }) })
          }, 500)
        } catch (err) {
          wx.showToast({ title: err.message || '退出失败', icon: 'none' })
        }
      },
    })
  },

  afterLeaveFamily() {
    const { familyId } = this.data
    const currentId = MENU.getCurrentFamilyId()
    if (Number(currentId) === familyId) {
      wx.removeStorageSync(MENU.CURRENT_FAMILY_KEY)
    }
    const partyCtx = PARTY.getPartyContext()
    if (partyCtx && partyCtx.familyId === familyId) {
      PARTY.clearPartyContext()
    }
  },

  deleteFamily() {
    const { family } = this.data
    wx.showModal({
      title: '删除家庭',
      content: `确定删除「${family.name}」吗？所有成员、订单和聚会记录将被永久删除，此操作不可恢复。`,
      confirmText: '删除',
      confirmColor: '#e64340',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await FAMILY.deleteFamily(this.data.familyId)
          this.afterLeaveFamily()
          wx.showToast({ title: '家庭已删除' })
          setTimeout(() => {
            wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/family/index' }) })
          }, 500)
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        }
      },
    })
  },

  goOrder() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goMyDishes() {
    wx.navigateTo({ url: '/pages/my/dishes' })
  },

  goParty() {
    wx.navigateTo({ url: '/pages/party/index' })
  },

  startParty() {
    const { familyId } = this.data
    wx.navigateTo({ url: `/pages/party/index?familyId=${familyId}` })
  },
})
