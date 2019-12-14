set -e
node src/gspn-converter.js ~/projects/lamassu-statebox/lamassu6.PNPRO > build/nets/nets.json
node bin/pn-gluer.js build/nets/nets.json > build/nets/net.json
node src/net-checker.js
