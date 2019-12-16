const { create } = require('most-subject')
const { take, runEffects, tap, map, merge, filter, delay, startWith, periodic, scan, combineArray } = require('@most/core')
const { newDefaultScheduler } = require('@most/scheduler')

// Create a new Scheduler for use in our application.
// Usually, you will want to only have one Scheduler, and it should be shared
// across your application.
const scheduler = newDefaultScheduler()

const [sink, secondProxy] = create()

const events = tap(x => console.log(`evt: ${x}`), scan(x => x % 5 === 0 ? 1 : x + 1, 1, periodic(1000)))

const first = tap(x => console.log(`1st: ${x}`), take(20, delay(100, combineArray((x, y) => x + y, [events, secondProxy]))))
const second = scan((x, y) => x + (y * 10), 1, first)

runEffects(tap(x => console.log(`2nd: ${x}`), take(20, second)), scheduler)

sink.attach(second)
