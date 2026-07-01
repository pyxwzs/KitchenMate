const request = require('./request')

function listFamilies() {
  return request({ url: '/families', method: 'GET' })
}

function createFamily(name) {
  return request({ url: '/families', method: 'POST', data: { name } })
}

function getFamilyDetail(familyId) {
  return request({ url: `/families/${familyId}`, method: 'GET' })
}

function getInviteInfo(familyId) {
  return request({ url: `/families/${familyId}/invite`, method: 'GET' })
}

function joinFamily(inviteCode) {
  return request({
    url: '/families/join',
    method: 'POST',
    data: { invite_code: inviteCode },
  })
}

function updateMemberRole(familyId, memberId, role) {
  return request({
    url: `/families/${familyId}/members/${memberId}`,
    method: 'PATCH',
    data: { role },
  })
}

function leaveFamily(familyId) {
  return request({
    url: `/families/${familyId}/leave`,
    method: 'POST',
  })
}

function removeMember(familyId, memberId) {
  return request({
    url: `/families/${familyId}/members/${memberId}`,
    method: 'DELETE',
  })
}

function deleteFamily(familyId) {
  return request({
    url: `/families/${familyId}`,
    method: 'DELETE',
  })
}

const ROLE_LABELS = {
  admin: '管理员（掌勺）',
  chef: '厨师',
  diner: '食客',
}

function isWxacodeResponse(header) {
  if (!header) return false
  const type = header['X-QR-Type'] || header['x-qr-type'] || ''
  return String(type).toLowerCase() === 'wxacode'
}

function downloadFamilyWxacode(familyId) {
  const CONFIG = require('../config.js')
  const token = wx.getStorageSync('token')
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: `${CONFIG.apiBaseUrl}/families/${familyId}/wxacode`,
      header: { Authorization: `Bearer ${token}` },
      success(res) {
        if (res.statusCode === 200) {
          resolve({
            path: res.tempFilePath,
            isOfficial: isWxacodeResponse(res.header),
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

module.exports = {
  listFamilies,
  createFamily,
  getFamilyDetail,
  getInviteInfo,
  joinFamily,
  updateMemberRole,
  leaveFamily,
  removeMember,
  deleteFamily,
  downloadFamilyWxacode,
  ROLE_LABELS,
}
