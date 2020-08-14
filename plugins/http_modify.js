// using https://github.com/joeferner/node-http-mitm-proxy#readme

var Proxy = require('http-mitm-proxy');
var iptables = require('./lib/iptables.js');

var port = 8080;
var proxy = Proxy();

// match and replace content or drop
var filters = [
  { 'dsthosts' : ['nocompany.co'],
        'drop' : false,
     'content' : {   'match' : new RegExp('<body.*?<\/body>',"g"),
                   'replace' : '<body>REPLACED</body>' } },
  { 'dsthosts' : ['45.76.82.70_TMEPINVALID'],
        'drop' : true,
     'content' : {   'match' : '301 Moved Permanently',
                   'replace' : null } },
  { 'dsthosts' : ['45.76.82.70'],
        'drop' : false,
     'content' : {   'match' : /301 Moved Permanently/g,
                   'replace' : '200' },
     'headers' : { 'ctx_path' : 'ctx.serverToProxyResponse.statusCode',
                      'match' : 301,
                    'replace' : 200 } }
]

// this is updated by functions that edit filters and is just used to more quickly check for hosts
// retains the filter index
var filters_hosts = [];
var filters_hosts_index = {}
function update_filters_hosts() {
  filters_hosts = filters.map(f => f.dsthosts).flat();
  filters.forEach( (f, index) => {
    f.dsthosts.forEach(host => {
      filters_hosts_index[host] = index;
    });
  });
}
update_filters_hosts();


proxy.onError(function(ctx, err) {
  console.error('proxy error:', err);
});

proxy.onRequest(function(ctx, callback) {

  if (filters_hosts.indexOf(ctx.clientToProxyRequest.headers.host) >= 0)
  {
    console.log(ctx.clientToProxyRequest.headers)
    console.log(ctx.clientToProxyRequest.rawHeaders)
    console.log(ctx.clientToProxyRequest.url)
    console.log(ctx.clientToProxyRequest.socket._sockname)
    console.log(ctx.clientToProxyRequest.socket._peername)
    console.log()
    console.log(ctx.proxyToClientResponse.socket._sockname)
    console.log(ctx.proxyToClientResponse.socket._peername)
  
    console.log(require('util').inspect(ctx, showHidden=true, depth=12, colorize=true));
      // && ctx.clientToProxyRequest.url.indexOf('/') == 0) {
    // ctx.use(Proxy.gunzip);
    debugger; // run `node inspect` and call `cont` then `repl` therein to inspect ctx

    var filter_index = filters_hosts_index[ctx.clientToProxyRequest.headers.host];
    var filter = filters[filter_index];
    console.log(`filter: ${filter_index}`,filter)
    

    if (filter.hasOwnProperty('content') ) {
      // If filterint content setup data filter
      ctx.onResponseData(function(ctx, chunk, callback) {
          if (filter.drop !== true && filter.content.replace !== null) {
            chunk = new Buffer(chunk.toString().replace(filter.content.match, filter.content.replace));
            return callback(null, chunk);
          }
          else if (filter.drop) { // can only prevent content being return. headers from server still returned
            return callback(null, chunk);
          }
      });
    }

    if (filter.hasOwnProperty('headers')) {
      // if filtering headers setup a response filter
      ctx.onResponse(function(ctx, callback) {
        console.log('onResponse');
        console.log(ctx.serverToProxyResponse.headers)
        console.log(ctx.serverToProxyResponse.statusCode)
        debugger;
        if (eval(filter.headers.ctx_path) === filter.headers.match) {
          console.log('change',eval(filter.headers.ctx_path), '&', filter.headers.match, 'to', filter.headers.replace)
          eval(`${filter.headers.ctx_path} = ${filter.headers.replace}`)
        }
        return callback();
      })
    }

  }
  return callback();
});

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
curl -x 'http://localhost:8080' http://nocompany.co
<html><head><style>
body {background-image: url("./n.png");}
_@media (orientation: landscape) { img{height:8vw;} }
_@media (orientation: portrait)  { img{height:10vh;} }
</style></head><body>Pwned!</body></html>
*/
