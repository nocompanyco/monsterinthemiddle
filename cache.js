'use strict';

/*
Written by cyphunk@deadhacker.com for use in the Anonymous-P theater production.
*/


// could definitely reduce this down to one or two types of generic cache


//var ieeeoui  = require('ieee-oui-lookup');
const ieeeoui        = require('./cache_oui');
const geolite2       = require('geolite2-redist');
const maxmind        = require('maxmind');
const dnser          = require('dns');
const fs             = require('fs');
const ipjs           = require('./ip.js')
const LOAD_FROM_FILE = true;                        // Set to true to load caches from disk
const DEBUG_MDNS     = true;                        // set to true to see messages for mdns name resolution
const DEBUG_GEOIP    = false;                       // show debug messages for geoip resolution

var oui = (function () {
    var cache    = {},
        requests = {};
    var file     = __dirname+'/data/save_oui.json';
    if (LOAD_FROM_FILE) {
        fs.exists(file, function(exists) {
            if (exists) {
                console.log('loading '+file);
                // catch when file is empty
                try { cache = require(file); }
                catch (e) { console.error(e); }
            }
        });
    }

    function lookup_ptr(macoui, callback) {
        if (cache[macoui]) {
            return cache[macoui];
        }
        else {
            if (ieeeoui.ready && (! requests[macoui]) ) {
                requests[macoui] = true;

                ieeeoui.lookup(macoui, function(err, name) {
                  if (err) {
                    cache[macoui] = '';
                    console.log('cache oui err:', err);
                  }
                  else {
                    cache[macoui] = name;
                    if (typeof callback === 'function') {
                        callback(name);
                    }
                  }
                  delete requests[macoui];
                });
            }
            return '';
          }
    }
    function save() {
        var string = JSON.stringify(cache, null, 4);
        if (string.length <= 3) // empty files cause issues on load via require()
            return
        if (!fs.existsSync('./data')){ fs.mkdirSync('./data'); }
        fs.writeFile(file, string, function(err) {
            if (err)
                console.log(file+' '+err);
            else
                console.log('saved '+file);
        });
    }
    return {
        ptr: function (macoui, callback) {
            return lookup_ptr(macoui, callback);
        },
        save: function () { save(); },
        show: function () { console.log('oui'); console.log(cache) }
    };
}());
module.exports.oui = oui;


// The IP to Geo Location library is blocking. Actually might not
// be but I am currently too lazy to test so created a cache
// interface
let geolookup = geolite2.open('GeoLite2-Country', path => {
    let buf = fs.readFileSync(path);
    return new maxmind.Reader(buf);
});
//
var geo = (function () {
    var cache    = {},
        requests = {};
    var file     = __dirname+'/data/save_geo.json';
    if (LOAD_FROM_FILE) {
        fs.exists(file, function(exists) {
            if (exists) {
                console.log('loading '+file);
                // catch when file is empty
                try { cache = require(file); }
                catch (e) { console.error(e); }
            }
        });
    }

    function lookup_ptr(ip, callback) {
        if (cache[ip]) {
            // fuck you google
            return cache[ip];
        }
        else {
            if (! requests[ip]) {
                requests[ip] = true;

                var geoval =  geolookup.get(ip);
                DEBUG_GEOIP && console.log('> geo ip',ip,'to',geoval);
                if (geoval && geoval.country) {
                  delete requests[ip];
                  cache[ip] = geoval.country.iso_code;
                  if (typeof callback === 'function') {
                      callback(geoval);
                  }
                }
                else {
                  cache[ip] = '';
                }
            }
            return '';
        }
    }
    function save() {
        var string = JSON.stringify(cache, null, 4);
        if (string.length <= 3) // empty files cause issues on load via require()
            return
        if (!fs.existsSync('./data')){ fs.mkdirSync('./data'); }
        fs.writeFile(file, string, function(err) {
            if (err)
                console.log(file+' '+err);
            else
                console.log('saved '+file);
        });
    }

    return {
        ptr: function (ip, callback) {
          return lookup_ptr(ip, callback);
        },
        save: function () { save(); },
        show: function () { console.log('geo'); console.log(cache) },
        close: function () { geolookup.close(); }
    };
}());
module.exports.geo = geo;

//
var mdns = (function () {
    var cache        = {},
        requests     = {};
    var noserverre   = new RegExp('no servers could be reached');
    var local_domain = '.local';                                   // removed from name. call set_local_domain from parent

    var file = __dirname+'/data/save_mdns.json';
    if (LOAD_FROM_FILE) {
        fs.exists(file, function(exists) {
            if (exists) {
                console.log('loading '+file);
                // catch when file is empty
                try { cache = require(file); }
                catch (e) { console.error(e); }
            }
        });
    }

    function lookup_ptr(ip, callback) {
        if (cache[ip]) {
            return cache[ip];
        }
        else {
            if (! requests[ip]) {
                requests[ip] = true;
                var exec = require('child_process').execFile;
                // I attempted to use multicast-dns lib but there are various errors. so we do this
                var flags = ['+short', '+noadflag', '+nocdflag', '+noedns', '+noall', '+answer', '+time=1', '+tries=1', '-b', '10.13.37.1' ];

    // TRY TO NETCAST 5353 ----------------------------------------------------
    DEBUG_MDNS && console.log('> dig 5353 netcast '+ip);
                exec('dig', flags.concat(['-x', ip, '-p','5353', '@224.0.0.251']), function(err, out, code) {
                    //if (err instanceof Error)
                    //   throw err;
                    // if you want to run this request continuesly uncomment:
                    //delete requests[ip];
                    // if (out == ";; connection timed out; no servers could be reached\n")
                    if (out && !noserverre.test(out) && out.length > 0) {
                        cache[ip] = out.replace("\n", '').replace(/\.$/,'').replace(local_domain, '');
                    }
                    else {
    // TRY TO HOST 5353 -------------------------------------------------------
    DEBUG_MDNS && console.log('>> dig 5353 netcast '+ip);
                        exec('dig',flags.concat(['-x', ip, '-p','5353', '@'+ip]), function(err, out, code) {
                            if (out && !noserverre.test(out) && out.length > 0) {
                                cache[ip] = out.replace("\n", '').replace(/\.$/,'').replace(local_domain, '');
                            }
                            else {
    // TRY TO HOST 53 ---------------------------------------------------------
    DEBUG_MDNS && console.log('>>> dig 53 host '+ip);
                                exec('dig',flags.concat(['-x', ip, '-p','53', '@'+ip]), function(err, out, code) {
                                    if (out && !noserverre.test(out) && out.length > 0) {
                                        cache[ip] = out.replace("\n", '').replace(/\.$/,'').replace(local_domain, '');
                                    }
                                    else {
    // TRY TO NETCAST 53 ------------------------------------------------------
    DEBUG_MDNS && console.log('>>>> dig 53 netcast '+ip);
                                        exec('dig',flags.concat(['-x', ip, '-p','53', '@224.0.0.251']), function(err, out, code) {
                                            if (out && !noserverre.test(out) && out.length > 0) {
                                                cache[ip] = out.replace("\n", '').replace(/\.$/,'').replace(local_domain, '');
                                            }
                                            else {
    DEBUG_MDNS && console.log('>>>> dig 53 netcast: '+ip+" FAIL.\n"+out);
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                    //process.stderr.write(err);
                    //process.exit(code);
            	});
            }
            return null;
        }
    }

    function save() {
        var string = JSON.stringify(cache, null, 4);
        if (string.length <= 3) // empty files cause issues on load via require()
            return
        if (!fs.existsSync('./data')){ fs.mkdirSync('./data'); }
        fs.writeFile(file, string, function(err) {
            if (err)
                console.log(file+' '+err);
            else
                console.log('saved '+file);
        });
    }

    return {
        ptr: function (ip, callback) {
            return lookup_ptr(ip, callback);
        },
        insert: function (ip, name) {
            cache[ip] = name;
        },
        save: function () { save(); },
        show: function () { console.log('mdns'); console.log(cache) },
        set_local_domain: function(domain) { local_domain = domain; }
    };
}());
module.exports.mdns = mdns;


// for the use of exec you may need to ulimit -n 1000 or something
// cache reverse DNS lookups for the life of the program
var dns = (function () {
    var cache          = {},
        requests       = {};
    var retry          = [];
    var RETRY_INTERVAL = 10000;

    const file = __dirname+'/data/save_dns.json';
    if (LOAD_FROM_FILE) {
        fs.exists(file, function(exists) {
            if (exists) {
                console.log('loading '+file);
                // catch when file is empty
                try { cache = require(file); }
                catch (e) { console.error(e); }
            }
        });
    }


    // I SUSPECT that we have issues of a timeout on dns and mdns request. So we
    // build a cache to recheck IP's in the db via a poll

    // function is_ip_old(string) {
    //     return !isNaN(string.split('.').join(''))
    // }
    function retry_add(ip){
        if (retry.indexOf(ip) < 0) // if not in queue already, add
            retry.push(ip);
    }
    function retry_poll() {
        for (var i =0; i<retry.length; i++) {
            //var ip = retry.pop();
            delete cache[retry.pop()];
            //lookip_ptr(ip);
        }
        // setTimeout(retry, RETRY_INTERVAL);
    }
    var timer = setInterval(retry_poll,RETRY_INTERVAL);

    function lookup_ptr(ip, callback) {
        // (skip if broadcast
        if (cache[ip]) { 
            // if cache entry exists, is still ip, is not broadcast, add to retry qeue
            if (!ipjs.is_broadcast(ip) && ipjs.is_ip(cache[ip]))
                retry_add(cache[ip]);
            return cache[ip];
        }
        else {
            if (ipjs.is_broadcast(ip))
                cache[ip] = ip;
            else if (! requests[ip]) {
                requests[ip] = true;
                dnser.reverse(ip, function (err, domains) {
                    if (err) {
                        cache[ip] = ip;
                        // console.log('dns err'+err+' '+ip)
                        // TODO - check for network and broadcast addrs, since we have iface info
                    } else {
                        cache[ip] = domains[0];
                        if (typeof callback === 'function') {
                            callback(domains[0]);
                        }
                    }

                    delete requests[ip];
                });

            }
            return ip;
        }
    }

    function save() {
        var string = JSON.stringify(cache, null, 4);
        if (string.length <= 3) // empty files cause issues on load via require()
            return
        if (!fs.existsSync('./data')){ fs.mkdirSync('./data'); }
        fs.writeFile(file, string, function(err) {
            if (err)
                console.log(file+' '+err);
            else
                console.log('saved '+file);
        });
    }

    return {
        ptr: function (ip, callback) {
            return lookup_ptr(ip, callback);
        },
        insert: function (ip, name) {
            cache[ip] = name;
        },
        save: function () { save(); },
        show: function () { console.log('dns'); console.log(cache);console.log('dns retry'); console.log(retry) }
    };
}());
module.exports.dns = dns;

var save = (function () {
    console.log('save all caches in ./data');
    if (!fs.existsSync('./data')){ fs.mkdirSync('./data'); }
    oui.save();
    geo.save();
    mdns.save();
    dns.save();
});
module.exports.save = save;

// IP STATE CACHE
// quick hack to avoid printing too many packets. We monitor
// the port of the last packet and if the next packet is the same, we ignore
// The differenced between ``_port`` and ``_data`` is that _port
// will be updated whenever the port changes and _data will be updated
// only when that service had its app layer parsed
var new_port = (function () {
    var cache = {};
    function lookup_ptr(ip, port) {
        // console.log(ip, cache[ip]);
        if (cache[ip] && cache[ip] === port) {
            // state has not changed
            return false;
        }
        else {
            // state has changed
            cache[ip] = port;
            return true;
        }
    }
    return {
        ptr: function (ip, port) {
          return lookup_ptr(ip, port);
        }
    };
}());
module.exports.new_port = new_port;

var new_data = (function () {
    var cache = {};
    function lookup_ptr(ip, port) {
        // console.log(ip, cache[ip]);
        if (cache[ip] && cache[ip] === port) {
            // state has not changed
            return false;
        }
        else {
            // state has changed
            cache[ip] = port;
            return true;
        }
    }
    return {
        ptr: function (ip, port) {
          return lookup_ptr(ip, port);
        }
    };
}());
module.exports.new_data = new_data;
