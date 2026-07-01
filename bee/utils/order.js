const request = require('./request')
const DISH_IMAGE = require('./dishImageCache')

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

async function resolveUserGroups(groups) {
  const list = groups || []
  const result = []
  for (let i = 0; i < list.length; i++) {
    const group = list[i]
    result.push(Object.assign({}, group, {
      items: await DISH_IMAGE.resolveItemsImages(group.items),
    }))
  }
  return result
}

async function resolveSessionImages(session) {
  if (!session) {
    return session
  }
  const items = await DISH_IMAGE.resolveItemsImages(session.items)
  return enrichHistorySession(Object.assign({}, session, {
    timeText: formatOrderTime(session.locked_at || session.created_at),
    items,
  }))
}

function enrichHistorySession(session) {
  const items = session.items || []
  let totalDishes = 0
  const dishMap = {}
  const byUserMap = {}
  const byCookMap = {}

  items.forEach((item) => {
    totalDishes += item.quantity

    if (!dishMap[item.dish_name]) {
      dishMap[item.dish_name] = {
        dish_id: item.dish_id,
        dish_name: item.dish_name,
        image_url: item.image_url,
        imageUrl: item.imageUrl || '',
        quantity: 0,
      }
    }
    dishMap[item.dish_name].quantity += item.quantity

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

    const cookId = item.cook_user_id
    if (cookId) {
      if (!byCookMap[cookId]) {
        byCookMap[cookId] = {
          cook_user_id: cookId,
          cook_name: item.cook_name || `用户${cookId}`,
          items: [],
        }
      }
      byCookMap[cookId].items.push(item)
    }
  })

  Object.values(byCookMap).forEach((group) => {
    group.total = group.items.reduce((sum, entry) => sum + entry.quantity, 0)
  })

  const dishNames = Object.keys(dishMap)
  const kindCount = dishNames.length
  let briefText = '暂无菜品'
  if (kindCount === 1) {
    briefText = `${dishNames[0]} ×${dishMap[dishNames[0]].quantity}`
  } else if (kindCount === 2) {
    briefText = dishNames.map((n) => `${n} ×${dishMap[n].quantity}`).join('、')
  } else if (kindCount > 2) {
    briefText = `${dishNames.slice(0, 2).map((n) => `${n} ×${dishMap[n].quantity}`).join('、')} 等${kindCount}道菜`
  }

  return Object.assign({}, session, {
    totalDishes,
    kindCount,
    briefText,
    by_user: Object.values(byUserMap),
    by_cook: Object.values(byCookMap),
    dish_totals: dishNames.map((name) => dishMap[name]),
  })
}

async function resolveOrdersImages(sessions) {
  const list = sessions || []
  const result = []
  for (let i = 0; i < list.length; i++) {
    result.push(await resolveSessionImages(list[i]))
  }
  return result
}

async function resolveSummaryImages(summary) {
  if (!summary) {
    return summary
  }
  const dish_totals = await DISH_IMAGE.resolveItemsImages(summary.dish_totals)
  const by_user = await resolveUserGroups(summary.by_user)
  const by_cook = await resolveUserGroups(summary.by_cook)
  const session = summary.session
    ? await resolveSessionImages(summary.session)
    : null
  return Object.assign({}, summary, {
    dish_totals,
    by_user,
    by_cook,
    session,
  })
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
        imageUrl: item.imageUrl || '',
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
