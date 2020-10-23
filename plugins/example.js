// Example plugin
var plugins = require('../plugins')

// plugin settings changeable by user:
exports.settings = {
  enabled: true,
  filters: {}
};

// just to test referenced functions being called in child scopes
function our_log(...arguments) {
  console.log(...arguments)
}

/* test:
example = require('./plugins/example.js')
*/
// plugin settings not exposed to users 
var name = 'Example';
exports.plugin = {
  name: name,
  trigger_on: {
    raw_packet: p => { our_log('example.js raw_packet', p); },
    parsed_packet: p => { console.log('example.js parsed_packet', p); },
    // Only triggers if it is defined with function as value:
    new_hosts: (new_hosts,hosts) => { console.log('example.js new_hosts:',new_hosts,', hosts:',hosts); },
  },


  //
  // The rest of the following items are not required and 
  // have sensible defaults generated for each plugin if not
  // defined here
  //

  description: 'Example plugin showing how to create plugins',

  /* 
   *  submenus: 
   *  These menus shown in UI under "Plugins" menu
   */
  submenus: {
   //start:sets a enabled state to indicate packets or data should be processed
     start:    () => plugins.start(),
   //stop:turns off enabled state
     stop:     () => plugins.stop(),
   //pause:same
     pause:    () => plugins.pause(),
   //exit:does nothing by default
     exit:     () => plugins.exit(),
   //log:does nothing by default
     log:      () => plugins.show_log(),
   //settings:show a UI where plugin_example.json can be edited
     settings: () => plugins.show_settings(),
  },

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
    plugins.init()
  }
}



