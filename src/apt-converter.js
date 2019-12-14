const R = require('ramda')
const { tapp } = require('./util')

function convert (net) {
  const name = net.name
  const type = 'PN'

  const places = R.map(R.prop('name'), net.places)
  const removeLoopTransitions = R.reject(R.propSatisfies(R.any(R.startsWith('loop_')), 'tags'))
  const transitions = removeLoopTransitions(net.transitions)

  const transitionNames = R.map(R.prop('name'), transitions)

  const flows = R.map(t => {
    const inputs = R.chain(i => R.repeat(i.srcPlace, i.srcTokenCount), t.inputs)
    const outputs = R.chain(o => R.repeat(o.dstPlace, o.dstTokenCount), t.outputs)
    const join = R.join(',')
    return `${t.name}: {${join(inputs)}} -> {${join(outputs)}}`
  }, transitions)

  const initialMarking = R.flatten(R.pipe(
    R.filter(R.propSatisfies(R.lt(0), 'tokenCount')),
    R.map(p => R.repeat(p.name, p.tokenCount))
  )(net.places))

  const blank = ''
  const lines = R.flatten([
    `.name "${name}"`,
    `.type ${type}`,
    blank,
    '.places',
    places,
    blank,
    '.transitions',
    transitionNames,
    blank,
    '.flows',
    flows,
    blank,
    `.initial_marking {${initialMarking}}`,
    blank
  ])

  return R.join('\n', lines)
}

module.exports = { convert }

const net = require('../build/nets/net.json').net
console.log(convert(net))
