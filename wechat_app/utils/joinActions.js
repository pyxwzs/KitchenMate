const FAMILY = require('./family')
const MENU = require('./menu')
const PARTY = require('./party')

async function performFamilyJoin(inviteCode) {
  const family = await FAMILY.joinFamily(inviteCode)
  MENU.setCurrentFamilyId(family.id)
  return family
}

async function performPartyJoin(joinCode) {
  const party = await PARTY.joinParty(joinCode)
  PARTY.setPartyContext(party)
  return party
}

module.exports = {
  performFamilyJoin,
  performPartyJoin,
}
