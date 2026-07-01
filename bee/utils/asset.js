const { getAssetUrl } = require('./api')

const cache = Object.create(null)

function isRemoteUrl(url) {
  return !!(url && (url.startsWith('http://') || url.startsWith('https://')))
}

function cacheKey(url) {
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i)
    hash |= 0
  }
  const ext = url.includes('.png') ? 'png' : 'jpg'
  return `${wx.env.USER_DATA_PATH}/asset_${Math.abs(hash)}.${ext}`
}

function saveArrayBuffer(url, data) {
  return new Promise((resolve) => {
    const filePath = cacheKey(url)
    wx.getFileSystemManager().writeFile({
      filePath,
      data,
      success: () => resolve(filePath),
      fail: () => resolve(''),
    })
  })
}

/** 广域网真机调试时 wx.request 会走开发者工具转发，downloadFile / image 直连局域网会失败 */
function fetchViaRequest(url) {
  return new Promise((resolve) => {
    wx.request({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      success(res) {
        if (res.statusCode !== 200 || !res.data) {
          resolve('')
          return
        }
        saveArrayBuffer(url, res.data).then(resolve)
      },
      fail: () => resolve(''),
    })
  })
}

function fetchViaDownloadFile(url) {
  return new Promise((resolve) => {
    wx.downloadFile({
      url,
      success(res) {
        if (res.statusCode === 200 && res.tempFilePath) {
          resolve(res.tempFilePath)
          return
        }
        resolve('')
      },
      fail: () => resolve(''),
    })
  })
}

function resolveAssetForDisplay(pathOrUrl) {
  const url = getAssetUrl(pathOrUrl)
  if (!url) {
    return Promise.resolve('')
  }
  if (!isRemoteUrl(url)) {
    return Promise.resolve(url)
  }
  if (cache[url]) {
    return Promise.resolve(cache[url])
  }
  return fetchViaRequest(url)
    .then((localPath) => localPath || fetchViaDownloadFile(url))
    .then((localPath) => {
      if (localPath) {
        cache[url] = localPath
        return localPath
      }
      return ''
    })
}

module.exports = {
  resolveAssetForDisplay,
}
