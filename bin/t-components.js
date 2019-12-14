const R = require('ramda')

const nets = require('../build/nets/nets.json')

const component = process.argv[2]

// const sn = (subnets, n) => subnets.find(x => x[1] === n)[0]
// const pn = subnets => s => {
//   const match = s.match(/___(\d+)/)
//   if (R.isNil(match)) return 'Root'
//   const num = match[1]
//   return R.isNil(num) ? 'Root' : sn(subnets, parseInt(num))
// }
// const pnn = pn(net.subnets)

const componentLookup = {}
nets.forEach(n => {
  n.transitions.forEach(t => {
    t.tags.forEach(tag => {
      if (
        /^[A-Z]/.test(tag) ||
        tag.startsWith('loop_') ||
        tag.startsWith('timeout_') ||
        tag === 'abort'
      ) return
      componentLookup[tag] = true
    })
  })
})

const components = R.keys(componentLookup)
console.log(`Components in system: ${components.join(', ')}.`)
console.log()

if (!component) {
  console.error('Usage: node t-components.js <component-name>')
  process.exit(1)
}

let transitions = []
nets.forEach(n => {
  const currentTransitions = n.transitions.filter(t => t.tags.includes(component))
  transitions = transitions.concat(currentTransitions.map(t => ({ transition: t.name, net: n.name })))
})

if (transitions.length === 0) {
  console.log(`There are no transitions fired by ${component}.`)
  process.exit(0)
}

console.log(`The following transitions are fired by ${component}:`)
console.log(transitions.map(t => `[${t.net}] ${t.transition}`).join('\n'))
