var https_downgrade = require('./https_downgrade.js');
var port=8080;

https_downgrade.filters_set([
  {     dsthosts: [ 'nocompany.co' ],
      urlreplace: [ 'https://nocompany.co' ], // on dsthosts[N], drop and request urlreplace[N]+urlpath instead
   bodytransform: body => body.toString('utf-8').toUpperCase(),
           debug: true,
           // drop: true, // drop will not send any data in response to client request
        },

  {     dsthosts: [ 'nathanfain.com' ],
      urlreplace: [ 'https://nathanfain.com' ], // on dsthosts[N], drop and request urlreplace[N]+urlpath instead
   bodytransform: body => body.toString('utf-8').toUpperCase(),
           debug: true,
           // drop: true, // drop will not send any data in response to client request
        },
      ]);


function test () {
  debugger; // run `node inspect` and call `cont` then `repl` therein to inspect ctx
  console.log('filters', https_downgrade.filters_get())
  var cmd = `curl -x http://localhost:${port} http://nocompany.co/test.txt`;
  console.log('> ' + cmd);
  require('child_process').exec(cmd, function (error, stdout, stderr) {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`${stdout}`);
    https_downgrade.close();
  });
}

https_downgrade.init(test);


