const fs = require('fs')

const R = require('ramda')

const marking = {}
const transitions = {}
const transitionLookup = {}

function load (netPath) {
  const structure = JSON.parse(fs.readFileSync(netPath))
  const net = structure.net

  const populateMarking = p => {
    if (p.tokenCount > 0) marking[p.name] = p.tokenCount
  }
  R.forEach(populateMarking, net.places)

  const populateTransition = t => {
    const [, context] = R.split('___', t.name)
    transitionLookup[context] = R.append(t.name, R.defaultTo([], transitionLookup[context]))
    transitions[t.name] = t
  }
  R.forEach(populateTransition, net.transitions)
}

function adjustMarking (transition) {
  const adjustMarkingInput = i => {
    marking[i.srcPlace] = marking[i.srcPlace] - i.srcTokenCount
  }

  const adjustMarkingOutput = o => {
    marking[o.dstPlace] = marking[o.dstPlace] + o.dstTokenCount
  }

  R.forEach(adjustMarkingInput, transition.inputs)
  R.forEach(adjustMarkingOutput, transition.outputs)
}

const activeTransition = t => {
  const validateInput = i => marking[i.srcPlace] >= i.srcTokenCount
  return R.all(validateInput, t.inputs)
}

module.exports = { adjustMarking, activeTransition, load }
