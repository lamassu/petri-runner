const fs = require('fs')

const R = require('ramda')

const transitions = {}
const transitionLookup = {}
const initialMarking = {}

function load (netPath) {
  const structure = JSON.parse(fs.readFileSync(netPath))
  const net = structure.net

  const populateMarking = p => {
    if (p.tokenCount > 0) initialMarking[p.name] = p.tokenCount
  }
  R.forEach(populateMarking, net.places)

  const populateTransition = t => {
    const [, context] = R.split('___', t.name)
    transitionLookup[context] = R.append(t.name, R.defaultTo([], transitionLookup[context]))
    transitions[t.name] = t
  }
  R.forEach(populateTransition, net.transitions)
}

module.exports = { load, initialMarking }
