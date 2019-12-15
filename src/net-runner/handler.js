const netState = require('net-state')

const R = require('ramda')

function handler (msg) {
  const transitions = netState.lookupTransition(msg.transitionName)

  if (R.isEmpty(transitions)) return err(msg, 'No matching transitions in net.')
  const activeTransitions = R.filter(activeTransition, transitions)

  if (R.isEmpty(activeTransitions)) return warn(msg, 'No active transitions.')
  if (activeTransitions.length !== 1) return err(msg, 'More than one active transition.')

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

