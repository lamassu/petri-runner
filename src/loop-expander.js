const assert = require('assert')
const R = require('ramda')

const { isUnary, appendString, lensList, pp } = require('./util')

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
  const hasTagPrefix = p => R.propSatisfies(R.any(R.startsWith(p), 'tags'))
  const isLoopTransition = hasTagPrefix('loop_')
  const isAbortTransition = hasTag('abort')
  const isTerminalNet = R.isNil(integratedNet)
  const omitTerminalTransitionF = isTerminalNet ? isLoopTransition : isAbortTransition
  const removeTerminalTransition = R.reject(omitTerminalTransitionF)
  const isInitialPlace = hasTag('initial')

  const draftNet = R.defaultTo({ places: [], transitions: [] }, integratedNet)

  const loopNetInitialPlace = R.find(isInitialPlace, loopNet.places)
  assert(loopNetInitialPlace)
  const loopNetInitialPlaceName = loopNetInitialPlace.name

  const firstDstLens = R.lensPath(['outputs', 0, 'dstPlace'])

  const pruneLoopNet = R.filter(removeTerminalTransition)

  const loopTransitionTagLens = R.compose(
    R.lensProp('transitions'),
    lensList(isLoopTransition),
    R.lensProp('tags')
  )

  const removeLoopTransitionTag = R.over(loopTransitionTagLens, R.reject(R.startsWith('loop_')))
  const draftTransitionProcessor = R.map(
    R.when(isLoopTransition,
      R.compose(removeLoopTransitionTag, R.set(firstDstLens, loopNetInitialPlaceName))
    )
  )

  const initialPlaceTagLens = R.compose(
    lensList(isInitialPlace),
    R.lensProp('tags')
  )
  const removeInitialPlaceTag = R.over(R.lensProp('tags'), R.reject(R.includes('initial')))
  const draftPlaceProcessor = R.map(R.when(isInitialPlace, removeInitialPlaceTag))

  // const draftPlaceProcessor = R.map(R.identity)

  pp(draftNet.places)
  pp(loopNet.places)
  pp(draftPlaceProcessor(draftNet.places))
  console.log('debug1')

  const places = R.concat(draftPlaceProcessor(draftNet.places), loopNet.places)
  console.log('debug2')

  const transitions = R.concat(draftTransitionProcessor(draftNet.transitions),
    pruneLoopNet(loopNet.transitions))
  console.log('debug3')

  return { places, transitions, name: loopNet.name }
}

function expandLoop (acc) {
  const { net, expandedNet, count } = acc
  const namespace = namespaceNet(count)

  const loopNet = namespace(net)
  const nextExpandedNet = integrateNet(expandedNet, loopNet)

  return { net, count: count + 1, expandedNet: nextExpandedNet }
}

function expand (net) {
  const initialPlaceName = R.compose(R.prop('name'), R.find(hasTag('initial')))(net.places)
  const isLoopTransition = R.pipe(R.prop('outputs'), R.any(R.propEq('dstPlace', initialPlaceName)))
  const loopTransitions = R.filter(isLoopTransition, net.transitions)

  if (R.isEmpty(loopTransitions)) return net

  assert(isUnary(loopTransitions), 'Subnets cannot have more than one loop transition.')

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
  const loopTags = R.filter(loopTransitionFilter, loopPlaceTransitions)

  assert(isUnary(loopTags))

  const loopTag = R.head(loopTags)
  const loopCount = parseInt(R.takeLastWhile(x => x !== '_', loopTag))
  assert(R.both(R.is(Number, loopCount), R.lt(10)), 'Loop tag must supply an integer less than 10.')

  // Make sure that no other transitions have these special labels
  const countWhenEq = pred => count => list => R.equals(count, R.reduce(R.when(pred, R.inc), 0, list))
  assert(countWhenEq(abortTransitionFilter, 1, net.transitions))

  const isFinishedLooping = R.propEq('count', loopCount)
  return R.prop('expandedNet', R.until(isFinishedLooping, expandLoop, { net, count: 0 }))
}

module.exports = {
  expand,
  internal: { namespaceNet }
}
