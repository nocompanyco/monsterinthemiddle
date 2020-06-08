
```
Error: The module '/home/user/work/counterpart/monsterinthemiddle-git/node_modules/pcap/build/Release/pcap_binding.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 79. This version of Node.js requires
NODE_MODULE_VERSION 80. Please try re-compiling or re-installing
```
Electron uses different NODE_MODULE_VERSION values than nodejs itself in order to avoid conflicts.
Hence, in order to use native modules with electron, they will have to be rebuilt with electron-rebuild.

fix with ` "rebuild": "electron-rebuild -f -w ." `
