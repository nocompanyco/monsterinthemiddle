// At the moment this is stand alone and connects to the packets server
// for packets. IT could be easily integrated with the server running in the
// same instance.
//

/*
https://developer.chrome.com/devtools/docs/javascript-memory-profiling
http://addyosmani.com/blog/performance-optimisation-with-timeline-profiles/
*/
const fs       = require('fs');
const util     = require('util');
const express  = require('express')
const app      = express();
const server   = require('http').createServer(app);
server.listen(8081);
const io       = require('socket.io').listen(server);
const clientio = require('socket.io-client');
const tld      = require('tldjs');

const VERBOSE_DEBUG = false;

const LOAD_FROM_FILE = true;
const PROCESS_EXIT_WAIT = 1500; // need to wait on exit so file saves complete
const PACKET_SERVER = 'http://localhost:8080'; // where we get packets from
const PUSH_INTERVAL = 6000; // how often do we check for and send new data
const PUSH_N_TARGETS = 3; // how many targets will we send each Interval (the N latest)
const NETGRAPH_BLOCK_SIZE = 15; // this many GRAPH entries (minutes)
const NETGRAPH_INTERVAL_DIV = 100000; // divides ms Date() time down to minutes
                                    // set to 10000,00 for 10 minute blocks.
                                    //        10000,0 for 1 minute blocks
                                    // SADLY you have to add the 0 back to keep it as epoch time
const ICON_DIR = __dirname + '/ui/icons'; // site icons. device icons manually in client html

const IMAGES_PER_TARGET = 20;
const PUSH_NET_GRAPH = false; // if set, we push updates. otherwise expect client to pull only
const FILTER_DATA_TYPES = false; // if false all ports and data types logged. snifferjs could apply seperately

if (process.argv[2] == '--help') {
    console.error("\nExample use: ");
    console.error('  sudo node devices.js [<capture_server:port>]"');
    console.error('  default seerver:port http://localhost:8080');
    process.exit(1);
}


const START_PACKET_TIME = new Date(Date.parse("2014-01-01T09:30:00"));
console.log('Will only consider packet log files after this date')
console.log(START_PACKET_TIME);

const DEVICE_ICONS = {
    apple: 'apple.png',
    windows: 'windows.png',
    nokia: 'windows.png',
    andriod: 'andriod.png',
    htc: 'andriod.png',
    samsung: 'samsung.png',
    other: 'phone.png'
};
const INGORE_TARGETS = [
    // '192.168.1.108' //martin
    '192.168.20.1', //sniffer host zero.knowledge
]
const IGNORE_LIST = [
    'images-amazon.com',
    'akamai.net',
    'gstatic.com',
    'sstatic.net',
    'cloudflare.net',
    'gravatar.com',
    'edgecastcdn.net',
    'digicert.com',
    'akadns.net',
    'netdna-cdn.com',
    'cloudfront.net',
    'akamaiedge.net',
    'cloudapp.net',
    'mozaws.net'
];
// var BLOCK_TARGETS_MEDIA = [ // you can use name or  IP
//     '',
// ];
// Index is the DATE+TIME without seconds. So elements are per minute.
// We will broadcast the last 10 or 20 minutes.
function _nowkey() {
    //return new Date().toISOString().slice(0,-8);
    //'2014-10-08T14:01:36.222Z' into '2014-10-08T14:01'
    return Math.floor(new Date() / NETGRAPH_INTERVAL_DIV)*100;
}
var nowkey = _nowkey();
// to avoid calling and setting this with every packet we set it every 100ms;
setInterval(function(){ nowkey = _nowkey()}, 100);
var netgraph = new (function (){
    var cache = {};
    var key_list = []; // performative to just track a list of keys
    var file = './data/save_devices_netgraph.json';
    function load() {
        fs.exists(file, function(exists) {
            if (exists) {
                console.log('loaded '+file);
                // queue = require(file);
                fs.readFile(file, function (err, data) {
                    try {
                        var d = JSON.parse(data);
                        cache = d.cache;
                        key_list = d.key_list;
                    }catch(e){console.error(e)}
                });
            }
        });
    }
    if (LOAD_FROM_FILE)
        load();

    function _new(key, count) {

        console.log('new time key '+key+' '+cache[key-1]);
        cache[key] = count;
        // key block updated
        if (key_list.length >= NETGRAPH_BLOCK_SIZE)
           key_list.shift();
        key_list.push(key);

    }
    function tick() {
        var key = nowkey;
        if (!cache[key])
            _new(key, 1);
        else
            cache[key] += 1;
    }
    function get_current() {
        var key = nowkey;
        if (!cache[key]) {
            _new(key, 0);
        }
        return [{date: key, value: cache[key]}];
    }
    function get_block() {
        var block = [];
        // we reverse the order through this operation
        for (var i=0; i<key_list.length; i++) {
            block.push( {date: key_list[i], value: cache[key_list[i]]} );

        }
        return block;
    }
    function get_all() {
        var sorted_list = [];
        for (var key in cache)
            sorted_list.push({date: key, value: cache[key]});
        sorted_list.sort(function(a,b) {return parseFloat(a.date) - parseFloat(b.date)});
        return sorted_list;//[{date:100, value:'a'},{date:300, value:'b'},{date:104, value:'c'}]
    }
    function save() {
        var string = JSON.stringify({cache:cache, key_list: key_list}, null, 4);
        if (string.length <= 3) // empty files cause issues on load via require()
            return
        if (!fs.existsSync('./data')){ fs.mkdirSync('./data'); }
        fs.writeFile(file, string, function(err) {
            if (err) console.log(file+' '+err);
            else     console.log('saved '+file);
        });
    }
    return {
        tick:  function()    { tick(); },
        get_current: function() { return get_current() },
        get_block: function() { return get_block() },
        get_all: function()  { return get_all() }, //slice is performative way to copy array
        save: function()    { save() },
        load: function()    { load() },
        show: function()    {
            console.log('netgraph');
            console.log(cache);
            console.log(key_list);
            }
    }
});


// queue holds a FIFO buffer for the next target to be shown
var queue = new (function (){
    var queue = [];
    var file = './data/save_devices_queue.json';
    function load() {
        fs.exists(file, function(exists) {
            if (exists) {
                console.log('loaded '+file);
                // queue = require(file);
                fs.readFile(file, function (err, data) {
                    try {
                        queue = JSON.parse(data);
                    }catch(e){console.error(e)}
                });

            }
        });
    }
    if (LOAD_FROM_FILE)
        load();

    function pop() {
        if (queue.length <= 0)
            return false;
        return queue.pop();
    }
    function push(key) {
        // if value is already in the queue (perhaps in a lower pos) remove
        queue = queue.filter(function(v) { return v != key });
        queue.push(key);
    }
    function save() {
        var string = JSON.stringify(queue, null, 4);
        if (string.length <= 3) // empty files cause issues on load via require()
            return
        if (!fs.existsSync('./data')){ fs.mkdirSync('./data'); }
        fs.writeFile(file, string, function(err) {
            if (err) console.log(file+' '+err);
            else     console.log('saved '+file);
        });
    }
    return {
        pop:  function()    { return pop() },
        push: function(key) { push(key) },
        get_all: function()  { return queue.slice(0) }, //slice is performative way to copy array
        save: function()    { save() },
        load: function()    { load() },
        show: function()    { console.log('queue'); console.log(queue) }
    }
});

// resolve hosts to icons
// normally via favicon but potentially modified manually
var icons = new (function () {
    var cache = {}
    var file = './data/save_devices_icons.json';
    // predefined icons
    var site_icons = fs.readdirSync(ICON_DIR).filter(function(v){ return v[0] != '.' });

    function load() {
        fs.exists(file, function(exists) {
            if (exists) {
                console.log('loaded '+file);
                // cache = require(file);
                fs.readFile(file, function (err, data) {
                    try {
                    cache = JSON.parse(data);
                    }catch(e){console.error(e)}

                });

            }
        });
    }
    if (LOAD_FROM_FILE)
        load();

    function save() {
        var string = JSON.stringify(cache, null, 4);
        if (string.length <= 3) // empty files cause issues on load via require()
            return
        if (!fs.existsSync('./data')){ fs.mkdirSync('./data'); }
        fs.writeFile(file, string, function(err) {
            if (err) console.log(file+' '+err);
            else     console.log('saved '+file);
        });
    }
    // fav icons should not force. fuzzy icons should force
    function find_local_icon(string, cb) {
        if (string) {
            string = string.split('.')[0]; // should work because tldjs removes subdomains
            console.log('icon find: '+string);
            for (var i = 0; i < site_icons.length; i++) {
                var name = site_icons[i].split('.')[0];
                var re = new RegExp(name, 'i');
                // console.log('test: string '+string+'  in name '+name); console.log(re.test(string));
                if (re.test(string)) {
                    // console.log(site_icons[i]);
                    cb('/icons/'+site_icons[i]);
                }
            }
        }
        cb(false);
    }
    // function set(host, uri) {
    //     if(!cache[host]) {
    //         find_local_icon(host, function(icon) {
    //             if (icon) {
    //                 cache[host] = icon;
    //                 return icon
    //             }
    //             else if (uri) {
    //                 cache[host] = uri;
    //                 return uri
    //             }
    //         });
    //     }
    //         if (local_icon)
    //             cache[host] = local_icon;
    //         else if (uri) // optionally can set icon without uri so check
    //             cache[host] = uri;
    //     }
    //     return cache[host];
    // }
    function set(host, uri, cb) { // set uri null optionally
        if(!cache[host]) {
            find_local_icon(host, function(icon) {
                if (icon) {
                    cache[host] = icon;
                    cb(icon);
                }
                else if (uri) {
                    cache[host] = uri;
                    cb(uri);
                }
                cb();
            });
        }
        else{
            cb(cache[host]);
        }
    }

    return {
        get:  function(host)      { return cache[host] },
        //set:  function(host, uri) { return set(host, uri, force) },
        set:  function(host, uri, cb) { set(host, uri, cb) }, // using this for lookup only
        save: function()          { save() },
        load: function()          { load() },
        show: function()          { console.log('icons'); console.log(cache) }
    }
});
function find_device_icon(string) {
    var names = Object.keys(DEVICE_ICONS);
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var re = new RegExp(name, 'i');
        if (re.test(string)) {
            return '/icons/'+DEVICE_ICONS[name];
            break;
        }
    }
    return '/icons/'+DEVICE_ICONS['other'];
}


var images = new (function () {
    var cache = {}
    var file = './data/save_devices_images.json';
    function load() {
        fs.exists(file, function(exists) {
            if (exists) {
                console.log('loaded '+file);
                // cache = require(file);
                fs.readFile(file, function (err, data) {
                    try {
                    cache = JSON.parse(data);
                    }catch(e){console.error(e)}

                });
            }
        });
    }
    if (LOAD_FROM_FILE)
        load();

    function save() {
        var string = JSON.stringify(cache, null, 4);
        if (string.length <= 3) // empty files cause issues on load via require()
            return
        if (!fs.existsSync('./data')){ fs.mkdirSync('./data'); }
        fs.writeFile(file, string, function(err) {
            if (err) console.log(file+' '+err);
            else     console.log('saved '+file);
        });
    }

    function push(target, url) {
        if (!cache[target])
            cache[target] = [];
        if (cache[target].indexOf(url) < 0)
            cache[target].push(url);
        if (cache[target].length > IMAGES_PER_TARGET)
                cache[target].shift();
    }
    function get(target, cb) {
        cb(cache[target]);
    }

    return {
        push: function (target, url) { push(target, 'http://'+url) },
        get:  function (target, cb) { get(target, cb) },
        load: function()          { load() },
        save: function()          { save() },
        show: function()          { console.log('images'); console.log(cache) }
    }
});


//
// TODO Add throttling for targets that are overly active.
// this can be by hand:
//    add a 5 minute delay at first
//    then a permanate only once every 5 minutes
//
var initial_time = new Date();
var targets = new (function () {
    var cache = {};
    var target_list = [];

    var MAX_SERVICES = 15;
    var THROTTLE_TIME = 3; // minutes

    var file = './data/save_devices_targets.json';
    function load() {
        fs.exists(file, function(exists) {
            if (exists) {
                console.log('loaded '+file);
                // cache = require(file);
                fs.readFile(file, function (err, data) {
                    try {
                    d = JSON.parse(data);
                    cache = d.cache;
                    target_list = d.target_list;
                    }catch(e){console.error(e)}
                });
            }
        });
    }
    if (LOAD_FROM_FILE)
        try {
        load();}catch(e){console.log('err')}

    function save() {
        var string = JSON.stringify({target_list: target_list, cache: cache}, null, 4);
        if (string.length <= 3) // empty files cause issues on load via require()
            return
        if (!fs.existsSync('./data')){ fs.mkdirSync('./data'); }
        fs.writeFile(file, string, function(err) {
            if (err) console.log(file+' '+err);
            else     console.log('saved '+file);
        });
    }

    function _new_target(target) {
        if (INGORE_TARGETS.indexOf(target.ip) >= 0) {
            console.log ('ignore target '+target.ip);
            return;
        }

        console.log('new target     '+target.ip+' '+target.name);
        target_list.push(target.ip);
        cache[target.ip] = {
            ip: target.ip,
            name: target.name,
            device: target.device,
            device_icon: find_device_icon(target.device),
            //last_shown: null, // needed?
            // for now we just always send data and dont check this:
            //last_update: new Date().getTime(), // used for PUSH poll so that only new data is sent
            throttle_permanent: false,
            throttle_now: false, // false or time until valid
            leaks: target.leaks,
            hasimages: target.hasimages,
            services: [],
        }
    }

    /* Format:
    '192.168.4.44': {
        last_shown: <time> is the last time we showed it as primary, for throttling
        throttle_permanent: boolean,
        throttle_now: boolean, // one time ban
        // these flags reflect the services but since the services queue gets flushed
        // this is a permanent record of important details
        flags: {encrypted_mail}
        // 12 last services with last being latest
        services: [
            'asdads.facebook.com': {
                // type and icon based on host key
                encrypted: boolean,
                media: [URLS of images and whatnot]
            },
            'mail.cypherpoet.com': {
                encrypted: boolean,
                media: [URLS of images and whatnot]
            },
        ]
    }
    */
    function add_service(target, domain, service) {
        if (INGORE_TARGETS.indexOf(target.ip) >= 0) {
            console.log ('ignore target '+target.ip);
            return;
        }
        var ip = target.ip;
        // 3 parts: Totally new target, Totally new domain/service, Not new just update
        if (!cache[ip]) {
            _new_target(target);
        }
        else {
            set_name(ip, target.name);
            if (target.leaks)
                set_leaks(ip);
        }

        var old_service = cache[ip].services.filter(function(v){ return v.name == domain })
        if (old_service.length == 0) {
            console.log('new service    '+ip+' '+domain);
            while (cache[ip].services.length >= MAX_SERVICES)
                cache[ip].services.shift();

            icons.set(domain, null, function(icon) {
                service.icon = icon;
                cache[ip].services.push(service);
            });
        }
        else if (old_service.length >= 1) {
            console.log('update service '+ip+' '+domain);
            cache[ip].services = cache[ip].services.filter(function(v){ return v.name !== domain });
            cache[ip].services.push(service);
        }
        else { console.error('error '+ip+' '+domain) }

        // NOW we need to update the queue
        // Check for throttling
        var now = new Date().getTime();
        if (cache[ip].throttle_now) {
            if(cache[ip].throttle_now <= now) {
                queue.push(ip);
                if (cache[ip].throttle_permanent)
                    cache[ip].throttle_now = now+(THROTTLE_TIME*60*1000);
            }
        }
        else {
            queue.push(ip);
        }
    }

    function set_name(ip, target_name) {
        cache[ip].name = target_name;
    }
    function set_device(ip, device) {
        cache[ip].device = device;
        cache[ip].device_icon = find_device_icon(device);
    }

    function set_leaks(ip) {
        cache[ip].leaks = true;
    }

    function throttle(ip, permanent) {
        cache[ip].throttle_now = new Date().getTime();
        if (permanent)
            cache[ip].throttle_permanent = true;
        else
            cache[ip].throttle_permanent = false;
    }
    // if permanent == null then just set the throttle_now flag
    // bassically you still add the service details but just avoid updating the queue until
    // the timeout has passed OR just move the possition to the end of the queue

    return {
        add_service: function(target, domain, service) {
            add_service(target, domain, service)
        },
        set_name: function(ip, target_name) { set_name(ip, target_name) },
        set_device: function(ip, device) { set_device(ip, device) },
        set_leaks: function(ip) { set_leaks(ip) },
        get_target: function(ip) { return cache[ip] },
        get_target_list: function() { return  target_list },
        throttle: function(ip, permanent) { throttle(ip, permanent) },
        save: function() { save() },
        load: function() { load() },
        show: function() {
            console.log('targets');
            console.log(util.inspect(cache, {depth:null}));
            console.log(target_list);
        }
    }
});



/*
{ data:
   { sdevice: 'Apple',
     ddevice: 'Arcadyan',
     sip: '192.168.44.100',
     siplocal: true,
     dip: '54.230.44.202',
     diplocal: false,
     gatewayip: '192.168.44.1',
     sname: 'thais',
     dname: 'd2vgu95hoyrpkh.cloudfront.net',
     smdnsname: 'thais',
     sgeo: null,
     dgeo: { code: 'US', name: 'United States' },
     app: { type: 'http url', url: 'cdn.socket.io/website/imgs/a8c.png' },
     count: 39 } }
into
    services: [
        'asdads.facebook.com': {
            // type and icon based on host key
            timestamp: <time_stamp>,
            encrypted: boolean,
            media: [URLS of images and whatnot]
        },
*/
function is_ip(string) {
    return !isNaN(string.split('.').join(''))
}

function ignore (domain) {
    var ignore = false;
    if (is_ip(domain))
        ignore = true;
    if (IGNORE_LIST.indexOf(domain) >= 0)
        ignore =  true;
    if (ignore)
        console.log('ignore '+domain);
    return ignore;
}

function detect_img(content) {
    return content.match(/\.(jpg|jpeg|png|gif|svg)\s*$/i) ? true : false;
}
function parse_data(data) {
    // console.log(data.data)
    if (!data.siplocal)
        return; // for now only deal with requests

    if (FILTER_DATA_TYPES && data.app.type !== 'http url' && data.app.type !== 'http' && data.app.type !== 'https' && data.app.type !== 'mail' && data.app.type != 'mails')
        return;

    var ip = data.sip;

    // get proper domain
    var domain;
    if (data.app.type == 'http url')
        domain = tld.getDomain(data.app.url);
    else if (data.dname)
        domain = tld.getDomain(data.dname); 
        // can result in null when dname is device. this happens if logging all data
    else
        domain = data.dip;
    // deal with domain == null instance, then check if should ignore domain
    if (domain && ignore(domain))
        return;


    // note if encrypted
    var encrypted = false;
    if (data.app.type == 'https' || data.app.type == 'mails')
        encrypted = true

    var leaks = false;
    if (data.app.type == 'mail') {
        leaks = true;
        console.log('leaks '+ip);
    }

    // set media
    var hasimages = false;
    if (data.app.type == 'http url') {
        if (detect_img(data.app.url)) {
            images.push(ip, data.app.url);
            hasimages = true;
        }
    }

    // setup service
    service = {
        name: domain,
        encrypted: encrypted,
        icon: icons.get(domain)
    };

    target = {
        ip: ip,
        name: null,
        device: null,
        leaks: leaks,
        hasimages: hasimages
    }


    // add name
    // prefer mdns name
    if (data.smdnsname) target.name = data.smdnsname;
    else if(data.sname) target.name = data.sname;
    else                target.name = ip;
    target.name = target.name.replace(/-/g,' ');
    // add device
    VERBOSE_DEBUG && console.log('target', target)
    VERBOSE_DEBUG && console.log('data', data)
    if (data.sdevice) target.device = data.sdevice;
    else              target.device = '';
    // else if (target.name.substr(0,7).toLowerCase()==='android')
    //                   target.device = 'android';

    targets.add_service(target, domain, service);

}

var style = {
    maxwidth: 650,
    maxheight: 140,
    iconsize: 80,
    namesize: 60
}
function change_style(bigger) {
    if (bigger) {
        style.maxwidth = style.maxwidth*1.1;
        style.maxheight = style.maxheight*1.1;
        style.iconsize = style.iconsize*1.1;
        style.namesize = style.namesize*1.1;
        var newstyle = {
            maxwidth: Math.floor(style.maxwidth)+'px',
            maxheight: Math.floor(style.maxheight)+'px',
            iconsize: Math.floor(style.iconsize)+'px',
            namesize: Math.floor(style.namesize)+'px'
        }
    }
    else {
        style.maxwidth = style.maxwidth*0.9;
        style.maxheight = style.maxheight*0.9;
        style.iconsize = style.iconsize*0.9;
        style.namesize = style.namesize*0.9;
        var newstyle = {
            maxwidth: Math.floor(style.maxwidth)+'px',
            maxheight: Math.floor(style.maxheight)+'px',
            iconsize: Math.floor(style.iconsize)+'px',
            namesize: Math.floor(style.namesize)+'px'
        }
    }
    io.to('devices').emit('change_style', style);
}
var style_file = './data/save_devices_style.json';
function load_style() {
    fs.exists(style_file, function(exists) {
        if (exists) {
            console.log('loaded '+style_file);
            // queue = require(file);
            fs.readFile(style_file, function (err, data) {
                try {
                    style = JSON.parse(data);
                }catch(e){console.error(e)}
            });

        }
    });
    io.to('devices').emit('change_style', style);
}
function save_style() {
    var string = JSON.stringify(style, null, 4);
    if (string.length <= 3) // empty files cause issues on load via require()
        return
    if (!fs.existsSync('./data')){ fs.mkdirSync('./data'); }
    fs.writeFile(style_file, string, function(err) {
        if (err) console.log(style_file+' '+err);
        else     console.log('saved '+style_file);
    });
}
if (LOAD_FROM_FILE)
    load_style();




function save_state() {
    queue.save();
    icons.save();
    targets.save();
    images.save();
    netgraph.save();
    save_style();
}
function show_state() {
    icons.show();
    images.show();
    queue.show();
    targets.show();
    netgraph.show();
    uiqueue.show();
}
function load_state() {
    icons.load();
    images.load();
    queue.load();
    targets.load();
    netgraph.load();
    load_style();
}

var stdin = process.openStdin();
stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding('utf8');
stdin.on( 'data', function( key ){
  if ( key === '\u0003' ) { // ctrl+c
    save_state();
    setTimeout(function(){process.exit()}, PROCESS_EXIT_WAIT);
  }
  else if ( key === 'l' ) {//'\u000C') { // ctrl+l
    load_state();
  }
  else if ( key === 's') {//'\u0013') { // ctrl+s
    save_state();
  }
  else if ( key === 't') {//''\u0014') { // ctrl+t aka test
    show_state();
  }
  else if ( key === 'r' ) {//'\u000C') { // ctrl+l
    console.log('reload client');
    io.to('devices').emit('reload');
    io.to('devices').emit('change_style', style);
  }
  else if ( key === '+' || key === '=') {//'\u000C') { // ctrl+l
    change_style(true/*bigger*/);
  }
  else if ( key === '-' ) {//'\u000C') { // ctrl+l
    change_style(false/*bigger*/);
  }
  else {
    console.log("unknown key: ");
    console.log(util.inspect(key,{depth: null})); // use to see key
  }





  //console.log(util.inspect(key,{depth: null})); // use to see key
  // write the key to stdout all normal like
  process.stdout.write( key );
});






/**

 SERVER

 On initial connect from client emit events for each target

 Send updates as needbe

 Send focus requests as need be

 Send commands to force refresh

 Send routinely full packet information for graph
 **/

app.get('/', function (req, res) {
    res.sendfile(__dirname + '/ui/devices.html');
});
console.log('serving '+__dirname + '/ui/devices.html');
app.use('/ui', express.static(__dirname + '/ui'));
// icon content
app.use('/icons', express.static(ICON_DIR));
// app.get('/icons_list', function(req,res) {
//     var site_icons = fs.readdirSync(ICON_DIR);
//     res.send(JSON.stringify(site_icons, null, 4));
// });

// fuzzy icon matcher
// read icons <name>.png and use *name* from host
// this gets served as some json and we do fuzzy matching on the client


io.sockets.on('connect', function (socket) {
    console.log('client connected');

    // this channel is whence server/admin sends commands to client (avoiding interacting with UI)
    socket.join('devices');

    // give client all information
    socket.on('init', function() {
        console.log('client init');

        // we send the full target list as the queue on initi so that the client
        // updates or creates all tiles
        var target_list = targets.get_target_list();

        //var q = queue.get_all();
        socket.emit('queue', target_list);

        // send all target details
        for (var i=0; i < target_list.length; i++) {
            var ip = target_list[i];
            if (INGORE_TARGETS.indexOf(ip) >= 0) {
                console.log ('ignore target '+ip);
                continue;
            }

            var target = targets.get_target(ip);
            if (target) {
                console.log('sending target '+ip);
                images.get(ip, function (media) {
                    socket.emit('new_target', {target: target, media: media ? media : []} );
                });
            }
        }

        // send style
        io.to('devices').emit('change_style', style);

        // send full netgrap
        console.log('full graph');
        if (PUSH_NET_GRAPH) {
            fullgraph = netgraph.get_all();
            socket.emit('net_graph', fullgraph);
        }
    });
    socket.on('get_net_graph', function(){
        console.log('full graph');
        socket.emit('net_graph', netgraph.get_all())
    })
});
//socket.on('update_icons', function(){});



var uiqueue = new (function (){
    var d = [];
    function pop() {
        if (d.length <= 0)
            return false;
        return d.pop();
    }
    function push(key) {
        // if value is already in the queue (perhaps in a lower pos) remove
        d = d.filter(function(v) { return v != key });
        // now it is the latest
        d.push(key);
    }
    function getlast() {
        if (d.length <= 0)
            return false;
        // shift it to the front then
        var last = d.pop();
        d.unshift(last);
        return last;
    }
    return {
        pop:  function()    { return pop() },
        push: function(key) { push(key) },
        last: function() { return getlast() },
        length: function() { return d.length },
        show: function() { console.log('uiqueue'); console.log(util.inspect(d, {depth:null}))}
    }
});


// function send_target()
// NOTE: CLIENT UI will likely refresh content. To avoid sending requests for media
// again make certain client handles media specially.

function pushpoll() {
    // find latest updates, check that they are actually new to CLIENT UI and send
    // using get_all() avoids modifying the central queue. use pop to modify
    var q = queue.get_all();
    var qlen = q.length;
    for (var i = 0; i < PUSH_N_TARGETS && i < qlen; i++) {
        // lazy way to go from the last element without having to pop (which appears to mess up central cache)
        // here we pop from central so that we only update client on updates
        //var key = q.pop();
        var key = queue.pop();
        uiqueue.push(key);
        var target = targets.get_target(key);
        if (target) {

            images.get(key, function (media) {
                io.to('devices').emit('update', {
                                                  target: target,
                                                  media: media ? media : []
                                                 }
                );
            });
        }

    }

    // Handle bandwidth graph
    // sends block of minutes. could change this to one, but i guess it is okay
    if (PUSH_NET_GRAPH)
        io.to('devices').emit('net_graph', netgraph.get_block());

}
setInterval(pushpoll, PUSH_INTERVAL);

// TODO: remove sending queue to client?
// for now ignor throttling and just assume the queue
// TIMES IN SECONDS
var MAX_SHOW_BEFORE_BLOCK_PAUSE = 4; // show 4 and then break
var BLOCK_PAUSE = 60*2;
var SHOW_TARGET = 20;//20;
var BETWEEN_TARGET = SHOW_TARGET+80; // how long to wait until sending next, should be more than SHOW target
var BLOCK_PAUSE = 60;
// var SHOW_TARGET = 15;//20;
// var BETWEEN_TARGET = SHOW_TARGET+15; // how long to wait until sending next, should be more than SHOW target
var NORMAL_PAUSE = 10; // this can happen when there isnt enough avitivity of a block. effects poll time
var shown_in_a_row_count = 0;
function uipoll() {
    // var key = uiqueue.pop();
    var key = uiqueue.last();
    var len = uiqueue.length();

    console.log('key:'+key+' count:'+shown_in_a_row_count);
    if (key && shown_in_a_row_count < MAX_SHOW_BEFORE_BLOCK_PAUSE && shown_in_a_row_count < len ) {
        io.to('devices').emit('show_target', {key:key, time:SHOW_TARGET*1000});
        shown_in_a_row_count += 1;
        setTimeout(uipoll, BETWEEN_TARGET*1000);
        console.log('ui:'+key+' count='+shown_in_a_row_count+'  wait:'+BETWEEN_TARGET);
    }
    else if (shown_in_a_row_count >= MAX_SHOW_BEFORE_BLOCK_PAUSE) {
        shown_in_a_row_count = 0;
        setTimeout(uipoll, BLOCK_PAUSE*1000);
        console.log('ui: over count  show:'+SHOW_TARGET+' wait:'+BLOCK_PAUSE);
    }
    else {
        shown_in_a_row_count = 0;
        // here we pause
        setTimeout(uipoll, NORMAL_PAUSE*1000);
        console.log('ui: pause  wait:'+NORMAL_PAUSE);
    }
}
uipoll();



/**

 CLIENT TO PACKET FAUCET

 **/

client = clientio.connect(PACKET_SERVER);
client.on('connect', function() {
    console.log('connected to packet server '+PACKET_SERVER);

});
client.on('packet', function(data) {
    // console.log(util.inspect(data,{depth: null})); // use to see key
    try {
        netgraph.tick();
        parse_data(data.data);
        //io.to('devices').emit('net_graph', netgraph.get_block());
    } catch (e) {
        console.error(e);
    }
});



//
// HERE CHECK TARGET STATE
// every 5 or 10 seconds
// emit to UI when needbe


// a = queue();
// a.push(1);
// a.push(2);
// a.show();
// queue.push(1);
// queue.push(2);
// queue.show();
