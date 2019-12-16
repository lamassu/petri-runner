const R = require('ramda')

const netState = require('./net-state')

const { pp } = require('../util')

// Move this back to previous
const adjustMarking = (marking, transition) => {
  const def0 = R.defaultTo(0)

  const adjustMarkingInput = i => {
    return R.over(R.lensProp(i.srcPlace), tks => def0(tks) - i.srcTokenCount, marking)
  }

  const adjustMarkingOutput = o => {
    return R.over(R.lensProp(o.dstPlace), tks => def0(tks) + o.dstTokenCount, marking)
  }

  const adjustSubMarking = rec => {
    return rec.input
      ? adjustMarkingInput(marking, rec.input)
      : adjustMarkingOutput(marking, rec.output)
  }

  const recs = R.concat(
    R.map(R.objOf('input'), transition.inputs),
    R.map(R.objOf('output'), transition.outputs)
  )

  pp(recs)
  R.forEach(adjustSubMarking, recs)
  pp(marking)
  return R.pipe(R.toPairs, R.filter(r => r[1] > 0))(marking)
}

const isActiveTransition = marking => t => {
  const validateInput = i => marking[i.srcPlace] >= i.srcTokenCount
  return R.all(validateInput, t.inputs)
}

function handler (prevRec, msg) {
  const transitionName = msg.transitionName
  const transitionIds = netState.lookupTransitionName(transitionName)
  const marking = R.fromPairs(prevRec.marking)

  if (!marking) throw new Error('No previous marking!')

  if (R.isEmpty(transitionIds)) {
    return {
      recordType: 'error',
      error: 'NoMatchingTransition',
      msg,
      marking
    }
  }

  const transitions = R.map(netState.lookupTransition, transitionIds)
  const activeTransitions = R.filter(isActiveTransition(marking), transitions)

  if (R.isEmpty(activeTransitions)) {
    return {
      recordType: 'warning',
      warning: 'NoActiveTransition',
      msg,
      marking
    }
  }

  if (activeTransitions.length !== 1) {
    return {
      recordType: 'error',
      error: 'MultipleActiveTransitions',
      matchingTransitions: R.map(R.prop('name', activeTransitions)),
      msg,
      marking
    }
  }

  const transition = R.head(activeTransitions)

  return {
    recordType: 'firing',
    transitionId: transition.name,
    data: msg.data,
    marking: adjustMarking(marking, transition)
  }
}

module.exports = { handler }
