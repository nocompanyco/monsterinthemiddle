const fs = require('fs');
const home = process.env.HOME || process.env.USERPROFILE;
const plugins_dir = './plugins'

function name() {
  if (!module ||
      !module.parent ||
      !module.parent.exports ||
      !module.parent.exports.plugin ||
      !module.parent.exports.plugin.name) {
    console.error('plugin.js requires a exports.plugin.name in caller')
    return false;
  }
  return module.parent.exports.plugin.name.replace(/\W/g, '-');
}
function settings_file() {
  return home + '/.monsterinthemiddle_plugin_'+ name() +'.json';
}

// This function  is used globally (not within plugins but by root application)
// to get list of available plugins
exports.plugins_available = () => {
  let files = fs.readdirSync(plugins_dir);
  if (files) {
    // only get ones that are .js
    files = files.filter(f => f.toLowerCase().endsWith('.js') )
    // only ones that have a exports.plugins.name 
    files = files.filter(f => {
      try {
        var name = require(plugins_dir+'/'+f).plugin.name;
      }
      catch (err) {
        return false;
      }
      console.log('found module',name,f);
      return true;
    });
    return files;
  }
  return [];
}


exports.init = () => {
  console.log('plugin init()', name())

  if (module.parent.exports.plugin.init && typeof module.parent.exports.plugin.init === 'function') {
    return module.parent.exports.plugin.init()
  }
  else {
    if (!module.parent.exports.settings)
        exports.set_settings({enabled:true})
    //
    // setup electron menu default functions
    //
    if (!module.parent.exports.plugin.submenus)
      module.parent.exports.plugin.submenus = {}
    if (!module.parent.exports.plugin.submenus.start)
      module.parent.exports.plugin.submenus.start = exports.start();
    if (!module.parent.exports.plugin.submenus.stop)
      module.parent.exports.plugin.submenus.stop = exports.stop();
    if (!module.parent.exports.plugin.submenus.pause)
      module.parent.exports.plugin.submenus.pause = exports.pause();
    if (!module.parent.exports.plugin.submenus.exit)
      module.parent.exports.plugin.submenus.exit = exports.exit();
    if (!module.parent.exports.plugin.submenus.log)
      module.parent.exports.plugin.submenus.log = exports.show_log();
    if (!module.parent.exports.plugin.submenus.settings)
      module.parent.exports.plugin.submenus.settings = exports.show_settings();
  }
}

exports.start  = () => { console.log(name(), 'start()');
                         exports.set_settings({enabled:true}); }
exports.stop   = () => { console.log(name(), 'stop()');
                         exports.set_settings({enabled:false}) }
exports.pause  = () => { console.log(name(), 'pause()');
                         exports.set_settings({enabled:false}) }
exports.exit   = () => { console.log(name(), 'exit()'); }
exports.show_log      = () => { console.log(name(), 'show_log()'); }
exports.show_settings = () => { console.log(name(), 'show_settings()'); }

exports.get_settings = () => {
  if (module.parent.exports.plugin.get_settings && typeof module.parent.exports.plugin.get_settings === 'function') {
    return module.parent.exports.plugin.get_settings()
  }
  else {
    // else process
    const file = settings_file();
    var settings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null;
    if (settings)
      module.parent.exports.settings = settings;
    return module.parent.exports.settings;
  }
}

// will auto save
exports.set_settings = dict => {
  if (!dict)
    return false;
  if (module.parent.exports.plugin.set_settings && typeof module.parent.exports.plugin.set_settings === 'function') {
      return module.parent.exports.plugin.set_settings(dict)
  }
  else {
    // module.parent.exports.settings = dict;
    // use additive method inste
    Object.keys(dict).forEach(key => module.parent.exports.settings[key]=dict[key])

    // save to file
    fs.writeFileSync(settings_file(), JSON.stringify(module.parent.exports.settings, null,4));
    return module.parent.exports.settings
  }
}