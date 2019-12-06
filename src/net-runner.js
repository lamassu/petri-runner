const fs = require('fs')
const EventEmitter = require('events')

class RunnerEmitter extends EventEmitter {}

const emitter = new RunnerEmitter()

const assert = require('assert')

const R = require('ramda')

const marking = {}
const transitions = {}
const transitionLookup = {}

function warn (msg, warning) {
  console.error(warning)
}

function error (msg, txt) {
  throw new Error(txt)
}

const oneOf = R.pipe(R.props, R.reject(R.isNil), R.length, R.equals(1))

const lookup = R.propOr([])

// Note: Messages can be statically checked for duplication.
function findMatchedTransition (msg) {
  assert(oneOf(['transitionId', 'transitionType'], msg))

  const fetchTransition = transitionType => {
    const candidates = lookup(transitionType, transitionLookup)
    if (R.isEmpty(candidates)) error(msg, 'No such transitionType.')

    const isInScope = (scope, transition) => {
      const [, context] = R.split('__', transition)
      return R.startsWith(scope, context)
    }

    const scope = msg.scope
    const transitionIds = scope ? R.filter(isInScope(scope), candidates) : candidates

    if (R.length(transitionIds) > 1) error(msg, 'Multiple transitions for transition type.')
    return R.head(transitionIds)
  }

  const transitionId = msg.transitionType ? fetchTransition(msg.transitionType) : msg.transitionId

  const transition = transitions[transitionId]
  if (!transition) error(msg, 'No such transitionId.')

  return transition
}

function emit (msg) {
  emitter.emit('fired', msg)
}

function fireTransition (msg, transition) {
  const transitionName = transition.name
  const validateInput = i => marking[i.srcPlace] >= i.srcTokenCount
  if (!R.all(validateInput, transition.inputs)) {
    warn(msg, `Could not fire transition ${transitionName}`)
    return
  }

  const adjustMarkingInput = i => {
    marking[i.srcPlace] = marking[i.srcPlace] - i.srcTokenCount
  }

  const adjustMarkingOutput = o => {
    marking[o.dstPlace] = marking[o.dstPlace] + o.dstTokenCount
  }

  R.forEach(adjustMarkingInput, transition.inputs)
  R.forEach(adjustMarkingOutput, transition.outputs)

  emit({ action: 'transitionFire', msg })
}

function firingEventHandler (msg) {
  const transition = findMatchedTransition(msg)
  if (R.isEmpty(transition)) {
    warn(msg, 'No matching transitions')
    return
  }

  fireTransition(transition)
}

function loadNet (netPath) {
  const structure = JSON.parse(fs.readFileSync(netPath))
  const net = structure.net

  const populateMarking = p => {
    if (p.tokenCount > 0) marking[p.name] = p.tokenCount
  }
  R.forEach(populateMarking, net.places)

  const populateTransition = t => {
    const [, context] = R.split('__', t.name)
    transitionLookup[context] = R.append(t.name, R.defaultTo([], transitionLookup[context]))
    transitions[t.name] = t
  }
  R.forEach(populateTransition, net.transitions)


}

function run (netPath) {
  loadNet(netPath)
  emitter.on('fire', firingEventHandler)
}

module.exports = { run, emitter }
