const MENU = require('./menu')
const DISH_IMAGE = require('./dishImageCache')

function handleMenuUpdated(page, msg) {
  if (!msg || msg.type !== 'menu_updated') {
    return false
  }
  const familyId = page.data && page.data.currentFamilyId
  if (!familyId || Number(msg.family_id) !== Number(familyId)) {
    return false
  }
  MENU.invalidateFamilyMenu(familyId)
  if (msg.dish_id) {
    DISH_IMAGE.clearDish(msg.dish_id)
  }
  return true
}

module.exports = {
  handleMenuUpdated,
}
