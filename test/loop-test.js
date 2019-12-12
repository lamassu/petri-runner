import test from 'ava'
const R = require('ramda')

const LE = require('../src/loop-expander')
const { pp } = require('../src/util')

const nets = require('../build/nets/nets.json')

const isNetName = name => R.find(R.propEq('name', name))

test('expand', t => {
  const net = isNetName('SmsHandleCode')(nets)
  const expandedNet = LE.expand(net)
  pp(expandedNet)

  // outermost loop transition not getting processed
})

test('namespaceNet', t => {
  const net = isNetName('SmsHandleCode')(nets)
  LE.internal.namespaceNet(2)(net)
  t.pass()
})
