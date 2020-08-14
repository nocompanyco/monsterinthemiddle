// routing rules update
// in the interest of reducing calls to external libraries we
// include some code from other libraries locally where we can
// maintain it ourselves.
//
// combination and simplification of:
// https://github.com/sitespeedio/throttle/blob/main/lib/pfctl.js
// https://github.com/pkrumins/node-iptables/blob/master/index.js

const isWin = (process.platform === 'win32');
const isLinux = (process.platform === 'linux');
const isOSX = (process.platform === 'darwin');

//const spawn = require('child_process').spawn;
const exec = require('child_process').execFile;
//var input; exec('iptables', ['-L'], (err,stdout,stdin) => { input = stdout} )

function execute(cmd, args, cb) {
  exec(cmd, args, (error, stdout, stderr) => {
    if (error) {
      throw error;
    }
    if (typeof cb === 'function')
      cb(stdout);
  });
}

function list(cb=console.log) {
  if (isOSX) {
    console.error("routerrules.js: OSX control of pfctl not supported yet")
  }
  else if (isLinux) {
    var cmd = 'iptables';
    var args = ['-t', 'nat', '-L', 'PREROUTING'];
    var parser = function(result) {
      // shift() skips first two lines
      var rules = result.trim().split(/\r?\n/).slice(2).map(function (line) {
        // packets, bytes, target, pro, opt, in, out, src, dst, opts
        var fields = line.trim().split(/\s+/);
        return {
          parsed : {
            target : fields[0],
            proto : fields[1],
            opt : fields[2],
            source : fields[3],
            dst : fields[4],
            rest : fields.slice(5).join(' '),
          },
          raw : line.trim()
        }
      });
      if (typeof cb === 'function')
        cb(rules);
    }
  }
  execute(cmd,args,parser);
}
exports.list = list;

/*
    intercept a LAN host that makes request to google port 80:
      intercept(10.0.0.1, "8.8.8.8", 80, 8080)
    intercept all LAN hosts that make request to google port 80
      intercept(null, "8.8.8.8", 80, 8080)
    delete that rule:
      intercept(null, "8.8.8.8", 80, 8080, 'tcp', '-D')

 */
function intercept(sip, dip, dport, proxyport, proto='tcp' /*tcp|udp*/, action='-A' /*-A|-D*/) {
  if (isOSX) {
    console.error("routerrules.js: OSX control of pfctl not supported yet")
  }
  else if (isLinux) {
    var cmd = 'iptables';
    // -A to add, -D to delete
    var args = ['-t', 'nat', action, 'PREROUTING', '-p', proto, '--dst', dip, '--dport', dport];
    if (sip) args = args.concat(['--src',sip])
    args = args.concat(['-j', 'REDIRECT', '--to-ports', proxyport])
    execute(cmd,args);
    // console.log(args)
  }
}
exports.intercept = intercept;
function unintercept(sip, dip, dport, proxyport, proto='tcp' /*tcp|udp*/) {
  intercept(sip, dip, dport, proxyport, proto, '-D');
}
exports.unintercept = unintercept;



function flush() {
  // execute('iptables', ['-X']);
  // execute('iptables', ['-F']);
  execute('iptables', ['-t', 'nat', '-F', 'PREROUTING']);
}
exports.flush = flush;
function init() {
  flush();
  // execute('iptables', ['-P', 'INPUT', 'ACCEPT']);
  // execute('iptables', ['-P', 'FORWARD', 'ACCEPT']);
  // execute('iptables', ['-P', 'OUTPUT', 'ACCEPT']);

  // I do not think we should need this since we should be routing transparently
  // execute('iptables', ['-t', 'nat', '-A', 'POSTROUTING', '-j', 'MASQUERADE'])
}
exports.init = init;


