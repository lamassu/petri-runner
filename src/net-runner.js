const fs = require('fs')
const EventEmitter = require('events')

class RunnerEmitter extends EventEmitter {}

const emitter = new RunnerEmitter()

const assert = require('assert')

const R = require('ramda')

const marking = {}
const transitions = {}
const transitionLookup = {}

function warn (msg, str) {
  emitter.emit('warning', { msg, warning: str })
}

const oneOf = R.pipe(R.props, R.reject(R.isNil), R.length, R.equals(1))

const lookup = R.propOr([])

// Note: Messages can be statically checked for duplication.
function findMatchedTransition (msg) {
  assert(oneOf(['transitionId', 'transitionType'], msg))

  const fetchTransition = transitionType => {
    const candidates = lookup(transitionType, transitionLookup)
    if (R.isEmpty(candidates)) throw new Error('No such transitionType.')

    const isInScope = (scope, transition) => {
      const [, context] = R.split('__', transition)
      return R.startsWith(scope, context)
    }

    const scope = msg.scope
    const transitionIds = scope ? R.filter(isInScope(scope), candidates) : candidates

    if (R.length(transitionIds) > 1) throw new Error('Multiple transitions for transition type.')
    return R.head(transitionIds)
  }

  const transitionId = msg.transitionType ? fetchTransition(msg.transitionType) : msg.transitionId

  const transition = transitions[transitionId]
  if (!transition) throw new Error(msg, 'No such transitionId.')

  return transition
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

  emitter.emit('fired', { transitionName, msg })
}

function firingEventHandler (msg) {
  try {
    const transition = findMatchedTransition(msg)
    if (R.isEmpty(transition)) {
      warn(msg, 'No matching transitions')
      return
    }

    fireTransition(transition)
  } catch (err) {
    emitter.emit('error', { msg, error: err.message })
  }
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

// How do we bound a cycle in the petri net?
// If net is k-bounded, we know the transition cannot fire more than k times without a loop.
// (Not true, since source place can be replenished without a loop.)
// So if we want to bound the number of loops to j, we can bound transition firings to j*k.

// Our nets so far are 1-safe and free choice. In 1-safe acyclic nets, no transition can
// fire more than once [https://www7.in.tum.de/um/bibdb/esparza/course.pdf]. Therefore,
// we can easily bound loops by counting how many times a transition fires. If we want to
// bound a loop to *k*, we restrict each transition to firing *k* times. However, if we
// have a loop, within a loop we need to take a product of all the levels.

// How to test reachability?

// TODO: convert to this format: https://github.com/CvO-Theory/apt
// Use the APT tool to analyze nets.

// http://www.service-technology.org/lola/

// Expanding bounded loops to acyclic petri nets. This is very useful for analysis with standard tools, like APT.
// We need an algorithm for this.

// Simplest case. Transition with loop arc must have a single additional arc going to an abort place.
// Only loop points to initial place.
// Replicate entire subnet, minus loop arc. Remaining arc becomes an automatic arc.
// Loop arc gets rerouted to 2nd initial place. Keep doing this at the end of each subnet.
// At the end of the final cycle, the loop arc gets deleted, leaving only the abort arc.
// This is probably the only case we need.

// Start by looking for an arc pointing to the initial place.
// This is the loop arc. Ensure that there is one other arc. This is the abort arc.
// This transition is the loop transition. It should have a *loop_x* label, where *x*
// is the looping bound. Ensure there is at most one loop transition per subnet.
// Replicate the entire subnet, namespace each replicated subnet with an integer.
// Terminal subnet has only the abort arc.
// All earlier subnets have only the loop arc. The loop arc gets rerouted to the initial place
// of the *next* replciated subnet.

// All other checking is done by checking the entire glued net for acyclicity. This can be done
// via APT or via topologic sort.

// For running the net, there are two options.
// (1) Run the expanded net, which is just a normal acyclic net. **Advantages**: Simple, no need for
// special logic; **Disadvantage**: Net could get quite big in memory.
// (2) Label the transition with a firing bound.
// Whenever an input transition to the initial transition that is not the looping transition fires,
// clear the looping firing count for the subnet.
// Whenever the looping transition is fired, increment the looping firing count.
// If the looping firing count is more than the bound, fire the abort
// transition instead of the looping transition.
