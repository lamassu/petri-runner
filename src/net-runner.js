const netState = require('net-state')

const R = require('ramda')

const adjustMarking = marking => transition => {
  const adjustMarkingInput = (marking, i) => {
    return R.over(R.lensProp('srcPlace'), tks => tks - i.srcTokenCount, marking)
  }

  const adjustMarkingOutput = (marking, o) => {
    return R.over(R.lensProp('dstPlace'), tks => tks + o.dstTokenCount, marking)
  }

  const adjustSubMarking = (marking, rec) => {
    return rec.input
      ? adjustMarkingInput(marking, rec.input)
      : adjustMarkingOutput(marking, rec.output)
  }

  const recs = R.concat(
    R.map(R.objOf('input'), transition.inputs),
    R.map(R.objOf('output'), transition.outputs)
  )

  return R.reduce(adjustSubMarking, marking, recs)
}

const isActiveTransition = marking => t => {
  const validateInput = i => marking[i.srcPlace] >= i.srcTokenCount
  return R.all(validateInput, t.inputs)
}

function handler (marking, msg) {
  const transitions = netState.lookupTransition(msg.transitionName)

  if (R.isEmpty(transitions)) {
    return {
      recordType: 'error',
      error: 'NoMatchingTransition',
      msg
    }
  }

  const activeTransitions = R.filter(isActiveTransition(marking), transitions)

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

  return {
    recordType: 'firing',
    transitionId: transition.name,
    data: msg.data
  }
}

module.exports = { handler }
