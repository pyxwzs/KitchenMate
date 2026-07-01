const CONFIG = require('../config.js')
const request = require('./request')
const API = require('./api')
const { resolveAssetForDisplay } = require('./asset')
const { getErrorMessage, isNetworkError } = require('./error')

const CURRENT_FAMILY_KEY = 'currentFamilyId'

function getCurrentFamilyId() {
  return wx.getStorageSync(CURRENT_FAMILY_KEY) || null
}

function setCurrentFamilyId(familyId) {
  wx.setStorageSync(CURRENT_FAMILY_KEY, familyId)
}

function getFamilyMenu(familyId) {
  return request({ url: `/families/${familyId}/menu`, method: 'GET' })
}

function getMyMenu() {
  return request({ url: '/menu/my', method: 'GET' })
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
          resolve(formatDishImage(data))
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

async function resolveDishImages(dishes) {
  return Promise.all(
    (dishes || []).map(async (dish) => ({
      ...dish,
      imageUrl: await resolveAssetForDisplay(dish.image_url),
    }))
  )
}

async function formatFamilyMenuAsync(menu) {
  if (!menu) {
    return menu
  }
  return {
    ...menu,
    dishes: await resolveDishImages(menu.dishes),
  }
}

async function formatMyMenuAsync(menu) {
  if (!menu) {
    return { dishes: [] }
  }
  return {
    dishes: await resolveDishImages(menu.dishes),
  }
}

function formatFamilyMenu(menu) {
  if (!menu) {
    return menu
  }
  return {
    ...menu,
    dishes: (menu.dishes || []).map(formatDishImage),
  }
}

function formatMyMenu(menu) {
  if (!menu) {
    return menu
  }
  return {
    dishes: (menu.dishes || []).map(formatDishImage),
  }
}

module.exports = {
  CURRENT_FAMILY_KEY,
  getCurrentFamilyId,
  setCurrentFamilyId,
  getFamilyMenu,
  getMyMenu,
  createDish,
  updateDish,
  deleteDish,
  uploadDishImage,
  formatFamilyMenu,
  formatMyMenu,
  formatFamilyMenuAsync,
  formatMyMenuAsync,
}
