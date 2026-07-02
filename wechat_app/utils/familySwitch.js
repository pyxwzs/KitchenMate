const MENU = require('./menu')
const PARTY = require('./party')

/**
 * 弹出家庭选择器，当前家庭名称后带 ✓
 */
function pickFamily(families, currentFamilyId) {
  const list = families || []
  if (list.length <= 1) {
    return Promise.resolve(list[0] || null)
  }
  return new Promise((resolve) => {
    wx.showActionSheet({
      itemList: list.map((f) => {
        const mark = Number(f.id) === Number(currentFamilyId) ? ' ✓' : ''
        return `${f.name}${mark}`
      }),
      success: (res) => resolve(list[res.tapIndex]),
      fail: () => resolve(null),
    })
  })
}

/** 切换当前家庭；若与聚会家庭不同则清除聚会上下文 */
function applyFamilySwitch(family) {
  if (!family) return null
  MENU.setCurrentFamilyId(family.id)
  const partyCtx = PARTY.getPartyContext()
  if (partyCtx && Number(partyCtx.familyId) !== Number(family.id)) {
    PARTY.clearPartyContext()
  }
  return family
}

module.exports = {
  pickFamily,
  applyFamilySwitch,
}
