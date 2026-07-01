const request = require('./request')
const { resolveAssetForDisplay } = require('./asset')

function addToSession(familyId, items, note) {
  return request({
    url: `/families/${familyId}/orders`,
    method: 'POST',
    data: { items, note: note || null },
  })
}

function adjustItem(familyId, dishId, delta, note) {
  const data = { dish_id: dishId, delta }
  if (note) {
    data.note = note
  }
  return request({
    url: `/families/${familyId}/orders/adjust`,
    method: 'POST',
    data,
  })
}

function updateOrderItem(familyId, itemId, payload) {
  return request({
    url: `/families/${familyId}/orders/items/${itemId}`,
    method: 'PATCH',
    data: payload,
  })
}

function lockSession(familyId) {
  return request({
    url: `/families/${familyId}/orders/lock`,
    method: 'POST',
  })
}

function getOrderSummary(familyId) {
  return request({
    url: `/families/${familyId}/orders/summary`,
    method: 'GET',
  })
}

function getHistoryOrders(familyId, limit = 50) {
  return request({
    url: `/families/${familyId}/orders/history?limit=${limit}`,
    method: 'GET',
  })
}

const STATUS_LABELS = {
  open: '点餐中',
  locked: '已提交',
  cancelled: '已取消',
}

const STATUS_CLASS = {
  open: 'status-pending',
  locked: 'status-done',
  cancelled: 'status-cancelled',
}

function formatOrderTime(iso) {
  if (!iso) {
    return ''
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return ''
  }
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours()
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${month}月${day}日 ${hour}:${minute}`
}

async function resolveSessionImages(session) {
  if (!session) {
    return session
  }
  return enrichHistorySession({
    ...session,
    timeText: formatOrderTime(session.locked_at || session.created_at),
    items: await Promise.all(
      (session.items || []).map(async (item) => ({
        ...item,
        imageUrl: await resolveAssetForDisplay(item.image_url),
      }))
    ),
  })
}

function enrichHistorySession(session) {
  const items = session.items || []
  let totalDishes = 0
  const dishMap = {}
  const byUserMap = {}

  items.forEach((item) => {
    totalDishes += item.quantity
    dishMap[item.dish_name] = (dishMap[item.dish_name] || 0) + item.quantity

    if (!byUserMap[item.user_id]) {
      byUserMap[item.user_id] = {
        user_id: item.user_id,
        user_name: item.user_name,
        items: [],
        total: 0,
      }
    }
    byUserMap[item.user_id].items.push(item)
    byUserMap[item.user_id].total += item.quantity
  })

  const dishNames = Object.keys(dishMap)
  const kindCount = dishNames.length
  let briefText = '暂无菜品'
  if (kindCount === 1) {
    briefText = `${dishNames[0]} ×${dishMap[dishNames[0]]}`
  } else if (kindCount === 2) {
    briefText = dishNames.map((n) => `${n} ×${dishMap[n]}`).join('、')
  } else if (kindCount > 2) {
    briefText = `${dishNames.slice(0, 2).map((n) => `${n} ×${dishMap[n]}`).join('、')} 等${kindCount}道菜`
  }

  return {
    ...session,
    totalDishes,
    kindCount,
    briefText,
    by_user: Object.values(byUserMap),
    dish_totals: dishNames.map((name) => ({
      dish_name: name,
      quantity: dishMap[name],
    })),
  }
}

async function resolveOrdersImages(sessions) {
  return Promise.all((sessions || []).map((s) => resolveSessionImages(s)))
}

async function resolveSummaryImages(summary) {
  if (!summary) {
    return summary
  }
  const dishTotals = await Promise.all(
    (summary.dish_totals || []).map(async (item) => ({
      ...item,
      imageUrl: await resolveAssetForDisplay(item.image_url),
    }))
  )
  const byUser = await Promise.all(
    (summary.by_user || []).map(async (user) => ({
      ...user,
      items: await Promise.all(
        (user.items || []).map(async (item) => ({
          ...item,
          imageUrl: await resolveAssetForDisplay(item.image_url),
        }))
      ),
    }))
  )
  const session = summary.session
    ? await resolveSessionImages(summary.session)
    : null
  return { summary, dish_totals: dishTotals, by_user: byUser, session }
}

function getMyDishQuantities(summary, myUserId) {
  const map = {}
  const uid = Number(myUserId)
  const users = summary && summary.by_user ? summary.by_user : []
  for (let i = 0; i < users.length; i++) {
    const user = users[i]
    if (Number(user.user_id) !== uid) continue
    const items = user.items || []
    for (let j = 0; j < items.length; j++) {
      const item = items[j]
      const dishId = item.dish_id
      map[dishId] = (map[dishId] || 0) + item.quantity
    }
  }
  return map
}

function flattenTableCartItems(summary, myUserId) {
  const list = []
  const uid = Number(myUserId)
  const users = summary && summary.by_user ? summary.by_user : []
  for (let i = 0; i < users.length; i++) {
    const user = users[i]
    const items = user.items || []
    for (let j = 0; j < items.length; j++) {
      const item = items[j]
      list.push({
        id: item.id,
        dishId: item.dish_id,
        name: item.dish_name,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        note: item.note || '',
        userId: item.user_id,
        userName: item.user_name,
        cookName: item.cook_name || '',
        isMine: Number(item.user_id) === uid,
      })
    }
  }
  return list
}

module.exports = {
  addToSession,
  adjustItem,
  updateOrderItem,
  lockSession,
  getHistoryOrders,
  getOrderSummary,
  resolveSummaryImages,
  resolveOrdersImages,
  resolveSessionImages,
  enrichHistorySession,
  formatOrderTime,
  getMyDishQuantities,
  flattenTableCartItems,
  STATUS_LABELS,
  STATUS_CLASS,
}
