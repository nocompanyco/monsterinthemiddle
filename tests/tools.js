// called by tests to log results to txt and print to stdout

const fs = require('fs');
const util = require('util');

let logfile = null;

function log () {
  process.stdout.write(util.format.apply(this, arguments) + '\n');
  if (logfile) 
    fs.appendFileSync(logfile, util.format.apply(this, arguments) + '\n', 'utf8' )
}
module.exports.log = log;

// if set then will also log to file
module.exports.logfile = function (name) { 
  logfile = name; 
}

module.exports.perf = function(label, fn, iterations=100000) {
  // run once to record retun value:
  var ret = fn();
  let startTime = new Date().getTime();
  for(let i = 0; i < iterations; i++ ) fn();
  let endTime = new Date().getTime();
  log(`${label} :\t${(endTime - startTime)}ms (${iterations} iterations, returns ${ret})`);
}


