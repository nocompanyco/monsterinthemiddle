// a collection of ip check tools
// see tests directory for performance review of alternattives


module.exports.is_local = function (str) {
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
module.exports.is_broadcast = function (str) {
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
module.exports.is_ip = function (str) {
    return regip6.test(str);
    // return net.isIP(ip) // alternative
}
