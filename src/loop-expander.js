const assert = require('assert')
const R = require('ramda')
const M = require('@most/core')
const { newDefaultScheduler } = require('@most/scheduler')

// https://char0n.github.io/ramda-adjunct/2.23.0/RA.html#.Y
// http://baconjs.github.io/api3/index.html
// https://github.com/mostjs/core

const appendString = R.flip(R.concat)

const namespaceNet = loopCount => {
  const namespace = appendString(`_${loopCount}`)

  const deepModifier = p => R.map(R.over(R.lensProp(p), namespace))
  const modifier = (f, s) => R.over(R.lensProp(f), deepModifier(s))
  const nameModifier = R.over(R.lensProp('name'), namespace)
  const transitionsModifier = R.map(R.compose(modifier('inputs', 'srcPlace'),
    modifier('outputs', 'dstPlace'), nameModifier))

  const placesModifier = R.map(R.over(R.lensProp('name'), namespace))
  const netModifier = R.compose(R.over(R.lensProp('places'), placesModifier),
    R.over(R.lensProp('transitions'), transitionsModifier))

  return netModifier
}

const integrateNet = (integratedNet, loopNet) => {
  const hasTag = p => R.propSatisfies(R.includes(p), 'tags')
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
  const removeLoopTransitionTag = R.over(loopTransitionTagLens, removeLoopTag)
  const draftTransitionProcessor = R.when(isLoopTransition,
    R.compose(removeLoopTransitionTag, R.set(firstDstLens, loopNetInitialPlaceName)))

  const removeInitialPlaceTag = R.over(initialPlaceTagLens, removeInitialTag)
  const draftPlaceProcessor = R.when(isInitialPlace, removeInitialPlaceTag)

  const places = R.concat(draftPlaceProcessor(draftNet.places), loopNet.places)
  const transitions = R.concat(draftTransitionProcessor(draftNet.transitions),
    pruneLoopNet(loopNet.transitions))

  return { places, transitions, name: loopNet.name }
}

function expandLoop (acc, net) {
  const loopNet = namespaceNet(net)
  if (!acc) {
    return { net: loopNet, count: 0 }
  }

  const loopCount = acc.count
  const expandedNet = integrateNet(loopCount, loopNet, acc.net)

  return { net: expandedNet, count: loopCount + 1 }
}

function expand (initialPlaceName, net) {
  const isLoopTransition = R.pipe(R.prop('outputs'), R.any(R.propEq('dstPlace', initialPlaceName)))
  const loopTransitions = R.filter(isLoopTransition, net.transitions)

  // TODO: Ensure that loop label applies exactly when a transition is a loop transition

  if (loopTransitions.length === 0) return net

  assert(loopTransitions.length === 1, 'Subnets cannot have more than one loop transition.')

  const loopTransition = R.head(loopTransitions)
  assert(loopTransition.outputs.length === 1, 'Loop transitions must have exactly one output arc.')
  assert(loopTransition.inputs.length === 1, 'Loop transitions must have exactly one input arc.')
  const loopPlace = R.head(loopTransition.inputs).srcPlace
  const isLoopPlaceTransition = R.pipe(R.prop('inputs'), R.any(R.propEq('srcPlace', loopPlace.name)))
  const loopPlaceTransitions = R.filter(isLoopPlaceTransition, net.transitions)
  assert(loopPlaceTransitions.length === 2, 'Loop place must have exactly two output transitions.')
  // We already know that one of them is the loop transition

  const loopTags = R.filter(R.startsWith('loop_'), loopTransition.tags)
  assert(R.pipe(R.length, R.equals(1))(loopTags))
  const loopTag = R.head(loopTags)
  const loopCount = parseInt(R.takeLastWhile(x => x !== '_', loopTag))
  assert(R.is(Number, loopCount), 'Loop tag must supply an integer.')

  const processor = R.compose(M.take(loopCount), M.scan(expandLoop, undefined), M.constant(net))
  const stream = processor(M.periodic(0))
  M.runEffects(stream, newDefaultScheduler()).catch(console.log)
}

module.exports = { expand }
