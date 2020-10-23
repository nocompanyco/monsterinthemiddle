
console.log('LOAD PLUGIN.JS, DISCOVERY AVAILABLE TRIGGERS\n');

console.log(`EXPECTING:

    found module Example example.js
    found module intercept intercept.js
    plugin Example has trigger_on type raw_packets
    plugin Example has trigger_on type parsed_packets
    plugin Example has trigger_on type new_hosts
    plugin intercept has trigger_on type raw_packets
    mapped triggers: { raw_packets: [ [Function: raw_packets], [Function: raw_packets] ],
    parsed_packets: [ [Function: parsed_packets] ],
    new_hosts: [ [Function: new_hosts] ] }
    { raw_packets: [ [Function: raw_packets], [Function: raw_packets] ],
    parsed_packets: [ [Function: parsed_packets] ],
    new_hosts: [ [Function: new_hosts] ] }

`);

console.log('RESULTS:\n')
var plugins = require('../plugins.js')
plugins.all.triggers_populate()
console.log(plugins.all.triggers_get())
