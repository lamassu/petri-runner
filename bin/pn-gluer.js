const fs = require('fs')

const netGluer = require('../src/net-gluer')

const filepath = process.argv[2]
const netStructure = JSON.parse(fs.readFileSync(filepath))
const nets = netGluer.run(netStructure)
console.log(JSON.stringify(nets))
