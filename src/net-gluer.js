const fs = require('fs')
// const assert = require('assert')

const toposort = require('toposort')
const R = require('ramda')

let rootNet
const nets = {}

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

  nets[net.name] = net

  if (R.includes('root', initialPlace.tags)) {
    rootNet = net
    console.log(`${net.name} is root`)
  }
}

const placeSubnet = r => R.find(R.test(/^[A-Z]/), r.tags)

function loadNets (netStructure) {
  R.forEach(loadNet, netStructure)
}

function computeSubnetArcs (parentNet) {
  const parentNetName = parentNet.name
  const subnetNames = R.map(R.prop('name'), R.filter(placeSubnet, parentNet.places))
  return R.map(R.pair(parentNetName), subnetNames)
}

// const consoleTap = R.tap(console.log)

const filepath = process.argv[2]
const netStructure = JSON.parse(fs.readFileSync(filepath))
loadNets(netStructure)
const subnetArcs = R.unnest((R.map(computeSubnetArcs, R.values(nets))))
const netDependencies = toposort(subnetArcs)

console.log(netDependencies)

/*
* Need to compute dependency graph.
* First create graph of net dependencies.
* Then do a topological sort.
*/
