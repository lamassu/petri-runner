const fs = require('fs')

const R = require('ramda')

const transitions = {}
const transitionLookup = {}
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
    transitionLookup[name] = R.append(t.name, R.defaultTo([], transitionLookup[name]))
    transitions[t.name] = t
  }
  R.forEach(populateTransition, net.transitions)
  populateMarking(marking)
  initialMarkingArr = R.toPairs(marking)
}

const initialMarking = () => initialMarkingArr

const lookupTransition = id => transitions[id]
const lookupTransitionName = name => transitionLookup[name]

module.exports = { load, initialMarking, lookupTransition, lookupTransitionName }
