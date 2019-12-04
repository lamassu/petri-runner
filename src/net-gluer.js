const fs = require('fs')
const assert = require('assert')

const toposort = require('toposort')
const R = require('ramda')

let rootNet
const nets = {}
const subnetCounter = {}

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
  subnetCounter[net.name] = 0

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

function expandWith (parentNet, subnetName) {
  const subnet = nets[subnetName]
  assert(subnet, 'No such subnet')

  const subnetTerminalTransitionNames = R.sortBy(R.identity, R.map(R.prop('name'), R.filter(r => R.isEmpty(r.outputs), subnet.transitions)))
  const parentCollapsedTransitionNames =
    R.sortBy(R.identity, R.map(R.prop('name'), R.filter(r => r.inputs.length === 1 && R.head(r.inputs).srcPlace))
  // Need to check lots of things but return only specific things, so this style isn't great for that
  // Try simple forEach loops

  subnetCounter[subnetName] += 1
}

function expandNet (parentNet) {
  const subnetNames = R.map(R.prop('name'), R.filter(placeSubnet, parentNet.places))
  R.forEach(subnet => expandWith(parentNet, subnet), subnetNames)
}

// const consoleTap = R.tap(console.log)

const filepath = process.argv[2]
const netStructure = JSON.parse(fs.readFileSync(filepath))
loadNets(netStructure)
const subnetArcs = R.unnest((R.map(computeSubnetArcs, R.values(nets))))
const netDependencies = R.reverse(toposort(subnetArcs))
R.forEach(expandNet, netDependencies)
console.log(netDependencies)

/*
* Work up dependency list from the bottom, gluing along the way.
* Be careful about namespacing and separately namespacing duplicated subnets.
*/
