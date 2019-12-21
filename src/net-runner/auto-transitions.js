const R = require('ramda')

const netState = require('./net-state')

function mapper (rec) {
  const marking = rec.marking

  const activeAutoTransitions = netState.activeAutoTransitions(marking)
  if (R.isEmpty(activeAutoTransitions)) return null

  const transition = R.pipe(R.sortBy(R.prop('name')), R.head)(activeAutoTransitions)

  return { transitionId: transition.name }
}

module.exports = { mapper }
