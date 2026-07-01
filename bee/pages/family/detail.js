const { resolveAssetForDisplay } = require('../../utils/asset')
const FAMILY = require('../../utils/family')
const MENU = require('../../utils/menu')
const PARTY = require('../../utils/party')
const DIALOG = require('../../utils/dialog')

Page({
  data: {
    familyId: null,
    family: null,
    roleLabels: FAMILY.ROLE_LABELS,
    isAdmin: false,
    isOwner: false,
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

  onShow() {
    if (this.data.familyId) {
      this.refreshActiveParty()
    }
  },

  async refreshActiveParty() {
    const { familyId } = this.data
    if (!familyId) return
    try {
      const activeParty = await PARTY.getActiveParty(familyId)
      if (activeParty && PARTY.hasJoinedParty(activeParty)) {
        PARTY.setPartyContext(activeParty)
      }
      this.setData({ activeParty: activeParty && activeParty.status === 'active' ? activeParty : null })
    } catch {
      // ignore polling errors
    }
  },

  async formatMember(member) {
    const user = member.user || {}
    const displayName = user.real_name || user.nickname || `用户${user.id}`
    const roleLabel = FAMILY.displayRole(member.role, member.is_owner)
    const manageable = FAMILY.canManageMember(
      {
        isAdmin: this.data.isAdmin,
        isOwner: this.data.isOwner,
        myUserId: this.data.myUserId,
      },
      member
    )
    return {
      ...member,
      displayName,
      roleLabel,
      manageable,
      avatarUrl: await resolveAssetForDisplay(user.avatar_url),
    }
  },

  async loadDetail() {
    const { familyId } = this.data
    try {
      const family = await FAMILY.getFamilyDetail(familyId)
      const isAdmin = family.my_role === 'admin'
      const isOwner = !!family.my_is_owner
      const adminCount = (family.members || []).filter(m => m.role === 'admin').length
      const isOnlyAdmin = isAdmin && adminCount <= 1

      this.setData({ isAdmin, isOwner, isOnlyAdmin })

      family.members = await Promise.all(
        (family.members || []).map(item => this.formatMember(item))
      )
      const menuMembers = family.menu_members || family.cooks || (family.cook ? [family.cook] : [])

      const [invite, activeParty] = await Promise.all([
        FAMILY.getInviteInfo(familyId),
        PARTY.getActiveParty(familyId).catch(() => null),
      ])

      if (activeParty && activeParty.status === 'active' && PARTY.hasJoinedParty(activeParty)) {
        PARTY.setPartyContext(activeParty)
      }

      this.setData({
        family: {
          ...family,
          myRoleLabel: FAMILY.displayRole(family.my_role, isOwner),
          menuMembers,
          menuMembersLabel: menuMembers.map((c) => c.display_name).join('、'),
        },
        shareText: invite.share_text,
        activeParty: activeParty && activeParty.status === 'active' ? activeParty : null,
      })
    } catch (err) {
      await DIALOG.showError(err, '加载失败')
    }
  },

  copyInviteCode() {
    wx.setClipboardData({
      data: this.data.family.invite_code,
      success: () => DIALOG.showToast('邀请码已复制', { icon: 'success' }),
    })
  },

  copyShareText() {
    wx.setClipboardData({
      data: this.data.shareText,
      success: () => DIALOG.showToast('邀请文案已复制', { icon: 'success' }),
    })
  },

  async showQrCode() {
    const { family } = this.data
    if (!family) return
    this.setData({ qrPopupShow: true, qrImagePath: '', qrIsOfficial: false })
    try {
      const { path, isOfficial } = await FAMILY.downloadFamilyWxacode(family.id)
      this.setData({ qrImagePath: path, qrIsOfficial: isOfficial })
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
      success: () => DIALOG.showToast('已保存到相册', { icon: 'success' }),
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('auth')) {
          DIALOG.showToast('请先授权访问相册', { icon: 'none' })
        }
      },
    })
  },

  onMemberTap(e) {
    const member = e.currentTarget.dataset.member
    if (!member.manageable) {
      if (this.data.isAdmin && member.role === 'admin' && !member.is_owner) {
        DIALOG.showAlert('仅超级管理员可管理其他管理员')
      }
      return
    }

    const isTargetAdmin = member.role === 'admin'
    const itemList = isTargetAdmin
      ? ['设为成员', '移出家庭']
      : ['设为管理员', '移出家庭']

    wx.showActionSheet({
      itemList,
      itemColor: '#333333',
      success: async (res) => {
        if (res.tapIndex === 1) {
          this.confirmRemoveMember(member)
          return
        }
        const role = isTargetAdmin ? 'member' : 'admin'
        try {
          await FAMILY.updateMemberRole(this.data.familyId, member.id, role)
          DIALOG.showToast('角色已更新', { icon: 'success' })
          this.loadDetail()
        } catch (err) {
          await DIALOG.showError(err, '更新失败')
        }
      },
    })
  },

  async confirmRemoveMember(member) {
    const confirmed = await DIALOG.showConfirm({
      title: '移出成员',
      content: `确定将「${member.displayName}」移出家庭吗？`,
      confirmText: '移出',
    })
    if (!confirmed) return
    try {
      await FAMILY.removeMember(this.data.familyId, member.id)
      DIALOG.showToast('已移出', { icon: 'success' })
      this.loadDetail()
    } catch (err) {
      await DIALOG.showError(err, '操作失败')
    }
  },

  async leaveFamily() {
    const { family, isOnlyAdmin } = this.data
    if (isOnlyAdmin) {
      DIALOG.showAlert('你是唯一管理员，需先将其他成员设为管理员后才能退出')
      return
    }
    const confirmed = await DIALOG.showConfirm({
      title: '退出家庭',
      content: `确定退出「${family.name}」吗？退出后将无法查看该家庭菜单和订单。`,
      confirmText: '退出',
    })
    if (!confirmed) return
    try {
      await FAMILY.leaveFamily(this.data.familyId)
      this.afterLeaveFamily()
      DIALOG.showToast('已退出家庭', { icon: 'success' })
      setTimeout(() => {
        wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/family/index' }) })
      }, 500)
    } catch (err) {
      await DIALOG.showError(err, '退出失败')
    }
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

  async deleteFamily() {
    const { family } = this.data
    const confirmed = await DIALOG.showConfirm({
      title: '删除家庭',
      content: `确定删除「${family.name}」吗？所有成员和聚会记录将被永久删除，此操作不可恢复。`,
      confirmText: '删除',
    })
    if (!confirmed) return
    try {
      await FAMILY.deleteFamily(this.data.familyId)
      this.afterLeaveFamily()
      DIALOG.showToast('家庭已删除', { icon: 'success' })
      setTimeout(() => {
        wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/family/index' }) })
      }, 500)
    } catch (err) {
      await DIALOG.showError(err, '删除失败')
    }
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

  goJoinParty() {
    wx.navigateTo({ url: '/pages/party/index' })
  },

  startParty() {
    const { familyId } = this.data
    wx.navigateTo({ url: `/pages/party/index?familyId=${familyId}` })
  },
})
