// use mdns and other to get name

const dns = require('dns');
const mdnser = require('multicast-dns')();
const mdnswait = 2000;


function dnsreverse (ip, cb) {
    dns.reverse(ip, (err, hostnames) => {
        if (!err && hostnames && hostnames.length >= 1)
            cb(hostnames[0]) //.join(", "))
        else
            cb(null)
    })
}
exports.dnsreverse = dnsreverse;


// this may not work
// query can be ip or known mdns query
// BUGBUG: once('response') will fail if other responses found on network at same time
function mdns (query, cb) {

    var q
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
exports.mdns = mdns


// meant to combine all:
function getname (ip, cb) {
    // to test swap function order by swaping function names
    dnsreverse(ip, v => { 
        if (v) 
            cb (v)
        else 
            mdns(ip, v => { 
                if (v) cb(v) 
                else console.error(`getname end error ${ip}`)
            })
    })
}
// exports.getname = getname;


if (process.argv.length > 2 && process.argv[2] == 'test') {

    dnsreverse('172.217.21.238', (ret) => console.log('google dnsreverse',ret))
    // getname('172.217.21.238', (ret) => console.log('google getname',ret))

    testhosts= {
        '3c:cd:36:95:af:24': '192.168.178.39',
        'a4:4b:d5:a6:c1:0b': '192.168.178.23',
        'a4:4b:d5:a6:c1:0b': '192.168.178.27',
        '04:cf:8c:92:d8:f7': '192.168.178.37',
        '08:96:d7:96:98:99': '192.168.178.1',
        '14:20:5e:31:b1:c4': '192.168.178.27',
        'f0:18:98:25:94:93': '192.168.178.40',
        'f8:d0:27:d2:f6:95': '192.168.178.32',
    }

    Object.values(testhosts).forEach((v)=>{
        // dnsreverse(v, (ret) => console.log(`${v} dnsreverse`,ret))
        // mdns(v, (ret) => {console.log(`${v} mdns`,ret)})
        getname(v, (ret) => console.log(`${v} getname`,ret))    
    })

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
        '_smb._tcp.local',
        '_sftp-ssh._tcp.local',
        '_webdavs._tcp.local',
        '_webdav._tcp.local'
    ]

    // iterate through queries, giving one every 2 seconds
    function checkquery (index) {
        v=mdnsqueries[index]
        if (v) {
            console.log(v)
            mdns(v, (ret) => {console.log(`${v} mdns`,ret)})    
            setTimeout(()=>{checkquery(index+1)},2000)
        }
    }
    checkquery(0)

}
















// // we can't send a request and just use once('response)
// // this may pickup mdns packets from someone elses query or broadcast
// function handleresponse (data) {
//     // iterate through answers:[{name:,data:}]
//     //  iterate through addtionals:[{name:,data:}]
//     // find name name from our search and take data
//     // or find ip in data and take name
//     console.log('mdns got response:',utils.inspect(data,color=true, depth=6) )
//     // if (data && data.answers && data.answers.length >=1)
//     //     console.log('mdns response:',data.answers)
//     // else f
//     //     console.log(data)
    
//     // if (timer) 
//     //     clearTimeout(timer)
// }
// let qcount = 0
// function mdns (query, cb) {
//     // wait for response but remove listener after timeout
//     // let timer = setTimeout(()=>{ 
//     //     mdnser.removeListener('response', handleresponse)
//     //     cb(null)
//     // }, mdnswait)

//     var q = query.split('.')
//     if (q.length === 4)
//         q = q.reverse().join('.')+'.in-addr.arpa.'
//     else
//         q = query;

//     mdnser.query({ id: qcount++,
//         questions: [{
//             name: query,
//             type: 'ANY'
//         }]
//     })
// }
// // debug
// // mdnser.on('query', (ret) => console.log('mdns got query:',ret))
// mdnser.on('response', handleresponse)

