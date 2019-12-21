const R = require('ramda')

const netState = require('./net-state')

const { pp } = require('../util')

// Move this back to previous

const adjustMarking = (marking, transition) => {
  const def0 = R.defaultTo(0)

  const adjustMarkingInput = (marking, i) => {
    return R.over(R.lensProp(i.srcPlace), tks => def0(tks) - i.srcTokenCount, marking)
  }

  const adjustMarkingOutput = (marking, o) => {
    return R.over(R.lensProp(o.dstPlace), tks => def0(tks) + o.dstTokenCount, marking)
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

const fetchTransitionId= (name) => {
  const transitionIds = netState.lookupTransitionName(transitionName)

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

  return R.head(activeTransitions)
}

function handler (prevRec, msg) {
  const transition = R.has('transitionName', msg)
    ? fetchTransitionId(msg.transitionName)
    : netState.lookupTransition(msg.transitionId)

  const marking = R.fromPairs(prevRec.marking)

  if (!marking) throw new Error('No previous marking!')

  const toArr = R.pipe(R.toPairs, R.filter(x => x[1] > 0))

  return {
    recordType: 'firing',
    transitionId: transition.name,
    data: msg.data,
    marking: toArr(adjustMarking(marking, transition))
  }
}

module.exports = { handler }
