const Emittery = require('emittery')

const netRun = require('./net-runner/net-run')
const emitter = new Emittery()

const prevRec = {}    // Initial marking

emitter.on('firing', firing => {
    const result = netRun.handler(prevRec, firing)
    result.marking = result.marking
    emitter.emit('state-change', result.stateChange)

    // Update net-run.js to change firing to stateChange; change stateChange record structure to make it more compatible with events.
    // Run automatic events each time to check for any possible automatic transitions to fire.
    // Timeouts should already be handled in current code as automatic transitions. Test.

}