const assert = require('assert')
const R = require('ramda')

// https://char0n.github.io/ramda-adjunct/2.23.0/RA.html#.Y
// http://baconjs.github.io/api3/index.html
// https://github.com/mostjs/core

function expand (initialPlaceName, net) {
  const isLoopTransition = R.pipe(R.prop('outputs'), R.any(R.propEq('dstPlace', initialPlaceName)))
  const loopTransitions = R.filter(isLoopTransition, net.transitions)

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

  const duplicatedNets = R.times(duplicateNet(net, initialPlaceName), loopCount)
  // These sets up the core nets, next we can R.scan through them and fix them up. duplicateNet just does namespacing.
  // R.scan should start from the terminal subnet, so 0 is the terminal subnet.
  // https://github.com/immerjs/immer
}

module.exports = { expand }
