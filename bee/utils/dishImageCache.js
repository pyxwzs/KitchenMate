const { resolveAssetForDisplay, getCachedDisplayPath } = require('./asset')

const byDishId = Object.create(null)
const byPath = Object.create(null)

function registerDishes(dishes) {
  ;(dishes || []).forEach((dish) => {
    if (!dish || !dish.imageUrl) return
    if (dish.id) {
      byDishId[dish.id] = dish.imageUrl
    }
    if (dish.image_url) {
      byPath[dish.image_url] = dish.imageUrl
    }
  })
}

function lookupLocal(item) {
  if (!item) return ''
  if (item.dish_id && byDishId[item.dish_id]) {
    return byDishId[item.dish_id]
  }
  const path = item.image_url
  if (path && byPath[path]) {
    return byPath[path]
  }
  const cached = getCachedDisplayPath(path)
  if (cached) {
    if (item.dish_id) byDishId[item.dish_id] = cached
    if (path) byPath[path] = cached
    return cached
  }
  return ''
}

async function resolveOrderItemImage(item) {
  const local = lookupLocal(item)
  if (local) {
    return local
  }
  const url = await resolveAssetForDisplay(item && item.image_url)
  if (item && item.dish_id && url) {
    byDishId[item.dish_id] = url
  }
  if (item && item.image_url && url) {
    byPath[item.image_url] = url
  }
  return url || ''
}

async function resolveItemsImages(items) {
  const list = items || []
  const result = []
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    const imageUrl = await resolveOrderItemImage(item)
    result.push(Object.assign({}, item, { imageUrl }))
  }
  return result
}

function clearDishImageCache() {
  Object.keys(byDishId).forEach((k) => { delete byDishId[k] })
  Object.keys(byPath).forEach((k) => { delete byPath[k] })
}

module.exports = {
  registerDishes,
  resolveOrderItemImage,
  resolveItemsImages,
  clearDishImageCache,
}
