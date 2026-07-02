const CODE_RE = /[A-Z0-9]{4,10}/i

function extractScene(path) {
  const match = String(path || '').match(/scene=([A-Z0-9]{4,10})/i)
  return match ? match[1].toUpperCase() : ''
}

/**
 * 解析 wx.scanCode 结果，支持：
 * - 官方小程序码（scanType=WX_CODE，path 含 scene）
 * - 备用码 kitchenmate://party|family/XXXX
 * - 纯邀请码 / 聚会码
 */
function parseScanPayload(res, type) {
  const scanType = res.scanType || ''
  const path = res.path || ''
  const raw = String(res.result || '').trim()

  if (scanType === 'WX_CODE' && path) {
    const scene = extractScene(path)
    if (/pages\/party\/index/i.test(path)) {
      if (type === 'family') {
        return { error: '这是聚会码，请前往「聚会模式」加入' }
      }
      if (scene) return { code: scene, kind: 'party' }
      return { error: '无法读取聚会码' }
    }
    if (/pages\/family\/join/i.test(path)) {
      if (type === 'party') {
        return { error: '这是家庭邀请码，请前往「加入家庭」' }
      }
      if (scene) return { code: scene, kind: 'family' }
      return { error: '无法读取邀请码' }
    }
  }

  const partyUrl = raw.match(/kitchenmate:\/\/party\/([A-Z0-9]{4,10})/i)
  const familyUrl = raw.match(/kitchenmate:\/\/family\/([A-Z0-9]{4,10})/i)
  const plain = raw.match(/^([A-Z0-9]{4,10})$/i)

  if (type === 'party') {
    if (partyUrl) return { code: partyUrl[1].toUpperCase(), kind: 'party' }
    if (familyUrl) return { error: '这是家庭邀请码，请前往「加入家庭」' }
    if (plain) return { code: plain[1].toUpperCase(), kind: 'party' }
  } else {
    if (familyUrl) return { code: familyUrl[1].toUpperCase(), kind: 'family' }
    if (partyUrl) return { error: '这是聚会码，请前往「聚会模式」加入' }
    if (plain) return { code: plain[1].toUpperCase(), kind: 'family' }
  }

  if (CODE_RE.test(raw)) {
    const code = raw.match(CODE_RE)[0].toUpperCase()
    return { code, kind: type }
  }

  return { error: '无法识别该二维码' }
}

function scanJoinCode(type) {
  return new Promise((resolve, reject) => {
    wx.scanCode({
      onlyFromCamera: false,
      success(res) {
        const parsed = parseScanPayload(res, type)
        if (parsed.error) {
          reject(new Error(parsed.error))
          return
        }
        resolve(parsed.code)
      },
      fail(err) {
        const msg = err && err.errMsg ? err.errMsg : ''
        if (msg.includes('cancel')) {
          resolve(null)
          return
        }
        reject(new Error('扫码失败'))
      },
    })
  })
}

module.exports = {
  scanJoinCode,
}
