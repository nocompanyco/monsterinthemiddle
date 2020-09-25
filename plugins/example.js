// Example plugin
var plugins = require('../plugins')

// plugin settings changeable by user:
exports.settings = {
  enabled: true,
  filters: {}
};

// plugin settings not exposed to users 
var name = 'Example';
exports.plugin = {
  name: name,
  trigger_on: {
    packets: packet => { console.log('packet', packet) },
    // Only triggers if it is defined with function as value:
    //new_hosts: host => {console.log('host',host)},
  },
  description: 'Example plugin showing how to create plugins',

  /* 
   *  submenus: 
   *  These menus shown in UI under "Plugins" menu
   */
  submenus: [
   // start: sets a enabled state to indicate packets or data should be processed
    {'start':    () => plugins.start() },
   // stop:  turns off enabled state
    {'stop':     () => plugins.stop() },
   // pause: same
    {'pause':    () => plugins.pause() },
   // exit:  does nothing by default
    {'exit':     () => plugins.close() },
   // log:   does nothing by default
    {'log':      () => plugins.show_log() },
   // settings: show a UI where plugin_example.json can be edited
    {'settings': () => plugins.show_settings() },
  ],

  /*
   *  get_settings:
   *  by default this will set exports.settings to the contents of plugin_example.json
   */
  get_settings: () => { return plugins.get_settings(); },

  
  /*
   *  set_settings:
   *  argument is settings dictionary, store in exports.settings, write into plugin_example.json 
   */
  set_settings: dict => { return plugins.set_settings(dict) }

}



if (process.argv.length > 2) {
  if (process.argv[2] == 'test') {
    console.log('exports.plugin', exports.plugin)
    console.log('exports.settings', exports.settings)
  }
}



