const R = require('ramda')

let warnings = 0

const warn = (cond, msg) => {
  if (!cond) {
    warnings++
    console.error(msg)
  }
}

const sn = (subnets, n) => subnets.find(x => x[1] === n)[0]
const pn = subnets => s => {
  const match = s.match(/___(\d+)/)
  if (R.isNil(match)) return 'Root'
  const num = match[1]
  return R.isNil(num) ? 'Root' : sn(subnets, parseInt(num))
}

const outArcCountLookup = {}

// Check that every transition has either:
// one automatic transition
// or no automatic transitions
function automaticTransitions (netRec) {
  const pns = pn(netRec.subnets)
  const net = netRec.net
  const autos = R.reject(t => R.any(R.test(/^[a-z]/), t.tags), net.transitions)

  const isValidAuto = t => {
    const srcPlaceName = t.inputs[0].srcPlace
    const conflictingTransitions = outArcCountLookup[srcPlaceName]
    warn(conflictingTransitions.length === 1,
      `[${pns(t.name)}] ${t.name} is auto and has conflicting transitions ` +
      `at ${srcPlaceName}: ${conflictingTransitions.join(', ')}.`
    )
  }

  autos.forEach(isValidAuto)
}

function setupLookup (net) {
  net.net.transitions.forEach(t => {
    t.inputs.forEach(i => {
      const arc = outArcCountLookup[i.srcPlace] || []
      outArcCountLookup[i.srcPlace] = arc.concat(t.name)
    })
  })
}

function check (net) {
  setupLookup(net)
  automaticTransitions(net)
}

module.exports = { check }

const net = require('../build/nets/net.json')

console.error('Checking expanded net.')
check(net)

if (warnings === 0) {
  console.error('Success.')
} else {
  console.error()
  console.error(`${warnings} warnings.`)
}

// See if we can check for missing subnet tags on parent places.
// If we restrict to one child subnet of each type per subnet, we don't need
// the tags and can just label as the subnet.

// In the meantime, we can check place names to see if they match a subnet and aren't labelled correctly.
// This has to be done before expanding.
