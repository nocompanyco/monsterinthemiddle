// performative check
// fastest way to detect string contains ip

const tools = require('./tools');
tools.logfile(require('path').basename(__filename)+'.txt');
tools.log(new Date(),process.platform,'node',process.version);

// TEST DATA
var ipv4 = "172.16.1.1";
var ipv4_invalid = "255.255.cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. 255.255";
var ipv4_long = "172.16.1.1 Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
// const ipv6 = "2003:e9:ff4a:a400:3ea9:f4ff:fe21:7c";



const is_local_ip = function (ip) {
    // 172.19 check is improper quick check that works anyway
    if (ip.substring(0,3) === '10.' || 
       ip.substring(0,8) === '192.168.' || 
       ip.substring(0,8) === '169.254.' ||
      (ip.substring(0,4) === '172.' && parseInt(ip.substring(4,6))>>4 === 1) //172.16to172.31 /20bit 255.240.0.0
       ) {
      return true;
    }
    return false;
};
tools.perf('substr_valid  ', ()=>{ return is_local_ip(ipv4) });    
tools.perf('substr_invalid', ()=>{ return is_local_ip(ipv4_invalid) });
tools.perf('substr_long   ', ()=>{ return is_local_ip(ipv4_long) });

const is_local_ip2 = function (ip) {
  // 172.19 check is improper quick check that works anyway
  if (ip.substring(0,3) === '10.' || 
      ip.substring(0,8) === '192.168.' || 
      ip.substring(0,8) === '169.254.' ||
      (ip.substring(0,4) === '172.' && parseInt(ip.substring(4,6))>>4 === 1) || //172.16to172.31 /20bit 255.240.0.0
      ip === '::1' || 
      ip === '::' ||       
      ip.substring(0,5) === 'fe80:' ||
      (parseInt(ip.substring(0,4)) >= 0xfc00 && parseInt(ip.substring(0,4)) <=0xfdff) 
     ) {
    return true;
  }
  return false;
};
tools.perf('substr2_valid  ', ()=>{ return is_local_ip2(ipv4) });    
tools.perf('substr2_invalid', ()=>{ return is_local_ip2(ipv4_invalid) });
tools.perf('substr2_long   ', ()=>{ return is_local_ip2(ipv4_long) });


// https://github.com/frenchbread/private-ip/blob/master/src/index.js
const regex1 = (ip) => (
    /^(::f{4}:)?10\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/i.test(ip) ||
    /^(::f{4}:)?192\.168\.([0-9]{1,3})\.([0-9]{1,3})$/i.test(ip) ||
    /^(::f{4}:)?172\.(1[6-9]|2\d|30|31)\.([0-9]{1,3})\.([0-9]{1,3})$/i.test(ip) ||
    /^(::f{4}:)?169\.254\.([0-9]{1,3})\.([0-9]{1,3})$/i.test(ip) ||
    /^f[cd][0-9a-f]{2}:/i.test(ip) ||
    /^fe80:/i.test(ip) ||
    /^::1$/.test(ip) ||
    /^::$/.test(ip)
  )
tools.perf('regex1_valid  ', ()=>{ return regex1(ipv4) });    
tools.perf('regex1_invalid', ()=>{ return regex1(ipv4_invalid) });
tools.perf('regex1_long   ', ()=>{ return regex1(ipv4_long) });


