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

  const validName = R.complement(R.contains('_'))
  assert(R.all(R.propSatisfies(validName, 'name'), net.places), `[${net.name}] Place name contains underscore`)
  const validateTransition = t => validName(t.name) &&
    R.all(R.propSatisfies(validName, 'srcPlace'), t.inputs) &&
    R.all(R.propSatisfies(validName, 'dstPlace'), t.outputs)
  assert(R.all(validateTransition, net.transitions), `[${net.name}] Transition contains underscore`)

  nets[net.name] = net
  subnetCounter[net.name] = 0

  if (R.includes('root', initialPlace.tags)) {
    rootNet = net
    console.log(`${net.name} is root`)
  }
}

const subnetName = place => {
  const subnets = R.filter(R.test(/^[A-Z]/), place.tags)
  assert(subnets.length <= 1, `Place ${place.name} has multiple subnet tags: ${R.join(', ', subnets)}.`)
  return R.isEmpty(subnets) ? null : R.head(subnets)
}

const isSubnetPlace = place => {
  return !R.isNil(subnetName(place))
}

function loadNets (netStructure) {
  R.forEach(loadNet, netStructure)
}

function computeSubnetArcs (parentNet) {
  const parentNetName = parentNet.name
  const subnetNames = R.map(subnetName, R.filter(isSubnetPlace, parentNet.places))
  return R.map(R.pair(parentNetName), subnetNames)
}

function expandWith (parentNet, expansionPlace) {
  const expansionPlaceName = expansionPlace.name
  const subnetPlaceName = subnetName(expansionPlace)
  assert(subnetPlaceName)
  const am = s => `${parentName} <- ${subnetPlaceName}: ${s}`
  const subnet = nets[subnetPlaceName]
  const parentName = parentNet.name
  console.log(`Processing ${parentName} <- ${subnetPlaceName}...`)
  assert(subnet, am('No such subnet.'))

  const isInitialPlace = R.pipe(R.prop('tags'), R.includes('initial'))
  assert(subnet.places)

  const subnetInitialPlaces = R.filter(isInitialPlace, subnet.places)
  assert(subnetInitialPlaces.length === 1, am("Subnet doesn't have single initial place"))

  const subnetInitialPlace = R.head(subnetInitialPlaces)
  assert(subnetInitialPlace.name === subnetPlaceName, am('Subnet initial place incorrectly named.'))
  const toSortedTransitionNames = R.pipe(R.map(R.prop('name')), R.sortBy(R.identity))
  const isTerminalTransition = r => R.isEmpty(r.outputs)

  assert(subnet.transitions)
  const subnetTerminalTransitions = R.filter(isTerminalTransition, subnet.transitions)
  const subnetTerminalTransitionNames = toSortedTransitionNames(subnetTerminalTransitions)

  const isParentInitialTransition = R.pipe(R.prop('inputs'), R.any(R.propEq('srcPlace', expansionPlaceName)))
  const isSubnetInitialTransition = R.pipe(R.prop('inputs'), R.any(R.propEq('srcPlace', subnetPlaceName)))
  assert(parentNet.transitions)
  const collapsedTransitions = R.filter(isParentInitialTransition, parentNet.transitions)

  const singleInput = R.pipe(R.prop('inputs'), R.length, R.equals(1))
  assert(R.all(singleInput, collapsedTransitions),
    am('Has collapsed transition with multiple inputs.'))
  const collapsedTransitionNames = toSortedTransitionNames(collapsedTransitions)
  assert(R.equals(subnetTerminalTransitionNames, collapsedTransitionNames),
    am('Collapsed transitions differ from subnet terminal transitions.' +
      `\n${parentName}: ${collapsedTransitionNames}` +
      `\n${subnetPlaceName}: ${subnetTerminalTransitionNames}`))

  // parent places remain the same
  // add namespaced subplaces, except for initial place
  const subnetNonInitialPlaces = R.reject(isInitialPlace, subnet.places)

  const namespaceSubnet = name => {
    // format is <name>_<scope>_<hierarchy-count-1>_<hierarchy-count-2>...
    assert(R.is(String, name), 'subnetName is not a string.')
    const parts = R.split('_', name)
    if (parts.length === 1) return `${name}_${subnetPlaceName}_${globalCount}`
    return `${name}_${globalCount}`
  }

  const subnetPlaces = R.map(p => R.assoc('name', namespaceSubnet(p.name), p), subnetNonInitialPlaces)
  parentNet.places = R.concat(parentNet.places, subnetPlaces)

  const initialSubnetTransitions = R.filter(isSubnetInitialTransition, subnet.transitions)
  assert(R.all(singleInput, initialSubnetTransitions),
    am('Subnet has initial transition with multiple inputs.'))

  const collapsedTransitionLookup = R.fromPairs(R.map(t => [t.name, t], collapsedTransitions))

  const computeOutputs = t => {
    if (isTerminalTransition(t)) {
      const parentTransition = collapsedTransitionLookup[t.name]
      assert(parentTransition, 'No such collapsed transition in parent.')
      return parentTransition.outputs
    }

    return R.map(o => R.assoc('dstPlace', namespaceSubnet(o.dstPlace), o), t.outputs)
  }

  const computeInputs = t => {
    if (isSubnetInitialTransition(t)) {
      const input = R.head(t.inputs)
      assert(input.srcTokenCount === 1, am(`[${t.name}] Initial transition input token count is not 1.`))
      return [{ srcPlace: subnetPlaceName, srcTokenCount: 1 }]
    }

    return R.map(i => R.assoc('srcPlace', namespaceSubnet(i.srcPlace), i), t.inputs)
  }

  const transformSubnetTransition = t => {
    return {
      name: isTerminalTransition(t) ? t.name : namespaceSubnet(t.name),
      tags: t.tags,
      inputs: computeInputs(t),
      outputs: computeOutputs(t)
    }
  }

  const subnetTransitions = R.map(transformSubnetTransition, subnet.transitions)
  parentNet.transitions = R.concat(parentNet.transitions, subnetTransitions)
  globalCount++
}

function expandNet (parentNetName) {
  const parentNet = nets[parentNetName]
  assert(parentNet)
  assert(parentNet.places, parentNet)
  const subnetExpansionPlaces = R.filter(isSubnetPlace, parentNet.places)
  R.forEach(place => expandWith(parentNet, place), subnetExpansionPlaces)
}

const filepath = process.argv[2]
const netStructure = JSON.parse(fs.readFileSync(filepath))
loadNets(netStructure)
const subnetArcs = R.unnest((R.map(computeSubnetArcs, R.values(nets))))
const netDependencies = R.reverse(toposort(subnetArcs))
assert(rootNet.name === R.last(netDependencies))
R.forEach(expandNet, netDependencies)
