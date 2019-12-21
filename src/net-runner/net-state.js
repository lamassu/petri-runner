const fs = require('fs')

const R = require('ramda')

const transitions = {}
const transitionLookup = {}
const transitionLookupByInputPlace = {}

let initialMarkingArr

function load (netPath) {
  const structure = JSON.parse(fs.readFileSync(netPath))
  const net = structure.net
  const marking = {}

  const populateMarking = p => {
    if (p.tokenCount > 0) marking[p.name] = p.tokenCount
  }
  R.forEach(populateMarking, net.places)

  const populateTransition = t => {
    const [name] = R.split('___', t.name)
    transitionLookup[name] = R.append(t.name, transitionLookup[name])
    transitions[t.name] = t
    const populateInput = i => {
      transitionLookupByInputPlace[i.srcPlace] =
        R.append(t.name, transitionLookupByInputPlace[i.srcPlace])
    }
    R.forEach(populateInput, t.inputs)
  }
  R.forEach(populateTransition, net.transitions)
  populateMarking(marking)
  initialMarkingArr = R.toPairs(marking)
}

const initialMarking = () => initialMarkingArr

const lookupTransition = id => transitions[id]
const lookupTransitionName = name => transitionLookup[name]

const isAutoTransition = R.pipe(R.prop('tags'), R.any(R.test(/^[a-z]/)))

const isActiveTransition = marking => t => {
  const validateInput = i => marking[i.srcPlace] >= i.srcTokenCount
  return R.all(validateInput, t.inputs)
}

const activeAutoTransitions = marking => {
  const markCandidates = m => transitionLookupByInputPlace[m[0]] || []
  const candidateTransitions = R.pipe(R.chain(markCandidates, marking), R.map(lookupTransition))
  const isActiveAuto = R.both(isAutoTransition, isActiveTransition(marking))
  return R.filter(isActiveAuto, candidateTransitions)
}

module.exports = { load, initialMarking, lookupTransition, lookupTransitionName, activeAutoTransitions }
