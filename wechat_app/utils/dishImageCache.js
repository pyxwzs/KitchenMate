const { resolveAssetForDisplay, getCachedDisplayPath } = require('./asset')

const byDishId = Object.create(null)
const byPath = Object.create(null)

function registerDishes(dishes) {
  ;(dishes || []).forEach((dish) => {
    if (!dish || !dish.imageUrl) return
    if (dish.id) {
      byDishId[dish.id] = {
        imageUrl: dish.imageUrl,
        version: dish.updated_at || '',
      }
    }
    if (dish.image_url) {
      byPath[dish.image_url] = {
        imageUrl: dish.imageUrl,
        version: dish.updated_at || '',
      }
    }
  })
}

function lookupLocal(item) {
  if (!item) return ''
  if (item.dish_id && byDishId[item.dish_id]) {
    const entry = byDishId[item.dish_id]
    if (!item.updated_at || !entry.version || item.updated_at === entry.version) {
      return entry.imageUrl
    }
  }
  const path = item.image_url
  const version = item.updated_at || ''
  if (path && byPath[path]) {
    const entry = byPath[path]
    if (!version || !entry.version || version === entry.version) {
      return entry.imageUrl
    }
  }
  const cached = getCachedDisplayPath(path, version)
  if (cached) {
    if (item.dish_id) {
      byDishId[item.dish_id] = { imageUrl: cached, version }
    }
    if (path) {
      byPath[path] = { imageUrl: cached, version }
    }
    return cached
  }
  return ''
}

async function resolveOrderItemImage(item) {
  const local = lookupLocal(item)
  if (local) {
    return local
  }
  const version = (item && item.updated_at) || ''
  const url = await resolveAssetForDisplay(item && item.image_url, { version })
  if (item && item.dish_id && url) {
    byDishId[item.dish_id] = { imageUrl: url, version }
  }
  if (item && item.image_url && url) {
    byPath[item.image_url] = { imageUrl: url, version }
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

function clearDish(dishId, imagePath) {
  if (dishId) {
    delete byDishId[dishId]
  }
  if (imagePath) {
    delete byPath[imagePath]
  }
}

function resetAll() {
  Object.keys(byDishId).forEach((key) => {
    delete byDishId[key]
  })
  Object.keys(byPath).forEach((key) => {
    delete byPath[key]
  })
}

module.exports = {
  registerDishes,
  resolveItemsImages,
  clearDish,
  resetAll,
}
