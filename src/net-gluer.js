const assert = require('assert')

const graphlib = require('@dagrejs/graphlib')
const R = require('ramda')
const chalk = require('chalk')

const { isUnary, isTerminalTransition, pp, tapp } = require('./util')

const Graph = graphlib.Graph

const subnetLookup = {}

function warn (msg) {
  console.error(chalk.yellow(chalk.bold('WARNING: '), msg))
}

function bail (msg) {
  console.error(`error: ${msg}`)
  process.exit(1)
}

function validateNet (net) {
  const initialPlaces = R.filter(r => R.includes('initial', r.tags), net.places)

  if (initialPlaces.length > 1) bail(`Multiple initial tags in net ${net.name}`)

  if (initialPlaces.length < 1) {
    console.error(chalk.yellow(`No initial tags in net ${net.name}, skipping...`))
    return
  }

  const invalidName = R.contains('__')
  const invalidPlaceName = R.either(invalidName, R.test(/^[^A-Z]/))
  const invalidTransitionName = R.either(invalidName, R.test(/^[^a-z]/))

  const invalidPlace = R.find(R.propSatisfies(invalidPlaceName, 'name'), net.places)
  assert(!invalidPlace, `[${net.name}] Has invalid place name: ${R.prop('name', invalidPlace)}.`)

  const invalidTransition = R.find(R.propSatisfies(invalidTransitionName, 'name'), net.transitions)
  assert(!invalidTransition, `[${net.name}] Has invalid transitions name: ${R.prop('name', invalidTransition)}.`)
}

const subnetName = place => {
  const subnets = R.filter(R.test(/^[A-Z]/), place.tags)
  assert(subnets.length <= 1, `Place ${place.name} has multiple subnet tags: ${R.join(', ', subnets)}.`)
  return R.isEmpty(subnets) ? null : R.head(subnets)
}

const isSubnetPlace = place => {
  return !R.isNil(subnetName(place))
}

function computeSubnetArcs (parentNet) {
  const parentNetName = parentNet.name
  const subnetNames = R.map(subnetName, R.filter(isSubnetPlace, parentNet.places))
  return R.map(R.pair(parentNetName), subnetNames)
}

function duplicates (arr) {
  const counts = {}
  const updateCount = r => { counts[r] = R.defaultTo(0, counts[r]) + 1 }
  R.forEach(updateCount, arr)
  return R.filter(r => counts[r] > 1, arr)
}

const findNet = R.curry((nets, netName) => R.find(R.propEq('name', netName), nets))

const expandWith = R.curry((nets, parentNet, expansionPlace) => {
  const expansionPlaceName = expansionPlace.name

  const oldSubnetId = subnetLookup[expansionPlaceName]
  const subnetId = R.isNil(oldSubnetId) ? R.length(R.keys(subnetLookup)) : oldSubnetId
  if (R.isNil(oldSubnetId)) subnetLookup[expansionPlaceName] = subnetId

  const subnetPlaceName = subnetName(expansionPlace)
  assert(subnetPlaceName)
  const am = s => `${parentName} <- ${subnetPlaceName}: ${s}`
  const subnet = findNet(nets, subnetPlaceName)
  const parentName = parentNet.name
  assert(subnet, am('No such subnet.'))

  const isInitialPlace = R.pipe(R.prop('tags'), R.includes('initial'))
  assert(subnet.places)

  const subnetInitialPlaces = R.filter(isInitialPlace, subnet.places)
  assert(subnetInitialPlaces.length === 1, am("Subnet doesn't have single initial place"))

  const subnetInitialPlace = R.head(subnetInitialPlaces)
  assert(subnetInitialPlace.name === subnetPlaceName, am('Subnet initial place incorrectly named.'))
  const toSortedTransitionNames = R.pipe(R.map(R.prop('name')), R.sortBy(R.identity))

  assert(subnet.transitions)
  const subnetTerminalTransitions = R.filter(isTerminalTransition, subnet.transitions)
  const subnetTerminalTransitionNames = toSortedTransitionNames(subnetTerminalTransitions)
  const isTransitionSingleSource = R.propSatisfies(isUnary, 'inputs')
  assert(R.all(isTransitionSingleSource, subnetTerminalTransitions), am('Terminal transitions must have single source.'))

  const isParentInitialTransition = R.pipe(R.prop('inputs'), R.any(R.propEq('srcPlace', expansionPlaceName)))
  const isSubnetInitialTransition = R.pipe(R.prop('inputs'), R.any(R.propEq('srcPlace', subnetPlaceName)))
  assert(parentNet.transitions)
  const collapsedTransitions = R.filter(isParentInitialTransition, parentNet.transitions)
  const warnInvalidCollapsedTransition = t => {
    if (!R.includes(subnetPlaceName, t.tags)) {
      warn(am(`Collapsed transition ${t.name} is missing subnet tag.`))
    }
  }
  R.forEach(warnInvalidCollapsedTransition, collapsedTransitions)

  const singleInput = R.pipe(R.prop('inputs'), R.length, R.equals(1))
  assert(R.all(singleInput, collapsedTransitions),
    am('Has collapsed transition with multiple inputs.'))
  const collapsedTransitionNames = toSortedTransitionNames(collapsedTransitions)
  assert(R.equals(subnetTerminalTransitionNames, collapsedTransitionNames),
    am(
      'Collapsed transitions differ from subnet terminal transitions.' +
      `\nMissing from ${parentName}: [${R.difference(subnetTerminalTransitionNames, collapsedTransitionNames)}]` +
      `\nMissing from ${subnetPlaceName}: [${R.difference(collapsedTransitionNames, subnetTerminalTransitionNames)}]`
    )
  )

  // parent places remain the same
  // add namespaced subplaces, except for initial place
  const subnetNonInitialPlaces = R.reject(isInitialPlace, subnet.places)

  // full namespacing: <name>___<subnetId>__<subnetId>...
  const namespaceSubnet = name => {
    // format is <name>__<expansionPlaceName>__<expansionPlaceName>_...
    assert(R.is(String, name), 'subnetName is not a string.')
    if (R.contains('___', name)) return `${name}__${subnetId}`
    return `${name}___${subnetId}`
  }

  const initialSubnetTransitions = R.filter(isSubnetInitialTransition, subnet.transitions)
  assert(R.all(singleInput, initialSubnetTransitions),
    am('Subnet has initial transition with multiple inputs.'))

  const collapsedTransitionLookup = R.fromPairs(R.map(t => [t.name, t], collapsedTransitions))

  const computeOutputs = t => {
    if (isTerminalTransition(t)) {
      const parentTransition = collapsedTransitionLookup[t.name]
      assert(parentTransition, am(`No collapsed transition ${t.name} in parent.`))
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

  const transformNet = R.compose(
    R.over(R.lensProp('places'),
      R.concat(R.map(R.over(R.lensProp('name'), namespaceSubnet), subnetNonInitialPlaces))
    ),
    R.over(R.lensProp('transitions'),
      R.pipe(
        R.reject(isParentInitialTransition),
        R.concat(R.map(transformSubnetTransition, subnet.transitions))
      )
    )
  )

  return transformNet(parentNet)
})

const expandNet = R.curry((nets, parentNet) => {
  const subnetExpansionPlaces = R.filter(isSubnetPlace, parentNet.places)

  return R.append(R.reduce(expandWith(nets), parentNet, subnetExpansionPlaces), nets)
})

function run (nets) {
  const depGraph = new Graph()
  R.forEach(validateNet, nets)
  const subnetArcs = R.unnest((R.map(computeSubnetArcs, nets)))

  const dependencyLookup = {}
  const buildLookup = arc => {
    dependencyLookup[arc[1]] = R.append(arc[0], dependencyLookup[arc[1]])
  }
  R.forEach(buildLookup, subnetArcs)

  R.forEach(a => depGraph.setEdge(a[0], a[1]), subnetArcs)
  const isRoot = R.pipe(R.prop('places'), R.any(R.propSatisfies(R.includes('root'), 'tags')))
  const rootNet = R.find(isRoot, nets)
  const connectedNodes = graphlib.alg.preorder(depGraph, rootNet.name)
  const allNetNames = R.union(depGraph.nodes(), R.map(R.prop('name'), nets))
  const unconnectedNodes = R.difference(allNetNames, connectedNodes)
  R.forEach(n => depGraph.removeNode(n), unconnectedNodes)
  const netDependencies = R.reverse(graphlib.alg.topsort(depGraph))
  assert(rootNet.name === R.last(netDependencies))

  const sortedNets = R.map(findNet(nets), netDependencies)
  const net = R.last(R.reduce(expandNet, [], sortedNets))

  const allPlaces = R.map(R.prop('name'), rootNet.places)
  assert(R.isEmpty(duplicates(allPlaces)))

  subnetLookup[rootNet.name] = R.length(R.keys(subnetLookup))

  const subnets = R.sortBy(R.prop('1'), R.toPairs(subnetLookup))
  return { net, subnets }
}

module.exports = { run }

// Note: The firing message
// can include a scoping context which can be a subset of the context path.
// Only matching transitions in that scoping context will fired.

// Map expansionPlaceNames to subnetPlaceNames.
// Dependency graph of expansionPlaceNames. Alternatively, forbid multiple subnets of same type in a net.
// This will simplify a little, and we're not using this feature anyway. **Do this**.

// New tests:
// All places mentioned in transitions are defined in places.
// Check a sampling of paths.
// Do lots of sampling tests on net-runner. Run a net with transitions, and check for correct marking.
// Check for rejected transitions.
// Check for correctly matched transitions. Might want to factor transition finding to its own module.
