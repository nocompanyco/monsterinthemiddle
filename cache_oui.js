// This is a copy, perhaps slightly modified, of node-ieee-oui-lookup which
// is no longer maintained. Mainly I needed to control the sqlite3 dependency
// more directly when using within node-webkit.


var fs          = require('fs');
var http        = require('http');
var readline    = require('readline');

var OUI_URL = 'http://standards-oui.ieee.org/oui/oui.txt';
//var OUI_URL = 'http://localhost:8000/testoui10k.txt';
//var OUI_URL = 'http://localhost:8000/testoui.txt';
var OUI_TXT = __dirname + '/oui.txt';
var FETCH_EVERY_N_DAYS = 30; // fetch oui.txt

var debug = true;

var ouiitems = {};

exports.ready = false;

exports.start = function(cb) {

    fs.stat(OUI_TXT, function(err, st1) {
      // on error or txt file older than 30 days: fetch (will call parse on finish)
      if ((!!err) || (st1.mtime.getTime() <= (new Date().getTime() - (FETCH_EVERY_N_DAYS * 86400 * 1000))))
        return fetch(cb);

      return parse(cb);
    });
};

exports.lookup = function(oui, cb) {
  var h6 = oui.split('-').join('').split(':').join('');

  if (h6.length != 6) return cb(new Error('not an OUI'), null);

  cb(null, ouiitems[parseInt(h6,16)]);
};


var fetch = function(cb) {
    // handle cases where ieee site offline or network unavailble by loading to tmp
    debug && cb(null, "begin downloading "+OUI_URL+". To avoid, stop process and touch "+OUI_TXT);

    var f = fs.createWriteStream(OUI_TXT+'.tmp');
    f.on('finish', function(){
        debug && cb(null, "finished downloading "+OUI_URL);
        fs.rename(OUI_TXT+'.tmp', OUI_TXT, function() {
            parse(cb) }); });
    f.on('error', function(){
        cb(err, null);
        fs.unlink(OUI_TXT+'.tmp') });

    var request = http.get(OUI_URL, function(response) {
              response.setEncoding('utf8');
              response.pipe(f)
    });
    request.on('error', function(err) {
        cb(err, null);
        fs.unlink(OUI_TXT+'.tmp')
    });
    request.end();

};

/*
  00-00-00   (hex)\t\t\t\t\tXEROX CORPORATION
  000000     (base 16)      XEROX CORPORATION
                            M/S 105-50C
                            800 PHILLIPS ROAD
                            WEBSTER NY 14580
                            UNITED STATES
*/

var parse = function(cb) {
  var info = { count: 0, errors: 0 };

  debug && cb(null, "begin parsing "+OUI_TXT);
  var rl = readline .createInterface({ input: fs.createReadStream(OUI_TXT)});

  rl.on('line', function(line) {
      var h6, id, name;

      line = line.trim();
      if (line.length > 15) {
        h6 = line.substr(0,6);
        line = line.substr(7).trimLeft();
        if (line.substr(0,9) === '(base 16)')
            name = line.substr(10).trimLeft();
      }

      if ((!!h6) && (h6.length === 6) && (!!name) && (name.length > 0)) {
        id = parseInt(h6.trimLeft('0'), 16);
        ouiitems[id] = name.replace(/[^\w _-]/g, '');
      }
  });

  rl.on('close', function(){
      debug && cb(null, "finished parsing");
      exports.ready = true;
  });
};

exports.start(function(err, info) {
  if (!!err) return console.log('sniffer_cache_oui: ' + err.message);

  if (!!info) console.log('sniffer_cache_oui: ' + JSON.stringify(info));
});
