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

function clearSession(familyId) {
  return request({
    url: `/families/${familyId}/orders/clear`,
    method: 'POST',
  })
}

function getOrderSummary(familyId) {
  return request({
    url: `/families/${familyId}/orders/summary`,
    method: 'GET',
  })
}

function formatDishNameWithCook(dishName, cookName) {
  if (!dishName) {
    return ''
  }
  if (!cookName) {
    return dishName
  }
  return `${dishName}（${cookName}）`
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
  return Object.assign({}, session, { items })
}

async function resolveSummaryImages(summary) {
  if (!summary) {
    return summary
  }
  const dish_totals = (await DISH_IMAGE.resolveItemsImages(summary.dish_totals)).map((d) => ({
    ...d,
    display_name: formatDishNameWithCook(d.dish_name, d.cook_name),
  }))
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
        name: formatDishNameWithCook(item.dish_name, item.cook_name),
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
  clearSession,
  getOrderSummary,
  resolveSummaryImages,
  getMyDishQuantities,
  flattenTableCartItems,
}
