const util = require('util')

const R = require('ramda')

const appendString = R.flip(R.concat)
const isUnary = R.pipe(R.length, R.eq(1))

const lensList = pred => R.lens(
  R.find(pred),
  (v, o) => {
    const idx = R.findIndex(pred, o)
    return R.update(idx, v, o)
  }
)

const pp = o => console.log(util.inspect(o, { colors: true, depth: null }))

module.exports = { appendString, isUnary, lensList, pp }
