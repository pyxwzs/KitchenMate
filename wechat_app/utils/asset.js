const { getAssetUrl } = require('./api')

const STORAGE_KEY = 'km_asset_cache_v1'
const cache = Object.create(null)
const inflight = Object.create(null)
const recentlyEvicted = Object.create(null)
const fs = wx.getFileSystemManager()

function persistCache() {
  try {
    wx.setStorageSync(STORAGE_KEY, cache)
  } catch (e) {
    // ignore quota errors
  }
}

function loadPersistedCache() {
  try {
    const saved = wx.getStorageSync(STORAGE_KEY)
    if (!saved || typeof saved !== 'object') return
    Object.keys(saved).forEach((url) => {
      const filePath = saved[url]
      if (!filePath) return
      try {
        fs.accessSync(filePath)
        cache[url] = filePath
      } catch (e) {
        // stale entry
      }
    })
  } catch (e) {
    // ignore
  }
}

function buildCacheUrl(pathOrUrl, version) {
  const base = getAssetUrl(pathOrUrl)
  if (!base) {
    return ''
  }
  if (version === undefined || version === null || version === '') {
    return base
  }
  const token = `v=${encodeURIComponent(String(version))}`
  return base.includes('?') ? `${base}&${token}` : `${base}?${token}`
}

function evictAssetCache(pathOrUrl, version) {
  const url = buildCacheUrl(pathOrUrl, version)
  if (!url) return
  const localPath = cache[url]
  delete cache[url]
  delete inflight[url]
  recentlyEvicted[url] = true
  persistCache()
  if (localPath) {
    try {
      fs.unlinkSync(localPath)
    } catch (e) {
      // ignore
    }
  }
}

function appendCacheBust(url) {
  if (!url) return url
  const token = `_v=${Date.now()}`
  return url.includes('?') ? `${url}&${token}` : `${url}?${token}`
}

function rememberLocalPath(url, localPath) {
  if (!url || !localPath) return
  cache[url] = localPath
  persistCache()
}

function getCachedDisplayPath(pathOrUrl, version) {
  if (!pathOrUrl) {
    return ''
  }
  const url = buildCacheUrl(pathOrUrl, version)
  if (!url) {
    return ''
  }
  const localPath = cache[url]
  if (!localPath) {
    return ''
  }
  try {
    fs.accessSync(localPath)
    return localPath
  } catch (e) {
    delete cache[url]
    persistCache()
    return ''
  }
}

loadPersistedCache()

function isRemoteUrl(url) {
  return !!(url && (url.startsWith('http://') || url.startsWith('https://')))
}

function cacheKey(url, unique) {
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i)
    hash |= 0
  }
  const ext = url.includes('.png') ? 'png' : 'jpg'
  const base = `${wx.env.USER_DATA_PATH}/asset_${Math.abs(hash)}`
  return unique ? `${base}_${Date.now()}.${ext}` : `${base}.${ext}`
}

function saveArrayBuffer(url, data, unique) {
  return new Promise((resolve) => {
    const filePath = cacheKey(url, unique)
    wx.getFileSystemManager().writeFile({
      filePath,
      data,
      success: () => resolve(filePath),
      fail: () => resolve(''),
    })
  })
}

function fetchAsset(url) {
  const unique = !!recentlyEvicted[url]
  if (unique) {
    delete recentlyEvicted[url]
  }
  const requestUrl = unique ? appendCacheBust(url) : url
  return fetchViaRequest(requestUrl, url, unique)
    .then((localPath) => localPath || fetchViaDownloadFile(requestUrl, url, unique))
}

/** 广域网真机调试时 wx.request 会走开发者工具转发，downloadFile / image 直连局域网会失败 */
function fetchViaRequest(requestUrl, cacheUrl, unique) {
  return new Promise((resolve) => {
    wx.request({
      url: requestUrl,
      method: 'GET',
      responseType: 'arraybuffer',
      success(res) {
        if (res.statusCode !== 200 || !res.data) {
          resolve('')
          return
        }
        saveArrayBuffer(cacheUrl, res.data, unique).then(resolve)
      },
      fail: () => resolve(''),
    })
  })
}

function fetchViaDownloadFile(requestUrl, cacheUrl, unique) {
  return new Promise((resolve) => {
    wx.downloadFile({
      url: requestUrl,
      success(res) {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          resolve('')
          return
        }
        if (!unique) {
          resolve(res.tempFilePath)
          return
        }
        const target = cacheKey(cacheUrl, true)
        fs.copyFile({
          srcPath: res.tempFilePath,
          destPath: target,
          success: () => resolve(target),
          fail: () => resolve(''),
        })
      },
      fail: () => resolve(''),
    })
  })
}

function resolveAssetForDisplay(pathOrUrl, options = {}) {
  const { force = false, version = '' } = options
  const url = buildCacheUrl(pathOrUrl, version)
  if (!url) {
    return Promise.resolve('')
  }
  if (!isRemoteUrl(url)) {
    return Promise.resolve(url)
  }
  if (force) {
    evictAssetCache(pathOrUrl, version)
  } else {
    const cached = getCachedDisplayPath(pathOrUrl, version)
    if (cached) {
      return Promise.resolve(cached)
    }
  }
  if (inflight[url]) {
    return inflight[url]
  }
  inflight[url] = fetchAsset(url)
    .then((localPath) => {
      if (localPath) {
        rememberLocalPath(url, localPath)
        return localPath
      }
      return ''
    })
    .finally(() => {
      delete inflight[url]
    })
  return inflight[url]
}

function clearAllAssetCache() {
  const paths = new Set()
  Object.keys(cache).forEach((key) => {
    if (cache[key]) {
      paths.add(cache[key])
    }
    delete cache[key]
  })
  Object.keys(inflight).forEach((key) => {
    delete inflight[key]
  })
  Object.keys(recentlyEvicted).forEach((key) => {
    delete recentlyEvicted[key]
  })
  paths.forEach((filePath) => {
    try {
      fs.unlinkSync(filePath)
    } catch (e) {
      // ignore
    }
  })
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch (e) {
    // ignore
  }
  try {
    const dir = wx.env.USER_DATA_PATH
    const files = fs.readdirSync(dir)
    files.forEach((name) => {
      if (!name.startsWith('asset_')) {
        return
      }
      try {
        fs.unlinkSync(`${dir}/${name}`)
      } catch (e) {
        // ignore
      }
    })
  } catch (e) {
    // ignore
  }
}

module.exports = {
  resolveAssetForDisplay,
  getCachedDisplayPath,
  evictAssetCache,
  appendCacheBust,
  buildCacheUrl,
  clearAllAssetCache,
}
