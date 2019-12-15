const netState = require('net-state')

const R = require('ramda')

function handler (msg) {
  const transitions = netState.lookupTransition(msg.transitionName)

  if (R.isEmpty(transitions)) {
    return {
      recordType: 'error',
      error: 'NoMatchingTransition',
      msg
    }
  }

  const activeTransitions = R.filter(netState.activeTransition, transitions)

  if (R.isEmpty(activeTransitions)) {
    return {
      recordType: 'warning',
      warning: 'NoActiveTransition',
      msg
    }
  }

  if (activeTransitions.length !== 1) {
    return {
      recordType: 'error',
      error: 'MultipleActiveTransitions',
      matchingTransitions: R.map(R.prop('name', activeTransitions)),
      msg
    }
  }

  const transition = R.head(activeTransitions)

  // This is the big side effect!
  netState.adjustMarking(transition)

  const marking = netState.marking()

  return {
    recordType: 'firing',
    transitionId: transition.name,
    data: msg.data,
    marking
  }
}

module.exports = { handler }
