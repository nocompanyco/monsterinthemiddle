// performative check
// fastest way to detect string contains ip

const tools = require('./tools');
tools.logfile(require('path').basename(__filename)+'.txt');
tools.log(new Date(),process.platform,'node',process.version);

// TEST DATA
var ipv4 = "255.255.255.255";
var ipv4_invalid = "255.255. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. 255.255";
var ipv4_long = "255.255.255.255 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
const ipv6 = "2003:e9:ff4a:a400:3ea9:f4ff:fe21:7c";


function notNaN(string) {
    return !isNaN(string.split('.').join(''))
}
tools.perf('notNaN_valid  ', ()=>{ return notNaN(ipv4) });
tools.perf('notNaN_invalid', ()=>{ return notNaN(ipv4_invalid) });
tools.perf('notNaN_long   ', ()=>{ return notNaN(ipv4_long) });


function splitdot (ip)  { return ip.substring(0,16).split('.').length === 4; }
tools.perf('dot_valid  ', ()=>{ return splitdot(ipv4) });
tools.perf('dot_invalid', ()=>{ return splitdot(ipv4_invalid) });
tools.perf('dot_long   ', ()=>{ return splitdot(ipv4_long) });


const net = require('net');
function netIsIP (ip) { return net.isIP(ip) >= 4; }
tools.perf('net_valid  ', ()=>{ return netIsIP(ipv4) });    
tools.perf('net_invalid', ()=>{ return netIsIP(ipv4_invalid) });
tools.perf('net_log    ', ()=>{ return netIsIP(ipv4_long) });


const regex1 = new RegExp(/^(\d{1,3}\.){3}\d{1,3}$/)
tools.perf('regex1_valid  ', ()=>{ return regex1.test(ipv4) });    
tools.perf('regex1_invalid', ()=>{ return regex1.test(ipv4_invalid) });
tools.perf('regex1_log    ', ()=>{ return regex1.test(ipv4_long) });

// https://github.com/sindresorhus/ip-regex/blob/master/index.js
const v4 = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)){3}';
const regex2 =  new RegExp(v4);
tools.perf('regex2_valid  ', ()=>{ return regex2.test(ipv4) });    
tools.perf('regex2_invalid', ()=>{ return regex2.test(ipv4_invalid) });
tools.perf('regex2_log    ', ()=>{ return regex2.test(ipv4_long) });



// https://github.com/sindresorhus/ip-regex/blob/master/index.js
const v6seg = '[a-fA-F\\d]{1,4}';
const v6 = `(
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
tools.perf('regip6_valid  ', ()=>{ return regip6.test(ipv4) });    
tools.perf('regip6_invalid', ()=>{ return regip6.test(ipv4_invalid) });
tools.perf('regip6_log    ', ()=>{ return regip6.test(ipv4_long) });
tools.perf('regip6_ipv6   ', ()=>{ return regip6.test(ipv6E) });




