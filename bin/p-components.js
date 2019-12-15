const R = require('ramda')

const nets = require('../build/nets/nets.json')
const netRec = require('../build/nets/net.json')

const component = process.argv[2]

const componentLookup = {}
nets.forEach(n => {
  n.places.forEach(p => {
    const filter = tag => {
      return /^[A-Z]/.test(tag) ||
      tag === 'initial' ||
      tag === 'root'
    }
    const tags = R.reject(filter, p.tags)
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
  console.error('Usage: node p-components.js <component-name>')
  process.exit(1)
}

let places = []
const subnets = netRec.subnets.map(s => s[0])
subnets.forEach(s => {
  const n = nets.find(nn => nn.name === s)
  const currentPlaces = n.places.filter(t => t.tags.includes(component))
  places = places.concat(currentPlaces.map(p => ({ place: p.name, net: n.name })))
})

if (places.length === 0) {
  console.log(`There are no places associated with ${component}.`)
  process.exit(0)
}

console.log(`The following ${places.length} places are associated with ${component}:`)
console.log(places.map(p => `[${p.net}] ${p.place}`).join('\n'))
