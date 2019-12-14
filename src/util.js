const util = require('util')

const R = require('ramda')

const appendString = R.flip(R.concat)
const isUnary = R.pipe(R.length, R.equals(1))

const lensList = pred => R.lens(
  R.find(pred),
  (v, o) => {
    const idx = R.findIndex(pred, o)
    return R.update(idx, v, o)
  }
)

const pp = o => console.error(util.inspect(o, { colors: true, depth: null }))

const tapp = R.tap(pp)

const isTerminalTransition = R.propSatisfies(R.isEmpty, 'outputs')

module.exports = { appendString, isUnary, isTerminalTransition, lensList, pp, tapp }
