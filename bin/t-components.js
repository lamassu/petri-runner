const R = require('ramda')

const nets = require('../build/nets/nets.json')
const netRec = require('../build/nets/net.json')

const component = process.argv[2]

const componentLookup = {}
nets.forEach(n => {
  n.transitions.forEach(t => {
    const filter = tag => {
      return /^[A-Z]/.test(tag) ||
        tag.startsWith('loop_') ||
        tag.startsWith('timeout_') ||
        tag === 'abort'
    }
    const tags = R.reject(filter, t.tags)
    if (tags.length > 1) {
      console.log(`WARN: More than one component tag: ${tags.join(', ')}`)
    }

    tags.forEach(tag => { componentLookup[tag] = true })
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
const subnets = netRec.subnets.map(s => s[0])
subnets.forEach(s => {
  const n = nets.find(nn => nn.name === s)
  const currentTransitions = n.transitions.filter(t => t.tags.includes(component))
  transitions = transitions.concat(currentTransitions.map(t => ({ transition: t.name, net: n.name })))
})

if (transitions.length === 0) {
  console.log(`There are no transitions fired by ${component}.`)
  process.exit(0)
}

console.log(`The following ${transitions.length} transitions are fired by ${component}:`)
console.log(transitions.map(t => `[${t.net}] ${t.transition}`).join('\n'))
