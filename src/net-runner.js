const R = require('ramda')

const net = {}
const marking = {}

function warn (msg, warning) {
  console.error(warning)
}

function findMatchedTransition (msg) {
  // Search for transitions within supplied scope.
  // If we find multiple transitions within the same scope level, throw an error.
  // Messages can be statically checked for this issue.
}

function emit (msg) {
  console.error(msg)
}

function fireTransition (msg, transition) {
  const transitionName = transition.name
  const validateInput = i => marking[i.srcPlace] >= i.srcTokenCount
  if (!R.all(validateInput, transition.inputs)) {
    warn(msg, `Could not fire transition ${transitionName}`)
    return
  }

  const adjustMarkingInput = i => {
    marking[i.srcPlace] = marking[i.srcPlace] - i.srcTokenCount
  }

  const adjustMarkingOutput = o => {
    marking[o.dstPlace] = marking[o.dstPlace] + o.dstTokenCount
  }

  R.forEach(adjustMarkingInput, transition.inputs)
  R.forEach(adjustMarkingOutput, transition.outputs)

  emit({ action: 'transitionFire', msg })
}

function firingEventHandler (msg) {
  const transition = findMatchedTransition(msg)
  if (R.isEmpty(transition)) {
    warn(msg, 'No matching transitions')
    return
  }

  fireTransition(transition)
}
