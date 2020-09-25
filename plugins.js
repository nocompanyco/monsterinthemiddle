const fs = require('fs');

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

exports.init = () => {
  console.log('plugin init()', name())

  if (module.parent.exports.plugin.init && typeof module.parent.exports.plugin.init === 'function') {
    return module.parent.exports.plugin.init()
  }
  else {
    if (!module.parent.exports.settings)
        exports.set_settings({enabled:true})
    //
    // setup electron menu?
    //
  }
}

exports.start  = () => { console.log(name(), 'start()');
                         exports.set_settings({enabled:true}); }
exports.stop   = () => { console.log(name(), 'stop()');
                         exports.set_settings({enabled:false}) }
exports.pause  = () => { console.log(name(), 'pause()');
                         exports.set_settings({enabled:false}) }
exports.close  = () => { console.log(name(), 'close()'); }
exports.show_log  = () => { console.log(name(), 'show_log()'); }
exports.show_settings  = () => { console.log(name(), 'show_settings()'); }

exports.get_settings = () => {
  if (module.parent.exports.plugin.get_settings && typeof module.parent.exports.plugin.get_settings === 'function') {
    return module.parent.exports.plugin.get_settings()
  }
  else {
    // else process
    const home = process.env.HOME || process.env.USERPROFILE;
    const file = home + '/.monsterinthemiddle_plugin_'+ name() +'.json';
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
    const home = process.env.HOME || process.env.USERPROFILE;
    const file = home + '/.monsterinthemiddle_plugin_'+ name() +'.json';
    fs.writeFileSync(file, JSON.stringify(module.parent.exports.settings, null,4));
    return module.parent.exports.settings
  }
}