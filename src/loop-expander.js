const assert = require('assert')
const R = require('ramda')
const RA = require('ramda-adjunct')

const { isUnary, appendString, isTerminalTransition, pp } = require('./util')

const hasTag = p => R.propSatisfies(R.includes(p), 'tags')

const namespaceNet = loopCount => {
  const namespace = appendString(`_${loopCount}`)

  const modifier = (func, f, s) => R.over(R.lensProp(f), R.map(R.over(R.lensProp(s), func)))

  const nameModifier = R.over(R.lensProp('name'), namespace)

  const transitionMapper = R.map(
    R.compose(
      modifier(namespace, 'inputs', 'srcPlace'),
      modifier(namespace, 'outputs', 'dstPlace'),
      nameModifier
    )
  )

  const placeMapper = R.map(nameModifier)

  return R.compose(
    R.over(R.lensProp('places'), placeMapper),
    R.over(R.lensProp('transitions'), transitionMapper),
    nameModifier
  )
}

const integrateNet = (integratedNet, loopNet) => {
  const hasTagPrefix = p => R.propSatisfies(R.any(R.startsWith(p)), 'tags')
  const isLoopTransition = hasTagPrefix('loop_')
  const isAbortTransition = hasTag('abort')
  const isTerminalNet = R.isNil(integratedNet)
  const omitTerminalTransitionF = isTerminalNet ? isLoopTransition : isAbortTransition
  const removeTerminalTransition = R.reject(omitTerminalTransitionF)
  const isInitialPlace = hasTag('initial')

  const draftNet = R.defaultTo({ places: [], transitions: [] }, integratedNet)

  const initialPlaceName = R.when(RA.isNotNil, R.prop('name'), R.find(isInitialPlace, draftNet.places))
  pp(draftNet.places)
  console.log(`initialPlaceName: ${initialPlaceName}`)
  const firstDstLens = R.lensPath(['outputs', 0, 'dstPlace'])

  const removeLoopTransitionTag = R.over(R.lensProp('tags'), R.reject(R.startsWith('loop_')))
  const transitionProcessor = R.map(
    R.when(isLoopTransition,
      R.compose(removeLoopTransitionTag, R.set(firstDstLens, initialPlaceName))
    )
  )

  const removeInitialPlaceTag = R.over(R.lensProp('tags'), R.reject(R.includes('initial')))
  const draftPlaceProcessor = R.map(R.when(isInitialPlace, removeInitialPlaceTag))

  const places = R.concat(draftPlaceProcessor(draftNet.places), loopNet.places)

  console.log('LOOPNET')
  pp(loopNet.transitions)
  const transitions = R.concat(
    draftNet.transitions,
    R.pipe(removeTerminalTransition, transitionProcessor)(loopNet.transitions)
  )

  return { places, transitions, name: loopNet.name }
}

function expandLoop (acc) {
  const { net, expandedNet, count } = acc
  const namespace = namespaceNet(count)

  const loopNet = namespace(net)

  const nextExpandedNet = integrateNet(expandedNet, loopNet)

  return { net, count: count - 1, expandedNet: nextExpandedNet }
}

function expand (net) {
  const initialPlaceName = R.compose(R.prop('name'), R.find(hasTag('initial')))(net.places)
  const isLoopTransition = R.pipe(R.prop('outputs'), R.any(R.propEq('dstPlace', initialPlaceName)))
  const loopTransitions = R.filter(isLoopTransition, net.transitions)

  if (R.isEmpty(loopTransitions)) return net

  console.log(net.name)
  assert(loopTransitions.length <= 1, 'Subnets cannot have more than one loop transition.')

  const loopTransition = R.head(loopTransitions)
  assert(loopTransition.outputs.length === 1, 'Loop transitions must have exactly one output arc.')
  assert(loopTransition.inputs.length === 1, 'Loop transitions must have exactly one input arc.')
  const loopPlaceName = R.head(loopTransition.inputs).srcPlace

  const isLoopPlaceTransition = R.pipe(R.prop('inputs'), R.any(R.propEq('srcPlace', loopPlaceName)))
  const loopPlaceTransitions = R.filter(isLoopPlaceTransition, net.transitions)

  const abortTransitionFilter = R.propSatisfies(R.includes('abort'), 'tags')
  const abortTransitions = R.filter(abortTransitionFilter, loopPlaceTransitions)
  assert(isUnary(abortTransitions))

  const loopTransitionFilter = R.propSatisfies(R.any(R.startsWith('loop_')), 'tags')
  const loopTagTransitions = R.filter(loopTransitionFilter, loopPlaceTransitions)

  assert(isUnary(loopTagTransitions))
  const loopTagTransition = R.head(loopTagTransitions)
  const loopTags = R.filter(R.startsWith('loop_'), loopTagTransition.tags)
  assert(isUnary(loopTags))
  const loopTag = R.head(loopTags)
  const loopCountStr = R.takeLastWhile(x => x !== '_', loopTag)
  const loopCount = parseInt(loopCountStr)
  assert(R.both(R.is(Number), R.gt(10))(loopCount), 'Loop tag must supply an integer less than 10.')

  // Make sure that no other transitions have these special labels
  const countWhenEq = pred => count => list => R.equals(count, R.reduce(R.when(pred, R.inc), 0, list))
  assert(countWhenEq(abortTransitionFilter, 1, net.transitions))

  const isFinishedLooping = R.propEq('count', -1)
  const loopedNet = R.prop('expandedNet',
    R.until(isFinishedLooping, expandLoop, { net, count: loopCount - 1 }))

  const packaged = packageLoopedNet(loopedNet)
  pp(packaged)
  return packaged
}

function packageLoopedNet (net) {
  const unindex = R.takeWhile(x => x !== '_')
  const unindexedName = R.pipe(R.prop('name'), unindex)
  const [terminalTransitions, nonTerminalTransitions] =
    R.partition(isTerminalTransition, net.transitions)

  const groupedTransitions = R.groupBy(unindexedName, terminalTransitions)

  const toPlaceName = name => R.concat(R.toUpper(R.head(name)), R.tail(name))
  const createNewPlace = name => ({ name: toPlaceName(name), tags: [], tokenCount: 0 })

  const createNewTransition = name => ({
    name,
    tags: [],
    inputs: [{ srcPlace: toPlaceName(name), srcTokenCount: 1 }],
    outputs: []
  })

  const transformTerminalTransitions = (transitions, group) => {
    const transformTransition = R.set(R.lensProp('outputs'),
      [{ dstPlace: toPlaceName(group), dstTokenCount: 1 }])
    return R.map(transformTransition, transitions)
  }

  const isInitialPlace = R.propSatisfies(R.includes('initial'), 'tags')
  const initialPlaces = R.filter(isInitialPlace, net.places)
  assert(isUnary(initialPlaces))

  const transformPlace = R.when(isInitialPlace, R.over(R.lensProp('name'), unindex))

  const mapObjToValues = R.pipe(R.mapObjIndexed, R.values, R.unnest)
  const transitions = R.unnest([
    nonTerminalTransitions,
    mapObjToValues(transformTerminalTransitions, groupedTransitions),
    R.map(createNewTransition, R.keys(groupedTransitions))
  ])

  const places = R.unnest([
    R.map(createNewPlace, R.keys(groupedTransitions)),
    R.map(transformPlace, net.places)
  ])

  console.log(`unindexed: ${unindex(net.name)}, ${net.name}`)
  return { name: unindex(net.name), places, transitions }
}

module.exports = {
  expand,
  internal: { namespaceNet }
}

// Look into first loopnet, where expandedNet is null. Don't want to set loopTransition on this.

// The plot thickens: do we expand before looping or afterwards? Need to loop all the expansions.

// Loop before: need to loop all subnets for each loop

// 1. A contains B.
// 2. A has a loop.
// 3. We need to duplicate and namespace the subnet for each loop iteration and match up collapsed transitions with
//   terminal transitions.
// 4. If a place is a SubnetPlace and the place is namespaced with a loop index, we need to namespace the subnet as well.


// Loop after: this means looping the expanded net

// There will be multiple loops in the net which will not point to initial places. I think this is too complicated.

// Consider a much simpler approach: selectively removing loop transitions for analysis.

// Another possibility:
// Instead of expanding loops after whole net is integrated, expand loops at each level of integration.
// All previous loops will already have been expanded and there will be no loop tags for those.
//
