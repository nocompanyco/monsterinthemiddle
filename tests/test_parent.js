const plugins = require('../plugins')

// plugin constants
exports.plugin = {
  name: 'test'
}
// user editable settings
exports.settings = {  
  a: 2
}

console.log('plugins.init()', plugins.init())

console.log('plugins.get_settings()', plugins.get_settings())

console.log('plugins.set_settings({a:3})', plugins.set_settings({ a:3}) )

console.log('exports.settings',exports.settings)

// setTimeout(() => {
  console.log('plugins.get_settings()', plugins.get_settings())
// },8000)
