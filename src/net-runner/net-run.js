const R = require('ramda')

const netState = require('./net-state')

const { pp } = require('../util')

// TODO: add transition start times to handle "time petri net"
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

const unitScaler = {
  ms: 1,
  s: 1000,
  m: 60000
}

// Find active transitions, list them in marking,
// add start-time if they are timed
// don't reset clock if transition was already active.
const markedActiveTransitions = (prevMarking, marking) => {
  const transitions = netState.activeTransitions(marking)

  const tLookup = {}
  R.forEach(t => { tLookup[t.name] = t.fireableAt }, prevMarking.transitions)

  const updateT = t => {
    const toMilliseconds = ([num, units]) => num * unitScaler[units]

    const computeFireableAt = R.pipe(
      R.find(R.startsWith('timeout')),
      R.match(/timeout_(\d)+(\w+)/),
      toMilliseconds,
      ms => Date.now() + ms
    )

    const fireableAt = R.propOr(computeFireableAt(t), t.name, tLookup)
    return R.assoc('fireableAt', fireableAt, t)
  }

  const mark = t => {
    return R.when(netState.isTimedTransition, updateT, transitions)
  }

  return R.map(mark, transitions)
}

const isFireableTransition = marking => tId => {
  const activeTransition = R.find(R.propEq('name', tId), marking.activeTransitions)
  if (!activeTransition) return false
  return R.isNil(activeTransition.fireableAt)
    ? true
    : activeTransition.fireableAt <= Date.now()
}

const toTransitionRecord = (prevRec, msg, transitionId) => {
  const marking = R.fromPairs(prevRec.marking)

  if (!marking) throw new Error('No previous marking!')

  const toArr = R.pipe(R.toPairs, R.filter(x => x[1] > 0))
  const transition = netState.lookupTransition(transitionId)
  const newPlaceMarking = adjustMarking(marking, transition)
  const newMarking = R.assoc('activeTransitions', markedActiveTransitions(newPlaceMarking))

  return {
    recordType: 'firing',
    transitionId: transition.name,
    data: msg.data,
    marking: toArr(newMarking)
  }
}

function handler (prevRec, msg) {
  if (R.has('transitionId', msg)) return toTransitionRecord(prevRec, msg, msg.transitionId)

  const marking = prevRec.marking

  if (!msg.transitionName) {
    return {
      recordType: 'error',
      error: 'NoMatchingTransition',
      msg,
      marking
    }
  }

  const transitionIds = netState.lookupTransitionName(msg.transitionName)

  if (R.isEmpty(transitionIds)) {
    return {
      recordType: 'error',
      error: 'NoMatchingTransition',
      msg,
      marking: msg.marking
    }
  }

  const fireableTransitions = R.filter(isFireableTransition(marking), transitionIds)

  if (R.isEmpty(fireableTransitions)) {
    return {
      recordType: 'warning',
      warning: 'NoActiveTransition',
      msg,
      marking
    }
  }

  if (fireableTransitions.length > 1) {
    return {
      recordType: 'error',
      error: 'MultipleActiveTransitions',
      matchingTransitions: fireableTransitions,
      msg,
      marking
    }
  }

  const transitionId = R.head(fireableTransitions)

  return toTransitionRecord(prevRec, msg, transitionId)
}

module.exports = { handler }
