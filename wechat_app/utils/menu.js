const CONFIG = require('../config.js')
const request = require('./request')
const API = require('./api')
const { resolveAssetForDisplay, getCachedDisplayPath, evictAssetCache, buildCacheUrl } = require('./asset')
const DISH_IMAGE = require('./dishImageCache')
const { getErrorMessage, isNetworkError } = require('./error')

const CURRENT_FAMILY_KEY = 'currentFamilyId'
const familyMenuCache = Object.create(null)
let myMenuCache = null

function getCurrentFamilyId() {
  return wx.getStorageSync(CURRENT_FAMILY_KEY) || null
}

function setCurrentFamilyId(familyId) {
  wx.setStorageSync(CURRENT_FAMILY_KEY, familyId)
}

function getFamilyMenu(familyId, options = {}) {
  const { force = false } = options
  if (!force && familyMenuCache[familyId]) {
    return Promise.resolve(familyMenuCache[familyId])
  }
  return request({ url: `/families/${familyId}/menu`, method: 'GET' }).then((raw) => {
    familyMenuCache[familyId] = raw
    return raw
  })
}

function getMyMenu(options = {}) {
  const { force = false } = options
  if (!force && myMenuCache) {
    return Promise.resolve(myMenuCache)
  }
  return request({ url: '/menu/my', method: 'GET' }).then((raw) => {
    myMenuCache = raw
    return raw
  })
}

function invalidateFamilyMenu(familyId) {
  if (familyId) {
    delete familyMenuCache[familyId]
    return
  }
  Object.keys(familyMenuCache).forEach((id) => {
    delete familyMenuCache[id]
  })
}

function invalidateMyMenu() {
  myMenuCache = null
}

function invalidateAllMenus() {
  invalidateMyMenu()
  invalidateFamilyMenu()
}

function createDish(data) {
  return request({ url: '/menu/my/dishes', method: 'POST', data })
}

function updateDish(dishId, data) {
  return request({
    url: `/menu/my/dishes/${dishId}`,
    method: 'PATCH',
    data,
  })
}

function deleteDish(dishId) {
  return request({
    url: `/menu/my/dishes/${dishId}`,
    method: 'DELETE',
  })
}

function uploadDishImage(dishId, filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: CONFIG.apiBaseUrl + `/menu/my/dishes/${dishId}/image`,
      filePath,
      name: 'file',
      header: {
        Authorization: 'Bearer ' + wx.getStorageSync('token'),
      },
      success(res) {
        let data = {}
        try {
          data = JSON.parse(res.data)
        } catch (e) {
          reject({ message: '上传失败' })
          return
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const dish = formatDishImage(data)
          if (dish && dish.id) {
            DISH_IMAGE.clearDish(dish.id, dish.image_url)
          }
          resolve(dish)
          return
        }
        const detail = data.detail
        const message = typeof detail === 'object' ? detail.message : (detail || '上传失败')
        const err = { statusCode: res.statusCode, message }
        if (isNetworkError(err)) {
          err.isNetworkError = true
          err.message = getErrorMessage(err, '上传失败')
        }
        reject(err)
      },
      fail(err) {
        reject({
          isNetworkError: true,
          message: getErrorMessage(err, '上传失败'),
          error: err,
        })
      },
    })
  })
}

function formatDishImage(dish) {
  if (!dish) {
    return dish
  }
  return {
    ...dish,
    imageUrl: API.getAssetUrl(dish.image_url),
  }
}

function dishImageVersion(dish) {
  return (dish && dish.updated_at) || ''
}

function dishWithDisplayImage(dish, options = {}) {
  if (!dish) {
    return dish
  }
  const version = dishImageVersion(dish)
  const { refreshImage = false } = options
  const cached = !refreshImage && getCachedDisplayPath(dish.image_url, version)
  const fallback = buildCacheUrl(dish.image_url, version)
  return {
    ...dish,
    imageUrl: cached || fallback || '',
  }
}

async function resolveDishImages(dishes, options = {}) {
  const refreshIds = new Set((options.refreshDishIds || []).map(Number))
  const list = dishes || []
  const result = list.map((dish) => dishWithDisplayImage(dish, {
    refreshImage: refreshIds.has(Number(dish.id)),
  }))
  const pending = []
  list.forEach((dish, index) => {
    if (!dish || !dish.image_url) {
      return
    }
    const version = dishImageVersion(dish)
    const refreshImage = refreshIds.has(Number(dish.id))
    if (!refreshImage && getCachedDisplayPath(dish.image_url, version)) {
      return
    }
    pending.push(
      resolveAssetForDisplay(dish.image_url, { force: refreshImage, version }).then((url) => {
        if (url) {
          result[index] = Object.assign({}, result[index], { imageUrl: url })
        }
      })
    )
  })
  if (pending.length) {
    await Promise.all(pending)
  }
  return result
}

async function formatFamilyMenuAsync(menu, options = {}) {
  if (!menu) {
    return menu
  }
  return {
    ...menu,
    dishes: await resolveDishImages(menu.dishes, options),
  }
}

async function formatMyMenuAsync(menu, options = {}) {
  if (!menu) {
    return { dishes: [] }
  }
  return {
    dishes: await resolveDishImages(menu.dishes, options),
  }
}

/** 按成员分组菜单，仅包含有菜的成员（后端已过滤） */
function buildDishGroups(dishes, members) {
  const nameMap = {}
  ;(members || []).forEach((m) => {
    nameMap[m.id] = m.display_name
  })
  const groups = {}
  ;(dishes || []).forEach((dish) => {
    const memberId = dish.user_id
    const memberName = nameMap[memberId] || `用户${memberId}`
    if (!groups[memberId]) {
      groups[memberId] = {
        memberId,
        memberName,
        dishes: [],
      }
    }
    groups[memberId].dishes.push({
      ...dish,
      memberName,
    })
  })
  return Object.values(groups)
}

function buildMenuSubtitle(members, isPartyMenu) {
  const list = members || []
  if (!list.length) {
    return isPartyMenu ? '聚会参与者还没有上架菜品' : '还没有成员上架菜品'
  }
  if (isPartyMenu) {
    if (list.length === 1) return `${list[0].display_name} 有菜`
    return `聚会 ${list.length} 人有菜`
  }
  if (list.length === 1) return `${list[0].display_name} 有菜`
  return `${list.length} 人有菜`
}

/** 按成员筛选可见菜品分组；memberId 为空则展示全部 */
function applyMenuFilter(dishes, menuMembers, memberId) {
  if (!memberId) {
    return buildDishGroups(dishes, menuMembers)
  }
  const id = Number(memberId)
  const filtered = (dishes || []).filter((d) => Number(d.user_id) === id)
  const members = (menuMembers || []).filter((m) => Number(m.id) === id)
  return buildDishGroups(filtered, members)
}

function buildMenuFilterOptions(menuMembers) {
  const list = menuMembers || []
  if (list.length <= 1) {
    return []
  }
  const options = [{ id: '', label: '全部菜单' }]
  list.forEach((m) => {
    options.push({ id: m.id, label: m.display_name })
  })
  return options
}

function menuFilterLabel(menuMembers, memberId) {
  if (!memberId) {
    return '全部菜单'
  }
  const picked = (menuMembers || []).find((m) => Number(m.id) === Number(memberId))
  return picked ? `${picked.display_name} 的菜` : '全部菜单'
}

module.exports = {
  CURRENT_FAMILY_KEY,
  getCurrentFamilyId,
  setCurrentFamilyId,
  getFamilyMenu,
  getMyMenu,
  invalidateFamilyMenu,
  invalidateMyMenu,
  invalidateAllMenus,
  createDish,
  updateDish,
  deleteDish,
  uploadDishImage,
  formatFamilyMenuAsync,
  formatMyMenuAsync,
  buildMenuSubtitle,
  applyMenuFilter,
  buildMenuFilterOptions,
  menuFilterLabel,
}
