import test from 'ava'

const netGluer = require('../src/net-gluer')

const nets = require('../build/nets/nets.json')

test('net gluer', t => {
  netGluer.run(nets)
})
