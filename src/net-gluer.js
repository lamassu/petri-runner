const fs = require('fs')

const R = require('ramda')

function bail (msg) {
  console.log(`error: ${msg}`)
  process.exit(1)
}

function loadNet (net) {
  const initialPlaces = R.filter(r => R.includes('initial', r.tags), net.places)

  if (initialPlaces.length > 1) bail(`Multiple initial tags in net ${net.name}`)

  if (initialPlaces.length < 1) {
    console.log(`No initial tags in net ${net.name}, skipping...`)
    return
  }

  const initialPlace = initialPlaces[0]

  if (R.includes('root', initialPlace.tags)) {
    console.log(`${net.name} is root`)
  }
}

function loadNets (nets) {
  R.forEach(loadNet, nets)
}

const filepath = process.argv[2]
const nets = JSON.parse(fs.readFileSync(filepath))
loadNets(nets)
