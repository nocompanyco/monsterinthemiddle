// 
const arp          = require('node-arp'); // win/lnx/osx uses exec `ping` and `arp`.
const dns          = require('dns');
const multicastdns = require('multicast-dns');

let mdnser; // <- initialized from mutlicast-dns on first query
const mdnswait = 2000; // wait only this long for mdns response
const arpwait = 10; // wait ms between trying each ip arp/ping
DEBUG = false;




/*
 *
 * SCAN
 * cb called after full scan finishes
 * cb gets {mac:ip,mac2:ip2,...}
 * 
 */

exports.scan = scan;
exports.activehosts = {};
function scan(ipv4_start, ipv4_end, ipv4_filter, cb) {
    // filter is []  containing ip's we ignore. such as myip and targets we already found
    const prefix = ipv4_start.split('.').slice(0,-1).join('.');
    const start  = parseInt(ipv4_start.split('.').slice(-1)[0]);
    const end    = parseInt(ipv4_end.split('.').slice(-1)[0]);
    DEBUG && console.log(`scan prefix:${prefix} start:${start} end:${end} filter:`,ipv4_filter)
    if (typeof ipv4_filter_optional === 'function') {
        cb = ipv4_filter_optional
        ipv4_filter_optional = undefined
    }
    function _recursive_check(i) {
        const ip = prefix+'.'+i;
        if (ipv4_filter && ipv4_filter.includes(ip)) {
            DEBUG && console.log(`filter out ${ip}`)
        }
        else {
            DEBUG && console.log(`try ${ip}`)
            arp.getMAC(ip, (err, mac) => {
                // console.log(`tried ${i}: ${ip}`)
                if (!err && mac && mac.split(':').length === 6)
                    exports.activehosts[mac] = ip;
                else if (err) 
                    DEBUG && console.error(`${i}: ${ip}: error arp.getMAC:`,err);
                else
                    DEBUG && console.error(`${i}: ${ip}: mac invalid arp.getMAC:`,mac);    
            });
        }
        if (i < end)
            setTimeout(() => _recursive_check(i+1), arpwait);
        else if (i == end && typeof cb === 'function') {
            if (Object.keys(exports.activehosts).length > 0)
                    cb(exports.activehosts)
            else
                    cb(null)
        }
    }
    _recursive_check(start);
}




/*
 *
 * NAMES
 * 
 */

function dnsreverse (ip, cb) {
    dns.reverse(ip, (err, hostnames) => {
        if (!err && hostnames && hostnames.length >= 1)
            cb(hostnames[0]) //.join(", "))
        else
            cb(null)
    })
}
// this may not work
// query can be ip or known mdns query
// BUGBUG: once('response') will fail if other responses found on network at same time
function mdns (query, cb) {
    // if not intialized already:
    if (!mdnser) 
        mdnser = multicastdns();
    let q;
    if (query.split('.').length == 4) // is ip?
        q = query.split('.').reverse().join('.')+'.in-addr.arpa'
    else
        q = query;

    // setup response handler:
    // only return if we find our query
    
    function handleresponse (data) {
        // console.log(data)
        if (data && data.answers && data.answers.length >= 1) {
            data.answers.forEach(v => {
                // console.log(v, q)
                if (v.name === q && typeof v.data === 'string') {
                    cb(v.data)
                    if (timer)
                        clearTimeout(timer)
                    return;
                }
            })
        }
    }
    // wait for response but remove listener after timeout
    let timer = setTimeout(() => { 
        mdnser.removeListener('response', handleresponse) 
        cb()
    }, mdnswait)
    
    mdnser.once('response', handleresponse)


    mdnser.query({ id: 0, questions: [{ name: q, type: 'ANY' }] })
}
// meant to combine all:
function name (ip, cb) {
    // to test swap function order by swaping function names
    dnsreverse(ip, v => { 
        if (v) 
            cb (v)
        else 
            mdns(ip, v => { 
                if (v) 
                    cb(v) 
                else {
                    DEBUG && console.error(`name end: error ${ip}`)
                    cb() // call this incase caller is counting
                }
            })
    })
}
function names (ips, cb) {
    var names = {}
    var count=0;
    ips.forEach(ip => {
        name(ip, result => {
            count+=1;
            if (result)
                names[ip] = result;
            else
                names[ip] = null;
            if (count === ips.length)
                cb(names)
        })
    })
}
exports.dnsreverse = dnsreverse;
exports.mdns = mdns
exports.name = name;
exports.names = names;




/*
 *
 * IP
 * check is ip etc
 * 
 */

// a collection of ip check tools
// see tests directory for performance review of alternattives
exports.is_local = function (str) {
    // BUGBUG: ipv6 must be all lower case hex
    // check on windows
  if (str.substring(0,3) === '10.' || 
      str.substring(0,8) === '192.168.' || 
      str.substring(0,8) === '169.254.' ||
      (str.substring(0,4) === '172.' && parseInt(str.substring(4,6))>>4 === 1) || //172.16to172.31 /20bit 255.240.0.0
      str === '::1' || 
      str === '::' ||       
      str.substring(0,5) === 'fe80:' ||
      (str[0] === 'f' && parseInt(str.substring(0,4)) >= 0xfc00 && parseInt(str.substring(0,4)) <=0xfdff)  
    //   https://en.wikipedia.org/wiki/IPv6_address#Local_addresses
     ) {
    return true;
  }
  return false;
};
exports.is_broadcast = function (str) {
    // stupid way
    if (str.substr(-3) == '255')
        return true;
    return false;
};

// https://github.com/sindresorhus/ip-regex/blob/master/index.js
const v4 = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)){3}';
const v6seg = '[a-fA-F\\d]{1,4}';
// important no leading spaces:
const v6 = `
(
(?:${v6seg}:){7}(?:${v6seg}|:)|                                // 1:2:3:4:5:6:7::  1:2:3:4:5:6:7:8
(?:${v6seg}:){6}(?:${v4}|:${v6seg}|:)|                         // 1:2:3:4:5:6::    1:2:3:4:5:6::8   1:2:3:4:5:6::8  1:2:3:4:5:6::1.2.3.4
(?:${v6seg}:){5}(?::${v4}|(:${v6seg}){1,2}|:)|                 // 1:2:3:4:5::      1:2:3:4:5::7:8   1:2:3:4:5::8    1:2:3:4:5::7:1.2.3.4
(?:${v6seg}:){4}(?:(:${v6seg}){0,1}:${v4}|(:${v6seg}){1,3}|:)| // 1:2:3:4::        1:2:3:4::6:7:8   1:2:3:4::8      1:2:3:4::6:7:1.2.3.4
(?:${v6seg}:){3}(?:(:${v6seg}){0,2}:${v4}|(:${v6seg}){1,4}|:)| // 1:2:3::          1:2:3::5:6:7:8   1:2:3::8        1:2:3::5:6:7:1.2.3.4
(?:${v6seg}:){2}(?:(:${v6seg}){0,3}:${v4}|(:${v6seg}){1,5}|:)| // 1:2::            1:2::4:5:6:7:8   1:2::8          1:2::4:5:6:7:1.2.3.4
(?:${v6seg}:){1}(?:(:${v6seg}){0,4}:${v4}|(:${v6seg}){1,6}|:)| // 1::              1::3:4:5:6:7:8   1::8            1::3:4:5:6:7:1.2.3.4
(?::((?::${v6seg}){0,5}:${v4}|(?::${v6seg}){1,7}|:))           // ::2:3:4:5:6:7:8  ::2:3:4:5:6:7:8  ::8             ::1.2.3.4
)(%[0-9a-zA-Z]{1,})?                                           // %eth0            %1
`.replace(/\s*\/\/.*$/gm, '').replace(/\n/g, '').trim();
const regip6 = new RegExp(`(?:^${v4}$)|(?:^${v6}$)`)
exports.is_ip = function (str) {
    return regip6.test(str);
    // return net.isIP(ip) // alternative
}






















/*
 *
 * TEST
 * 
 * 
 */







function test (startip,endip) {
    const async = require('async');
    let hosts;
    async.waterfall([
        function (callback) {
            console.log('\n## SCAN\n## args: startip,endip ');
            scan(startip,endip, [], ret => {
                                    hosts = ret 
                                    console.log('scan hosts:',hosts)
                                    callback(null);
            })        
        },
        function (callback) {
            console.log('\n## NAMES\n');
            dnsreverse('172.217.21.238', (ret) => console.log('google dnsreverse',ret))
            // name'172.217.21.238', (ret) => console.log('google name',ret))
            testhosts ={'a4:4b:d5:a6:c1:0b': '192.168.178.23',
                        'f8:d0:27:d2:f6:95': '192.168.178.32', }
            if (hosts) testhosts = hosts
            // this list provided by scan.js but mac not needed for testing here
            names(Object.values(testhosts), ret => {
                console.log('names',ret);
                callback(null)
            })
            // Object.values(testhosts).forEach((v)=>{
            //     // dnsreverse(v, (ret) => console.log(`${v} dnsreverse`,ret))
            //     // mdns(v, (ret) => {console.log(`${v} mdns`,ret)})
            //     namev, (ret) => console.log(`${v} name`,ret))    
            // })
    
        },
        function (callback) {
            console.log('\n## MDNS SEARCHES\n');
            mdnsqueries = [
                '_smb._tcp.local',
                '_airplay._tcp.local',
                '_raop._tcp.local',
                '_homekit._tcp.local',
                '_sleep-proxy._udp.local',
                '_companion-link._tcp.local',
                '_ftp._tcp.local',
                '_nfs._tcp.local',
                '_afpovertcp._tcp.local',
                '_sftp-ssh._tcp.local',
                '_webdavs._tcp.local',
                '_webdav._tcp.local'
            ]
            // iterate through queries, giving one every 2 seconds
            let mdnscount = 0;
            function checkquery (index) {
                v=mdnsqueries[index]
                if (v) {
                    console.log(v)
                    mdns(v, (ret) => {
                        mdnscount++;
                        if (ret)
                            console.log(`${v} mdns response`,ret)
                        if (mdnscount === index) // on last timeout or response
                            callback(null)
                    })    
                    setTimeout(()=>{
                        checkquery(index+1)
                    },100)
                }
            }
            checkquery(0)       
        },
        function (callback) {
            console.log(__filename)
            console.log('## test done');
            callback();
        }
    ],console.log)
}


    
if (process.argv.length > 2 && process.argv[2] == 'test') {
    test(process.argv[3],process.argv[4],process.argv[5]);
}
