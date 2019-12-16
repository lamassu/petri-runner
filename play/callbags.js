const { combine, merge, forEach, fromIter, map, filter, pipe, interval, scan } = require('callbag-basics')
const tap = require('callbag-tap')
const startWith = require('callbag-start-with')
const makeProxy = require('callbag-proxy')

const secondProxy = makeProxy()

const events = pipe(interval(100), map(x => x % 5 === 0 ? x * 10 : x))
const first = pipe(combine(events, filter(x => x === 1000)(secondProxy)), map(x => x[0]))
const second = pipe(first, scan((x, y) => x + (y * 10), 1))
secondProxy.connect(second)

pipe(
  second,
  forEach(x => console.log(x))
)
