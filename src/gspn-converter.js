const fs = require('fs')

const xml2json = require('xml2json')
const R = require('ramda')

let transitionInputMap = {}
let transitionOutputMap = {}

function convert (filepath) {
  const xml = fs.readFileSync(filepath)
  const json = JSON.parse(xml2json.toJson(xml, { arrayNotation: ['transition', 'place', 'arc'] }))

  const gspn = json.project.gspn
  const nets = R.map(processNet, gspn)

  console.log(JSON.stringify(nets, null, 2))
}

function mapPlace (json) {
  const tags = split(json['superposition-tags'])
  const name = json.name
  const tokenCount = R.defaultTo(0, parseInt(json.marking))

  return { name, tags, tokenCount }
}

function split (str) {
  return str ? R.split(/\s*,\s*/, str) : []
}

function mapTransitionNode (json) {
  const tags = split(json['superposition-tags'])
  return { name: json.name, tags }
}

function bail (msg) {
  console.log(msg)
  process.exit(1)
}

function processArc (json) {
  const src = json.tail
  const dst = json.head
  const tokenCount = R.defaultTo(1, parseInt(json.mult))
  const kind = json.kind

  if (kind === 'INPUT') {
    transitionInputMap[dst] = R.defaultTo([], transitionInputMap[dst])
    transitionInputMap[dst].push({ srcPlace: src, srcTokenCount: tokenCount })
    return
  }

  if (kind === 'OUTPUT') {
    transitionOutputMap[src] = R.defaultTo([], transitionOutputMap[src])
    transitionOutputMap[src].push({ dstPlace: dst, dstTokenCount: tokenCount })
    return
  }

  bail(`No such arc kind: ${kind}`)
}

function updateTransition (transition) {
  transition.inputs = R.defaultTo([], transitionInputMap[transition.name])
  transition.outputs = R.defaultTo([], transitionOutputMap[transition.name])
}

function processNet (json) {
  transitionInputMap = {}
  transitionOutputMap = {}

  const name = json.name
  const places = R.map(mapPlace, json.nodes.place)
  const transitions = R.map(mapTransitionNode, json.nodes.transition)
  R.forEach(processArc, json.edges.arc)
  R.forEach(updateTransition, transitions)

  const net = { name, places, transitions }
  return net
}

const filepath = process.argv[2]

convert(filepath)
