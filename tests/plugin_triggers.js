
console.log('TEST SOME TRIGGERS TO CONFIRM DEREFERENCING TRIGGER FUNCTIONS WORKS. DATA GIVEN NOT VALID BUT STILL CAN BE USED TO SEE THAT TRIGGERS FROM EXAMPLE PLUGIN FIRE\n');

console.log(`EXPECTING:

    example.js raw_packet DEADFEED
    intercept.js raw_packet DEADFEED

    example.js parsed_packet DEADFEED

    example.js new_host: host2 , hosts: [ 'host1', 'host2' ]
`);

console.log('\nRESULTS:\n')

var plugins = require('../plugins.js')
plugins.all.triggers_populate()

console.log('\nTRY TYPE raw_packet:\n')

plugins.all.triggers_run('raw_packet', "DEADFEED");

console.log('\nTRY TYPE parsed_packet:\n')

plugins.all.triggers_run('parsed_packet', "DEADFEED");

console.log('\nTRY TYPE decoded_packet:\n')

plugins.all.triggers_run('decoded_packet', "DEADFEED");

console.log('\nTRY TYPE new_host:\n')

plugins.all.triggers_run('new_host', "host2", ["host1","host2"]);
