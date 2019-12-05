const fs = require('fs')
const assert = require('assert')

const toposort = require('toposort')
const R = require('ramda')

let rootNet
let globalCount = 0

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

function expandWith (parentNet, subnetPlaceName) {
  const am = s => `${parentName} <- ${subnetPlaceName}: ${s}`
  const subnet = nets[subnetPlaceName]
  const parentName = parentNet.name
  assert(subnet, am('No such subnet.'))
  const isInitialPlace = R.pipe(R.prop('tags'), R.includes('initial'))
  const subnetInitialPlaces = R.filter(isInitialPlace, subnet.places)
  assert(subnetInitialPlaces.length === 1, am("Subnet doesn't have single initial place"))
  const subnetInitialPlace = R.head(subnetInitialPlaces)
  assert(subnetInitialPlace.name === subnetPlaceName, am('Subnet initial place incorrectly named.'))
  const toSortedTransitionNames = R.pipe(R.map(R.prop('name')), R.sortBy(R.identity))
  const isTerminalTransition = r => R.isEmpty(r.outputs)
  const subnetTerminalTransitions = R.filter(isTerminalTransition, subnet.transitions)
  const subnetTerminalTransitionNames = toSortedTransitionNames(subnetTerminalTransitions)

  const isInitialTransition = R.pipe(R.prop('inputs'), R.includes(subnetPlaceName))
  const collapsedTransitions = R.filter(transitionFromSubnetPlace, parentNet.transitions)
  const singleInput = R.pipe(R.prop('inputs'), R.length, R.equals(1))
  assert(R.all(singleInput, collapsedTransitions),
    am('Has collapsed transition with multiple inputs.'))
  const collapsedTransitionNames = toSortedTransitionNames(collapsedTransitions)
  assert(R.equals(subnetTerminalTransitionNames, collapsedTransitionNames),
    am('Collapsed transitions differ from subnet terminal transitions.'))

  // parent places remain the same
  // add namespaced subplaces, except for initial place
  const subnetNonInitialPlaces = R.reject(isInitialPlace, subnet.places)
  const namespaceSubnet = name => `${name}_${globalCount}`
  const subnetPlaces = R.map(namespaceSubnet, subnetNonInitialPlaces)
  parentNet.places = R.concat(parentNet.places, subnetPlaces)

  const initialTransitions = R.filter(isInitialTransition, subnet.transitions)
  assert(R.all(singleInput, initialTransitions),
    am('Subnet has initial transition with multiple inputs.'))

  const collapsedTransitionLookup = R.fromPairs(R.map(t => [t.name, t], collapsedTransitions))

  const computeOutputs = t => {
    if (isTerminalTransition(t)) {
      const parentTransition = collapsedTransitionLookup[t.name]
      assert(parentTransition, 'No such collapsed transition in parent.')
      return parentTransition.outputs
    }

    return R.map(namespaceSubnet, t.outputs)
  }

  const computeInputs = t => {
    if (isInitialTransition(t)) {
      const input = R.head(t.inputs)
      assert(input.srcTokenCount === 1, am(`[${t.name}] Initial transition input token count is not 1.`))
      return [{ srcPlace: subnetPlaceName, srcTokenCount: 1 }]
    }

    return R.map(namespaceSubnet, t.inputs)
  }

  const transformSubnetTransition = t => {
    return {
      name: isTerminalTransition(t) ? t.name : namespaceSubnet(t),
      tags: t.tags,
      inputs: computeInputs(t),
      outputs: computeOutputs(t)
    }
  }

  const subnetTransitions = R.map(transformSubnetTransition, subnet.transitions)
  parentNet.transitions = R.concat(parentNet.transitions, subnetTransitions)
  globalCount++

  // What about numbered subnets (more than one call to a subnet in a parent net, so it has to be numbered). We need to
  // recognize the subnet and handle it properly.
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
