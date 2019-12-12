const assert = require('assert')
const R = require('ramda')

const { isUnary, appendString, pp } = require('./util')

const hasTag = p => R.propSatisfies(R.includes(p), 'tags')

const namespaceNet = loopCount => {
  // Outermost loop is regular net
  if (loopCount === 0) return R.identity

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

  const initialPlaceName = R.when(R.complement(R.isNil), R.prop('name'), R.find(isInitialPlace, draftNet.places))

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

  const transitions = R.concat(
    draftNet.transitions,
    R.compose(removeTerminalTransition, transitionProcessor)(loopNet.transitions)
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
  return R.prop('expandedNet', R.until(isFinishedLooping, expandLoop, { net, count: loopCount - 1 }))
}

module.exports = {
  expand,
  internal: { namespaceNet }
}
