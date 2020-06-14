'use strict';

/*

Where we are trying to get to:

- capture.js: 
   executed if gui calls for live capturing
   if windows load cap and parse with pcap
   if osx/lnx load pcap and parse with pcap
   (why not just use cap? because it cannot replay pcap)
- replay.js
   load pcap file into pcap lib
- scan.js
   find_hosts() ping network
   get_names(hosts) query for smb mdns
- arpspoof.js
   force network hosts to route here
^^ these items can run without gui but be queried for status from gui

- index.js 
   run server and elements from cmdline without electron
- electron.js 
   run gui which user can use to execute other


*/


/* 
 *
 * SETTINGS
 * 
 */
const VERBOSE_DEBUG        = false; // show tuns of shit
const HTTP_LENGTH_MAX      = 128;    // how many chars of HTTP requests to show
// THROTTLING
// enable some trottling if pcap drops too many packets for your taste
const HTTP_ONLY_FIRST      = false; // set false for smaller networks
const BROADCAST_ONLY_FIRST = true;
const DNS_ONLY_FIRST       = true;
const MAIL_ONLY_LOGIN      = false; //false to show all unencrypted mail packets
const MAIL_TLS_AS_MAILS    = true; // count plain mail with starttls count as encrypted
const MAIL_CONVERT_BASE64  = true; // check logins with base64 user/pass
const PROCESS_EXIT_WAIT    = 1500; // need to wait on exit so file saves complete
const PACKETS_CACHE        = true; // if true, parsed packets saved. useful for client reload 
const PACKETS_CACHE_SAVE   = false; // Save packets_cache on close
const PACKETS_CACHE_LOAD   = false; // Load packets_cache from file on start
const MAKE_STATE_CHANGE_ON_HIDDEN_OTHER = false; // set to true to cause any hidden packet to reset new data counters
const SHOW_ANY_TCP_UDP = false; // show OTHER category
/*  END  */




/*
 * 
 * GLOBAL VARIABLES
 * 
 */
const isWin   = (process.platform === 'win32')
const isLinux = (process.platform === 'linux')
const isOSX   = (process.platform === 'darwin')

/*  END  */




/*
 * 
 * COMMAND LINE PARAMETERS
 * 
 */
// if (process.getuid() != 0) {
//     console.error('PCAP probably needs root');
//     console.error('Will setuid/gid to owner of .js after pcap session initialized.');
// }
//console.log('clear your DNS cache after start. sudo killall -HUP mDNSResponder');
if (process.argv.length < 3) {
    console.error('  sudo node index.js <device> <filter> <gatewayip>');
    console.error('\nExample use: ');
    console.error('  sudo node index.js "" "tcp port 80" 192.168.1.1');
    console.error('  sudo node index.js eth1 "" 192.168.1.1');
    console.error('  sudo node index.js lo0 "ip proto \\tcp and tcp port 80" 192.168.1.1');
    console.error('  sudo node index.js en0 "not net 192.168.1.0/27 and not host 192.168.1.32" 192.168.1.1');
    process.exit(1);
}
const netinterface = process.argv[2]
const filter       = process.argv[3];
const gatewayip    = process.argv[4];
// debug:
// const netinterface = "eth0";
// const netinterface = "wlan0";
// const filter = "ip";
// const gatewayip = "192.168.44.1"

/*  END  */


/*
 * List network interfaces
 * useful here so user can figure out their interface
 */

console.log('\nNetwork interfaces:');
let cap;
let windows_devicename, windows_netinterface;
if (isWin) {
    cap = require('cap');
}
// os.networkInterfaces()
// linux:   {'wlan0': [{address:...},{}], {'eth0'...}}
// osx:     {'en1':   [{address:...},{}], {'en0'...}}
// windows: {'WLAN':  [{address:...},{}], {'Ethernet Interface 1'...}}
// NOTE: on windows cap is used and it requires different names
// get that name using an address from found interface
Object.entries(require('os').networkInterfaces()).forEach(entry => {
    let devicename = entry[0]
    if (isWin && entry[1].length > 0)
        windows_devicename = cap.findDevice(entry[1][0].address)

    if (netinterface === devicename) {
        console.log(`${devicename} <--- chosen`);
        if (isWin)
            windows_netinterface = windows_devicename
    }
    else {
        console.log(`${devicename}`);
    }
    if (isWin)
        console.log(`${windows_devicename} (windows name)`)

    if (entry[1].length > 0) {
        entry[1].forEach(address => console.log(` ${address.address} / ${address.netmask}`) );
    }
    else {
        console.log(' no address\n');
    }
});
console.log("");


/*
 * 
 * LOAD PCAP - DROP PERMISSIONS
 * 
 * we do this early so we can drop privileges before running any external library code
 * 
 */
// Try to open, if no perms ask user to change permissions
//              if root, claim interface and then downgrade (to uid)
let pcap, pcap_session, cap_session, cap_linktype;
try {
    // on windows use cap to get packet (still decoded by pcap)
    if (isWin) {
        cap_session = new cap.Cap();
        var buffer = Buffer.alloc(65535);
        cap_linktype = cap_session.open(windows_netinterface, filter, 10 * 1024 * 1024, buffer);
        console.log('linkType',cap_linktype)
    }
    else {
        const pcap = require("pcap");
        pcap_session = pcap.createSession(netinterface, filter);
    }
} catch (e) {
    console.error(e);
    console.log("\nConsider running as root or give yourself permission to monitor network interface:");
    if (isLinux) {
        console.log(`\nsudo setcap cap_net_raw,cap_net_admin=eip ${process.argv[0]}`);
        console.log(`echo '${__dirname}/node_modules/electron/dist' | sudo tee  /etc/ld.so.conf.d/monsterinthemiddle.conf`);
        console.log(`sudo ldconfig\n`);
    }
    if (isOSX)   
        console.log(`\nuse ChmodBPF to give permissions to ${process.argv[0]}\n`);
    console.log('process.argv:',process.argv)
    setTimeout(function(){process.exit()}, PROCESS_EXIT_WAIT);
}
// dowgrade permissions:
if (!isWin && process.getuid() == 0) {
    require('fs').stat(__filename, function(err,s) {
        console.log(`change process uid/gid to \"${__filename}\" owner/group: ${s.uid}/${s.gid}`);
        process.setgid(s.gid);
        process.setuid(s.uid);
    });
}
const pcap_decode = require('pcap/decode').decode

/*  END  */




/*
 * 
 * LIBRARY DEPENDENCIES
 * 
 * loaded now rather than earlier to prevent unescisary execution of lib code as root
 * 
 */
// Standard libs:
const util     = require('util');
// Our own libs:
const cache    = require('./cache.js'); // oui,geo,dns,etc caches
const nettools = require('./nettools.js')
// 3rd party
const DNS      = require("pcap/decode/dns"); // pcap@2.0.1 dns decoding requires
const express  = require('express');
const app      = express();
const server   = require('http').createServer(app);
const io       = require('socket.io').listen(server);

/*  END  */








/*
 * 
 * PROCESS CONTROL (stop, stdin control)
 * 
 */
function save_state() {
    console.log('saving state');
    cache.save();
    packets_cache_save();
}
process.on( 'SIGINT', function() {
    console.log( "\nGracefully shutting down from SIGINT (Ctrl-C)" );
    save_state();
    setTimeout(function(){process.exit()}, PROCESS_EXIT_WAIT);
})
// handle stdin, only process 1 char commands
const stdin = process.openStdin();
stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding('utf8');
stdin.on( 'data', function( key ){
  if ( key === '\u0003' ) { // ctrl+c aka quit
    save_state();
    cache.geo.close();
    setTimeout(function(){process.exit()}, PROCESS_EXIT_WAIT);
  }
  else if ( key === '\u0013' || key === '\u001bs' ) { // ctrl+s or alt+s aka save
    save_state();
  }
  else if ( key === '\u0014' || key === '\u001bt' ) { // ctrl+t or alt+t aka test
    cache.oui.show();
    cache.geo.show();
    cache.mdns.show();
    cache.dns.show();
    console.log("packets:"+packet_count);
  }
  else {
    console.log("unknown key: ");
    console.log(util.inspect(key,{depth: null})); // use to see key
  }
});

/*  END  */











/*
 *
 * UI :8080
 * 
 */
server.listen(8080);
console.log("index.js client listening on http 8080");

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/ui/packets.html');
});
app.use('/ui', express.static(__dirname + '/ui'));

/*  END  */




/*
 * 
 * PARSE METHODS : app layer detect
 * 
 */
const detect_http_request = function (buf) {
    // from pcap.js TCP_tracker.prototype.detect_http_request
    var str = buf.toString('utf8', 0, buf.length);
    return (/^(OPTIONS|GET|HEAD|POST|PUT|DELETE|TRACE|CONNECT|COPY|LOCK|MKCOL|MOVE|PROPFIND|PROPPATCH|UNLOCK) [^\s\r\n]+ HTTP\/\d\.\d\r\n/.test(str));
};
const http_request_content = function (buf) {
    // from pcap.js TCP_tracker.prototype.detect_http_request
    var str = buf.toString('utf8', 0, buf.length);
    var content = "";
    var match_req = str.match(/(GET|POST)\s+[^\s\r\n]+/i)
    if (match_req) {
        content+=match_req[0].substring(4,HTTP_LENGTH_MAX+4).trimLeft();
        var match_host = str.match(/(Host:)\s+[^\s\r\n]+/i);
        if (match_host)
            content=match_host[0].substring(6,HTTP_LENGTH_MAX+4)+content;
    }
    else {
        content = null;
    }
    // return (/^(OPTIONS|GET|HEAD|POST|PUT|DELETE|TRACE|CONNECT|COPY|LOCK|MKCOL|MOVE|PROPFIND|PROPPATCH|UNLOCK) [^\s\r\n]+ HTTP\/\d\.\d\r\n/.test(str));
    return content;
};
const detect_mail_login_request = function (buf) {
    // from pcap.js TCP_tracker.prototype.detect_http_request
    var str = buf.toString('utf8', 0, buf.length);

    return (/(LOGIN|login) /.test(str));
};

// const base64Regex = /^(?:[A-Z0-9+\/]{4})*(?:[A-Z0-9+\/]{2}==|[A-Z0-9+\/]{3}=|[A-Z0-9+\/]{4})$/i;
const base64Regex = /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)$/;
const mail_request_content = function (buf) {
    var str = buf.toString('utf8', 0, buf.length).trim();
    var isAscii = true;
    var isBase64 = false;
    for (var i=0, len=str.length; i<len; i++) {
        if (buf[i] > 127) {
            isAscii=false;
            break;
        }
    }
    if (MAIL_CONVERT_BASE64 == true) {
        var words = str.split(' ');
        for (var i=0; i<words.length;i++) {
            if (words[i].length > 6 && base64Regex.test(words[i]))
                words[i] = words[i]+' '+new Buffer(words[i], 'base64').toString().replace(/\u0000/g, ' ');
            if (i == words.length-1)
                str = words.join(' ');
        }
    }
    if (isAscii) {
        return str;
    }
    return null;
};
const mail_tls_as_mails = function (buf) {
    //var str = mail_request_content(buf);
    var str = buf;
    if (!str || MAIL_TLS_AS_MAILS == false)
        return false;
    return (/(STARTTLS|CAPA|STLS)/.test(str))
};

/*  END  */





/*
 * 
 * PARSE PACKET
 * 
 * from network layer to app layer
 * 
 */
const parse_packet = function(packet, callback) {

    // if not an internet IP packet then skip
    // pcap@<=1.2.0
    // if (!packet.link || !packet.link.shost || !packet.link.ip || !packet.link.ip.saddr)
    // pcap@2.0.1
    if (!packet.payload || !packet.payload.payload || !packet.payload.payload.saddr || !packet.payload.payload.payload)
        //      ethernet           ether   ip                 ether   ip      addr
        return null

    let dat = {}; // what we send to the client

    // MAC ADDRESS DEVICE MANUFACTURER RESOLUTION
    var soui     = packet.payload.shost.toString().substring(0,8);
    dat.sdevice  = cache.oui.ptr(soui);
    var doui     = packet.payload.dhost.toString().substring(0,8);
    dat.ddevice  = cache.oui.ptr(doui);
    if (dat.sdevice) dat.sdevice = dat.sdevice.split(' ')[0] // cleanup
    if (dat.ddevice) dat.ddevice = dat.ddevice.split(' ')[0]


    // IP's
    dat.sip      = packet.payload.payload.saddr.toString();
    dat.siplocal = nettools.is_local(dat.sip);
    dat.dip      = packet.payload.payload.daddr.toString();
    dat.diplocal = nettools.is_local(dat.dip);
    // used for cache key:
    var iplocal;
    if (dat.siplocal && dat.sip !== gatewayip)
        iplocal = dat.sip;
    else
        iplocal = dat.dip;
    dat.gatewayip = gatewayip;

    // DNS CACHE REVERSE RESOLUTION
    dat.sname = cache.dns.ptr(dat.sip);
    dat.dname = cache.dns.ptr(dat.dip);
    // cleanup
         if (nettools.is_ip(dat.sname))  dat.sname = null;
    else if (dat.sname.substr(-10) === '.1e100.net')   dat.sname = 'google.com'; // deal with google
    else                                               dat.sname = dat.sname.split('.').slice(-3).join('.'); //oo.aa.domain.com into aa.domain.com)

         if (nettools.is_ip(dat.dname))  dat.dname = null;
    else if (dat.dname.substr(-10) === '.1e100.net')   dat.dname = 'google.com';
    else                                               dat.dname = dat.dname.split('.').slice(-3).join('.');

    // MDNS
         if (dat.siplocal) dat.smdnsname = cache.mdns.ptr(dat.sip)
    else if (dat.diplocal) dat.dmdnsname = cache.mdns.ptr(dat.dip)
    // cleanup
         if (dat.smdnsname && dat.siplocal) dat.smdnsname = dat.smdnsname.replace('.local.',''); //replace the shows domain for now
    else if (dat.dmdnsname && dat.diplocal) dat.dmdnsname = dat.dmdnsname.replace('.local.','');



    // GEOIP
    dat.sgeo = cache.geo.ptr(dat.sip);
    dat.dgeo = cache.geo.ptr(dat.dip);
    if (dat.sgeo == '--') dat.sgeo = null; //cleanup
    if (dat.dgeo == '--') dat.dgeo = null;


    //
    // Application layer
    //
    dat.app = {}
    dat.app.type = null

    // use DNS queries to populate reverse IP cache
    // debugger; // use --inspect and open chrome
    if (packet.payload.payload.payload.decoderName === 'udp' && (packet.payload.payload.payload.sport === 53 || packet.payload.payload.payload.dport === 53)) {
        // register this port being matched
        // actually the new_port cache is not used yet
        // but could be used in the future to change
        // print logic based on app parsing vs new
        // port/servics access
        cache.new_port.ptr(iplocal, 'dns');

        var dns = new DNS().decode(packet.payload.payload.payload.data, 0, packet.payload.payload.payload.data.length);
        if (dns.answer.rrs.length > 0) {
            for (var i=0; i < dns.answer.rrs.length; i++) {
                if (dns.answer.rrs[i].rdata && dns.answer.rrs[i].rdata.addr && dns.answer.rrs[i].name) {
                    // register this application was parsed
                    var new_data = cache.new_data.ptr(iplocal, 'dns');

                    // populate dns cache with the response
                    cache.dns.insert(dns.answer.rrs[i].rdata.addr.join('.'), dns.answer.rrs[i].name);

                    // prepare data to be sent to client
                    if (!DNS_ONLY_FIRST || new_data) {
                        dat.app.type = 'dns response';
                        dat.app.name = dns.answer.rrs[i].name.split('.').slice(-3).join('.'); //only last 3 octets of a domain
                        dat.app.ip   = dns.answer.rrs[i].rdata.addr.join('.');
                    }
                }
            }
        }
        else if (dns.question.rrs.length > 0) {
            for (var i=0; i < dns.question.rrs.length; i++) {
                if (dns.question.rrs[i].type && dns.question.rrs[i].type === 1/*'A'*/ && dns.question.rrs[i].name) {
                    var new_data = cache.new_data.ptr(iplocal, 'dns');

                    if (!DNS_ONLY_FIRST || new_data) {
                        dat.app.type = 'dns request';
                        dat.app.name = dns.question.rrs[i].name.split('.').slice(-3).join('.');
                    }
                }
            }
        }
    }

    // HTTP
    // only checking dport to reduce amount of packets
    else if (packet.payload.payload.payload.decoderName === 'tcp' && packet.payload.payload.payload.dport === 80) {// || packet.payload.payload.payload.sport === 80)) {
        cache.new_port.ptr(iplocal, 'http');

        var tcp = packet.payload.payload.payload

        if (tcp.data) {
            if (detect_http_request(tcp.data)){
                var url = http_request_content(tcp.data);

                if (url) {
                    var new_data = cache.new_data.ptr(iplocal, 'http');
                    if (!HTTP_ONLY_FIRST || new_data) {
                        // means we do not care if it is a the first http url
                        dat.app.type = 'http url';
                        dat.app.url  = url;
                    }
                }

                if (VERBOSE_DEBUG)
                    console.log("HTTP DATA:\n"+tcp.data.toString('utf8', 0, tcp.dataLength));
            }
        }
    }

    // HTTPS
    // only checking dport to reduce amount of packets
    else if (packet.payload.payload.payload.decoderName === 'tcp' && packet.payload.payload.payload.dport === 443) {// || packet.payload.payload.payload.sport === 443)) {
        cache.new_port.ptr(iplocal, 'https');
        var new_data = cache.new_data.ptr(iplocal, 'https');

        // we only ever show first HTTPS
        if (new_data) {
            dat.app.type = 'https';
        }
    }

    // MAIL
    // only checking dport to reduce amount of packets
    else if (packet.payload.payload.payload.decoderName === 'tcp' && (packet.payload.payload.payload.dport === 143 || packet.payload.payload.payload.dport === 110)) {// || packet.payload.payload.payload.sport === 443)) {
        cache.new_port.ptr(iplocal, 'mail');
        var tcp = packet.payload.payload.payload;
        //console.log('p:\n'+util.inspect(tcp,{depth: null}));

        if (tcp.data) {
            if (!MAIL_ONLY_LOGIN || detect_mail_login_request(tcp.data)) {
                var data = mail_request_content(tcp.data);

                if (data) {
                    // for now showing all plaintext. otherwise we would wathc to check new_data first
                    cache.new_data.ptr(iplocal, 'mail');
                    if (mail_tls_as_mails(data))
                        dat.app.type = 'mails';
                    else {
                        dat.app.type = 'mail'; console.log("setup") }
                    dat.app.data = data;

                    if (VERBOSE_DEBUG)
                        console.log("MAIL DATA: "+data);
                }
                else {
                    console.log('err:\n'+util.inspect(tcp.data,{depth: null}));

                }
            }
        }
    }

    // MAILS
    else if (packet.payload.payload.payload.decoderName === 'tcp' && (packet.payload.payload.payload.dport === 993 || packet.payload.payload.payload.dport === 995)) {// || packet.payload.payload.payload.sport === 443)) {
        cache.new_port.ptr(iplocal, 'mails');
        var new_data = cache.new_data.ptr(iplocal, 'mails');
        // only show first mails
        if (new_data) {
            dat.app.type = 'mails';
        }
    }

    // BROADCAST PACKET
    else if (nettools.is_broadcast(dat.sip) || nettools.is_broadcast(dat.dip)) { // || packet.link.ip.tcp.sport === 443)) {
        cache.new_port.ptr(iplocal, 'broadcast');
        var new_data = cache.new_data.ptr(iplocal, 'broadcast');

        if (!BROADCAST_ONLY_FIRST)
            dat.app.type = 'broadcast';
        else if (BROADCAST_ONLY_FIRST && new_data)
            dat.app.type = 'broadcast';
    }

    else if (MAKE_STATE_CHANGE_ON_HIDDEN_OTHER && (packet.payload.payload.payload.decoderName === 'tcp' || packet.payload.payload.payload.decoderName === 'udp')) {
        // this will cause hidden protocols to reset new_data flags for other protocols
        cache.new_data.ptr(dat.siplocal ? dat.sip : dat.dip, 0);//
    }

    else if (SHOW_ANY_TCP_UDP && (packet.payload.payload.payload.decoderName === 'tcp' || packet.payload.payload.payload.decoderName === 'udp')) {
        // you have to ignore the other protocols (or change it so that other protocols check sport also)
        if (![53,80,443,110,143,994,995].includes(packet.payload.payload.payload.sport)) {
        let proto = packet.payload.payload.payload;
        let port = dat.siplocal ? proto.sport+'-'+proto.dport : proto.dport+'-'+proto.sport;
        var new_data = cache.new_data.ptr(dat.siplocal ? dat.sip : dat.dip, port);
        // only show first packet
        if (new_data) {
            dat.app.type = 'other';
            dat.app.data = proto.decoderName+' '+port;
        }
        }
    }

    // Only return if application layer parsed
    if (dat.app.type != null)
        callback(dat);

    // or return all packets with dat defined (such as tcp/udp port parsing commented out above)
    // callback(dat);
    

};

/*  END  */






/*
 *
 * PCAP PACKET MONITOR EVENTS
 * 
 */
let packet_count = 0;
function dumpError(err) {
    if (typeof err === 'object') {
        if (err.message) {
            console.log('\nMessage: ' + err.message)
        }
        if (err.stack) {
            console.log('\nStacktrace:')
            console.log('====================')
            console.log(err.stack);
        }
    } else {
      console.log('dumpError :: argument is not an object');
    }
}
io.sockets.on('connection', function (socket) {
    console.log('connected');
    socket.join('sniffer');
    packet_count = 0; // this is a bug, should not be a global probably
    if (PACKETS_CACHE) {
        console.log('sending packets_cache, lenght:', packets_cache.length)
        packets_cache.forEach(packet => { socket.emit('packet', { data: packet }) } )
    }
    // socket = sock;
});
/*
 * 
 * PCAP Windows vs OSX/Linux
 * 
 * on windows we get raw buffer using cap and parse using pcap
 * hopefully this means there is less transliteration required
 * in the network/app parse of this code
 * 
 */
// function shared by both windows and posix implementations:
let packets_cache = [];
const packets_cache_file = __dirname+'/data/save_packets.json';
const fs = require('fs');
function packets_cache_save() {
    if (!PACKETS_CACHE_SAVE) {
        console.log('PACKETS_CACHE_SAVE=false, skipping cache save');
        return;
    }
    var string = JSON.stringify(packets_cache, null, 4);
    if (string.length <= 3) // empty files cause issues on load via require()
        return
    if (!fs.existsSync('./data')){ fs.mkdirSync('./data'); }
    fs.writeFile(packets_cache_file, string, function(err) {
        if (err)
            console.log(packets_cache_file+' '+err);
        else
            console.log('saved '+packets_cache_file);
    });
}
if (PACKETS_CACHE_LOAD) {
    fs.exists(packets_cache_file, function(exists) {
        if (exists) {
            console.log('loading '+packets_cache_file);
            // catch when file is empty
            try { packets_cache = require(packets_cache_file); }
            catch (e) { console.error(e); }
        }
    });

}
else {
    console.log('PACKETS_CACHE_LOAD=false, skipping cache load');
}

function process_send_raw_packet(raw_packet) {
    try {
        if (isWin)
            var packet = pcap_decode.packet(raw_packet);
        else
            var packet = pcap_decode.packet(raw_packet);
    } catch(err) {
        dumpError(err);
        return null;
    }

    parse_packet(packet, function(packet){
        packet_count += 1;
        packet.count = packet_count;

        // try/catch statement to not crash on bugs such as dns bug described at EOF
        try {
            console.log(packet.count+': '+packet.sip+' > '+packet.dip+'  '+packet.app.type);
        } catch(err) {
            dumpError(err);
            return;
        }
        io.to('sniffer').emit('packet', { data: packet });
        /* Example: data: {
                        sdevice: 'Intel',
                        ddevice: 'AVM',
                        sip: '192.168.178.26',
                        siplocal: true,
                        dip: '151.101.13.7',
                        diplocal: false,
                        gatewayip: '192.168.178.1',
                        sname: null,
                        dname: 'global.fastly.net',
                        smdnsname: null,
                        sgeo: '',
                        dgeo: 'DE',
                        app: { type: 'https' },
                        count: 2 } 
        */
        if (PACKETS_CACHE) {
            packets_cache.push(packet);
        }
        debugger; // use --inspect and open chrome
    });
}


if (isWin) {
// for testing this codepath but on linux, can :
// if (1 || isWin) {

    cap_session.on('packet', function(nbytes, trunc) {
        // var raw_packet = buffer.slice(0, nbytes);
        // Fake the libpcap header (time, len) as `cap` does not return it like `pcap` does
        // and `pcap` expects it. If we wanted to do this for real we would need to build the
        // export of the header ourselve
        var hrtime = process.hrtime() // this is not real time. just some arbitrary timer in node that also provides nanoseconds 
        var sec = hrtime[0]
        var header = Buffer.allocUnsafe(16);
        header.writeUInt32BE(sec, 0); // tv_sec
        header.writeUInt32BE(0, 4); // tv_usec - face for now. get error whtn using `usec` val
        header.writeUInt32BE(65535, 8); // caplen
        header.writeUInt32BE(nbytes, 12); // len
              
        var raw_packet = { buf: buffer, //<--  buffer.slice(0, nbytes) ?? 
                                 header: header, 
                                 link_type: 'LINKTYPE_'+cap_linktype }
        // shows: Buffer(60) [255, 255, 255, …]
        process_send_raw_packet(raw_packet);
    });

}
else {
    /* If issues of reconnection persist perhaps switch back to single user mode
    and change "room" use to normal emits with a global socket */
    pcap_session.on('packet', function (raw_packet) {
        // if (!io.socket)
        //     return;

        // send a vanilla packet summary to the client
        //socket.emit('packet', { data: pcap.print.packet(packet) });
        // send the full packet object (for debugging)
        //socket.emit('packet_obj', { data: packet });
        // send parsed packet:

        // handle: node_pcap: EthernetFrame() - Don't know how to decode ethertype 34824 
        // Ethernet flow control types: https://en.wikipedia.org/wiki/EtherType#Examples
        if (!raw_packet.buf || !raw_packet.buf.length >= 16)
            return
        let type = raw_packet.buf.slice(12,14).readUInt16BE(0, true)
        if (type === 34824 || type === 35041 || type === 35090)
            return;

        process_send_raw_packet(raw_packet);

    });

    // Routinely check for dropped packets
    let ps_drop = 0;
    setInterval(function () {
        var stats = pcap_session.stats();
        if (stats.ps_drop != ps_drop) {
            console.log("PCAP dropped packets: " + util.inspect(stats));
            ps_drop = stats.ps_drop;
        }
    }, 5000);
}

/*  END  */





/*
tests

// inspect packets in repl
var util = require('util');
var pcap = require("pcap"), pcap_session;
pcap_session = pcap.createSession('en1', 'ip and port 53');
global.ret = [];
pcap_session.on('packet', function (raw_packet) {
  var packet = pcap.decode.packet(raw_packet);
  global.ret.push(packet.link.ip.udp);
});
*/
