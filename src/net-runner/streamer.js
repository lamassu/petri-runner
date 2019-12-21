const R = require('ramda')
const RA = require('ramda-adjunct')

const { create } = require('most-subject')

const {
  runEffects, map, merge, scan, periodic, withItems, tap, multicast, filter
} = require('@most/core')

const { newDefaultScheduler } = require('@most/scheduler')

const netRun = require('./net-run')
const netState = require('./net-state')
const autoTransitions = require('./auto-transitions')

const { pp } = require('../util')

function runPetriStream (eventStream, logic) {
  const [petriSink, petriProxy] = create()

  const sharedPetri = multicast(petriProxy)
  const autoStream = R.pipe(map(autoTransitions.mapper), filter(RA.isNotNil))(sharedPetri)
  const logicStream = map(logic, sharedPetri)
  const fullStream = merge(eventStream, logicStream, autoStream)
  const petriStream = scan(netRun.handler, { marking: netState.initialMarking() }, fullStream)
  petriSink.attach(petriStream)

  return logicStream
}

function run (eventStream, logic) {
  netState.load('./build/nets/net.json')
  const logicStream = tap(console.log, runPetriStream(eventStream, logic))
  const scheduler = newDefaultScheduler()
  runEffects(logicStream, scheduler)
}

const logic = x => x

// const firings = ['cashIn', 'start___17', 'skipTermsAndConditions___11__17']
const firings = ['cashIn', 'start', 'skipTermsAndConditions']
const firingRecs = R.map(x => ({ transitionName: x, data: `data: ${x}` }), firings)
const eventStream = withItems(firingRecs, periodic(100))

run(eventStream, logic)
