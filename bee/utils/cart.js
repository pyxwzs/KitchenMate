const CART_KEY = 'familyCart'

function getCartKey(familyId) {
  return `${CART_KEY}_${familyId}`
}

function getCart(familyId) {
  if (!familyId) {
    return []
  }
  return wx.getStorageSync(getCartKey(familyId)) || []
}

function saveCart(familyId, items) {
  wx.setStorageSync(getCartKey(familyId), items)
}

function addItem(familyId, dish, quantity = 1) {
  const items = getCart(familyId)
  const existing = items.find(i => i.dishId === dish.id)
  if (existing) {
    existing.quantity = Math.min(99, existing.quantity + quantity)
  } else {
    items.push({
      dishId: dish.id,
      name: dish.name,
      imageUrl: dish.imageUrl || dish.image_url || '',
      quantity,
      note: '',
    })
  }
  saveCart(familyId, items)
  return items
}

function updateNote(familyId, dishId, note) {
  const items = getCart(familyId)
  const item = items.find(i => i.dishId === dishId)
  if (item) {
    item.note = (note || '').trim()
    saveCart(familyId, items)
  }
  return items
}

function updateQuantity(familyId, dishId, quantity) {
  let items = getCart(familyId)
  if (quantity <= 0) {
    items = items.filter(i => i.dishId !== dishId)
  } else {
    const item = items.find(i => i.dishId === dishId)
    if (item) {
      item.quantity = Math.min(99, quantity)
    }
  }
  saveCart(familyId, items)
  return items
}

function clearCart(familyId) {
  saveCart(familyId, [])
  return []
}

function getTotalCount(items) {
  return (items || []).reduce((sum, i) => sum + i.quantity, 0)
}

function toOrderPayload(items) {
  return items.map(i => ({
    dish_id: i.dishId,
    quantity: i.quantity,
    note: i.note || null,
  }))
}

module.exports = {
  getCart,
  addItem,
  updateQuantity,
  updateNote,
  clearCart,
  getTotalCount,
  toOrderPayload,
}
