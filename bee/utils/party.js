const request = require('./request')
const MENU = require('./menu')

const PARTY_CONTEXT_KEY = 'partyContext'

function setPartyContext(party) {
  if (!party) {
    wx.removeStorageSync(PARTY_CONTEXT_KEY)
    return
  }
  const ctx = {
    partyId: party.id,
    familyId: party.family_id,
    familyName: party.family_name,
    partyName: party.name,
    joinCode: party.join_code,
    isHost: party.is_host,
    isGuest: party.is_guest,
    isMember: party.is_member,
  }
  wx.setStorageSync(PARTY_CONTEXT_KEY, ctx)
  MENU.setCurrentFamilyId(party.family_id)
}

function getPartyContext() {
  return wx.getStorageSync(PARTY_CONTEXT_KEY) || null
}

function clearPartyContext() {
  wx.removeStorageSync(PARTY_CONTEXT_KEY)
}

function getMyParty() {
  return request({ url: '/parties/mine', method: 'GET' })
}

function getActiveParty(familyId) {
  return request({ url: `/families/${familyId}/parties/active`, method: 'GET' })
}

function startParty(familyId, name) {
  return request({
    url: `/families/${familyId}/parties`,
    method: 'POST',
    data: { name },
  })
}

function joinParty(joinCode) {
  return request({
    url: '/parties/join',
    method: 'POST',
    data: { join_code: joinCode },
  })
}

function closeParty(partyId) {
  return request({
    url: `/parties/${partyId}/close`,
    method: 'POST',
  })
}

/**
 * 下载聚会二维码图片，返回 { path, isOfficial }
 * isOfficial=true 表示微信官方小程序码，可直接用微信扫一扫
 */
function downloadPartyWxacode(partyId) {
  const CONFIG = require('../config.js')
  const token = wx.getStorageSync('token')
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: `${CONFIG.apiBaseUrl}/parties/${partyId}/wxacode`,
      header: { Authorization: `Bearer ${token}` },
      success(res) {
        if (res.statusCode === 200) {
          const header = res.header || {}
          const type = header['X-QR-Type'] || header['x-qr-type'] || ''
          resolve({
            path: res.tempFilePath,
            isOfficial: String(type).toLowerCase() === 'wxacode',
          })
        } else {
          reject(new Error(`获取小程序码失败 (${res.statusCode})`))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '下载失败'))
      },
    })
  })
}

function isActiveParty(party) {
  return !!(party && String(party.status).toLowerCase() === 'active')
}

/** 同步服务端聚会状态，返回 active party 或 null */
async function syncPartyContext() {
  const cached = getPartyContext()
  try {
    const party = await getMyParty()
    if (isActiveParty(party)) {
      setPartyContext(party)
      return party
    }
    clearPartyContext()
    return null
  } catch {
    // 网络异常时保留本地聚会上下文，避免刚加入就被清掉
    return cached
  }
}

function partyFromCache(cached) {
  if (!cached || !cached.partyId) return null
  return {
    id: cached.partyId,
    family_id: cached.familyId,
    family_name: cached.familyName,
    name: cached.partyName,
    join_code: cached.joinCode,
    is_host: !!cached.isHost,
    is_guest: !!cached.isGuest,
    is_member: !!cached.isMember,
    status: 'active',
  }
}

function buildOrderContext(list, party, currentFamilyId, currentFamilyName) {
  if (party) {
    setPartyContext(party)
    return {
      party,
      families: list,
      currentFamilyId: party.family_id,
      currentFamilyName: party.family_name,
      inPartyMode: true,
      partyName: party.name,
      joinCode: party.join_code,
      isPartyGuest: party.is_guest && !party.is_member,
      canSwitchFamily: party.is_member && list.length > 1,
    }
  }

  clearPartyContext()

  if (!list.length) {
    return {
      party: null,
      families: [],
      currentFamilyId: null,
      currentFamilyName: '',
      inPartyMode: false,
      partyName: '',
      joinCode: '',
      isPartyGuest: false,
      canSwitchFamily: false,
    }
  }

  return {
    party: null,
    families: list,
    currentFamilyId,
    currentFamilyName,
    inPartyMode: false,
    partyName: '',
    joinCode: '',
    isPartyGuest: false,
    canSwitchFamily: list.length > 1,
  }
}

/**
 * 解析点餐/订单页的家庭上下文（支持聚会来宾无家庭成员身份）
 */
async function resolveOrderContext(families) {
  const list = families || []
  let party = null
  let currentFamilyId = null
  let currentFamilyName = ''

  if (list.length) {
    currentFamilyId = MENU.getCurrentFamilyId()
    let current = list.find((f) => f.id === currentFamilyId) || list[0]
    currentFamilyId = current.id
    currentFamilyName = current.name
    MENU.setCurrentFamilyId(currentFamilyId)

    try {
      const active = await getActiveParty(currentFamilyId)
      if (isActiveParty(active)) {
        party = active
      }
    } catch {
      // ignore
    }

    if (!party) {
      try {
        const mine = await getMyParty()
        if (isActiveParty(mine) && list.some((f) => f.id === mine.family_id)) {
          party = mine
          currentFamilyId = party.family_id
          currentFamilyName = party.family_name
          MENU.setCurrentFamilyId(currentFamilyId)
        }
      } catch {
        // ignore
      }
    }
  } else {
    try {
      const mine = await getMyParty()
      if (isActiveParty(mine)) {
        party = mine
      }
    } catch {
      party = partyFromCache(getPartyContext())
    }
  }

  return buildOrderContext(list, party, currentFamilyId, currentFamilyName)
}

module.exports = {
  PARTY_CONTEXT_KEY,
  setPartyContext,
  getPartyContext,
  clearPartyContext,
  getMyParty,
  getActiveParty,
  startParty,
  joinParty,
  closeParty,
  syncPartyContext,
  resolveOrderContext,
  downloadPartyWxacode,
}
