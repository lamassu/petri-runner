const R = require('ramda')

module.exports = { check }

let warnings = 0

const warn = msg => {
  warnings++
  console.error(msg)
}

const warnIf = (cond, msg) => {
  if (!cond) warn(msg)
}

function checkExpansionPlaces (nets) {
  const netNames = {}
  nets.forEach(n => { netNames[n.name] = true })
  nets.forEach(n => {
    n.places.forEach(p => {
      if (netNames[p.name] && !(p.tags.includes(p.name) || p.tags.includes('initial'))) {
        warn(`[${n.name}] Place ${p.name} matches a subnet name and isn't labelled as an expansion place.`)
      }
    })
  })
}

function check (nets) {
  checkExpansionPlaces(nets)
}

const nets = require('../build/nets/nets.json')

console.error('Checking individual subnets.')
check(nets)

if (warnings === 0) {
  console.error('Success.')
} else {
  console.error()
  console.error(`${warnings} warnings.`)
}
