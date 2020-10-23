/* PLUGINS SECTION  */
//    contains code plugin code
//    each plugin loads this libary can calls init
/* APP SECTION      */
//    contains code for root application
//    primary app loads this library and uses utilities to find plugins
//    TODO: this is a big lossy at the moment
//           - does this mean every call to triggers_populate() reloads all plugins?
//             that is called in in packets.js and scan.js

/* test:
      var plugins = require('./plugins.js')
      plugins.all.triggers_populate()
      console.log(plugins.all.triggers_get())
*/


const fs = require('fs');
const home = process.env.HOME || process.env.USERPROFILE; //userprofile=windows
const plugins_dir = './plugins'

const DEBUG = false; //change to see more debug output
/*
 *
 * APP SECTION
 * 
 */


// This function is used globally 
// (not within plugins but by root application)
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
      if (name === undefined)
        return false;
      console.log('found module',name,f);
      return true;
    });
    return files;
  }
  return [];
}
// this function returns 
// this returns a cache object used by app to call all plugin triggers
// call populate() after loading to have to find all triggers
// call get, to return triggers function cache references to inspect 
// call run(trigger_type, arguments...) to have all triggers for that type run
exports.all = (function () {
  var triggers_on = {
    raw_packet: [],     // packet in bytes
    decoded_packet: [], // decoded by pcap (from packet bytes)
    parsed_packet: [],  // parsed by mitm (from decoded packet)
    new_hosts: []
  }
  function triggers_populate () {
    files = exports.plugins_available();
    files.forEach(file => {
      var plugin;
      var plugin_name;
      var plugin_trigger_on;
      try {
        plugin = require(plugins_dir+'/'+file).plugin;
        plugin_name = plugin.name;
      } 
      catch (err) {
        console.error('error getting name for plugin',file,err)
        return;
      }

      try {
        plugin_trigger_on = plugin.trigger_on
        if (plugin_trigger_on === undefined)
          throw "trigger_on is undefined";
      } 
      catch (err) {
        console.error('error getting trigger_on for plugin',file,err);
        return;
      }

      Object.keys(triggers_on).forEach(type => {
        if (plugin_trigger_on.hasOwnProperty(type)) {
          console.log('plugin',plugin_name,'has trigger_on type',type);
          triggers_on[type].push(plugin_trigger_on[type])
        }
      });
    });
    console.log('mapped triggers:',triggers_on);
    return triggers_on;
  }
  return {
    triggers_populate: triggers_populate,
    triggers_get: () => triggers_on,
    triggers_run: (type, ...arguments) => {
      if (!triggers_on.hasOwnProperty(type)) {
        return console.error('triggers_on has no type',type,'available types:',Object.keys(triggers_on))
      }
      triggers_on[type].forEach(func => {
        if (typeof func === 'function')
          func(...arguments);
      })
    }
  }
}());



/*
 *
 * PLUGINS SECTION
 * 
 */
// return plugin name from parent module/caller
function plugin_name() {
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
  return home + '/.monsterinthemiddle_plugin_'+ plugin_name() +'.json';
}

exports.init = () => {
  console.log('plugin init()', plugin_name())

  if (module.parent.exports.plugin.init && typeof module.parent.exports.plugin.init === 'function') {
    return module.parent.exports.plugin.init()
  }
  else {
    if (!module.parent.exports.settings)
        exports.set_settings({enabled:true})
    //
    // setup electron menu default functions if plugin did not custom define
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

exports.start  = () => { console.log(plugin_name(), 'start()');
                         exports.set_settings({enabled:true}); }
exports.stop   = () => { console.log(plugin_name(), 'stop()');
                         exports.set_settings({enabled:false}) }
exports.pause  = () => { console.log(plugin_name(), 'pause()');
                         exports.set_settings({enabled:false}) }
exports.exit   = () => { console.log(plugin_name(), 'exit()'); }
exports.show_log      = () => { console.log(plugin_name(), 'show_log()'); }
exports.show_settings = () => { console.log(plugin_name(), 'show_settings()'); }

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

// function when called will change plugin settings and auto save it to json file 
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