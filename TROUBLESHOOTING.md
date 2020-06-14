
```
Error: The module '/home/user/work/counterpart/monsterinthemiddle-git/node_modules/pcap/build/Release/pcap_binding.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 79. This version of Node.js requires
NODE_MODULE_VERSION 80. Please try re-compiling or re-installing
```
Electron uses different NODE_MODULE_VERSION values than nodejs itself in order to avoid conflicts.
Hence, in order to use native modules with electron, they will have to be rebuilt with electron-rebuild.

fix with ` "rebuild": "electron-rebuild -f -w ." `


### Windows exec args error
```
start-live-capture { eth: 'WLAN', filter: 'tcp or udp', gateway: '10.128.128.128' }
electron/js2c/asar.js:140
      if (!isAsar) return old.apply(this, arguments);
                              ^

Error: \\?\C:\Users\compa\AppData\Local\Temp\3c6e21a7-7137-4c7e-b8ea-c98e82ca14fe.tmp.node is not a valid Win32 application.
\\?\C:\Users\compa\AppData\Local\Temp\3c6e21a7-7137-4c7e-b8ea-c98e82ca14fe.tmp.node
    at process.func [as dlopen] (electron/js2c/asar.js:140:31)
    at Object.Module._extensions..node (internal/modules/cjs/loader.js:1034:18)
    at Object.func [as .node] (electron/js2c/asar.js:149:18)
    at Module.load (internal/modules/cjs/loader.js:815:32)
    at Module._load (internal/modules/cjs/loader.js:727:14)
    at Function.Module._load (electron/js2c/asar.js:738:28)
    at Module.require (internal/modules/cjs/loader.js:852:19)
    at require (internal/modules/cjs/helpers.js:74:18)
    at Object.<anonymous> (C:\Program Files\monsterinthemiddle\resources\app.asar\node_modules\pcap\pcap.js:3:21)
    at Module._compile (internal/modules/cjs/loader.js:967:30)
Will only consider packet log files after this date
2014-01-01T17:30:00.000Z
C:\Program Files\monsterinthemiddle\resources\app.asar\devices.js:796
stdin.setRawMode(true);
      ^

TypeError: stdin.setRawMode is not a function
```

### Windows Defender
Alert that explains windows defender blocked certain functions requested by app and asks user which to enable: Access to private/home networks, or public networks

### Windows Maxmind Geolite2 mmdb missing
```
internal/fs/utils.js:230
    throw err;
    ^

Error: ENOENT: no such file or directory, open 'C:\Users\compa\Desktop\monsterinthemiddle\node_modules\geolite2-redist\dbs\GeoLite2-Country.mmdb'
```

Update the db with `npm install geolite2-redist`. Should show the following:

```
> geolite2-redist@1.0.7 postinstall C:\Users\compa\Desktop\monsterinthemiddle\node_modules\geolite2-redist
> node scripts/postinstall.js

Downloading MaxMind databases from mirror...
+ geolite2-redist@1.0.7
```

### Windows pcap missing

git clone https://github.com/node-pcap/node_pcap.git node_modules/pcap

this has to be run after any npm install


### Windows Electron Rebuild error

```
C:\Users\compa\Desktop\monsterinthemiddle>node_modules\.bin\electron-rebuild cap
× Rebuild Failed

An unhandled error occurred inside electron-rebuild
gyp info it worked if it ends with ok
gyp info using node-gyp@6.1.0
gyp info using node@13.11.0 | win32 | x64
gyp ERR! clean error
gyp ERR! stack Error: EPERM: operation not permitted, unlink 'C:\Users\compa\Desktop\monsterinthemiddle\node_modules\cap\build\Release\cap.node'
gyp ERR! System Windows_NT 10.0.18363
gyp ERR! command "C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\compa\\Desktop\\monsterinthemiddle\\node_modules\\node-gyp\\bin\\node-gyp.js" "rebuild" "--target=9.0.3" "--arch=x64" "--dist-url=https://www.electronjs.org/headers" "--build-from-source"
gyp ERR! cwd C:\Users\compa\Desktop\monsterinthemiddle\node_modules\cap
gyp ERR! node -v v13.11.0
gyp ERR! node-gyp -v v6.1.0
gyp ERR! not ok
```

run ` powershell Set-ExecutionPolicy RemoteSigned` in admin console

####  EPERM: operation not permitted, unlink

tried `npm run start_electron` which runs the same command but perhaps prepares the env better for windows?

##### Windows Syntax Error Microsoft JSCript compilation error
https://www.reddit.com/r/electronjs/comments/f1wc5q/microsoft_jscript_compilation_error_when_trying/
Suggests probably a script error somewhere. However I found the solution was to reinstall electron (rm node_modules). Test this with mitm_tests\5_instsall_electron hello world test

### Windows build tools index.js module not found

```
error C:\users\compa\Desktop\monsterinthemiddle\node_modules\windows-build-tools: Command failed.
Exit code: 1
Command: node ./dist/index.js
Arguments:
Directory: C:\users\compa\Desktop\monsterinthemiddle\node_modules\windows-build-tools
Output:
internal/modules/cjs/loader.js:979
  throw err;
  ^

Error: Cannot find module 'C:\users\compa\Desktop\monsterinthemiddle\node_modules\windows-build-tools\dist\index.js'
    at Function.Module._resolveFilename (internal/modules/cjs/loader.js:976:15)
    at Function.Module._load (internal/modules/cjs/loader.js:859:27)
    at Function.executeUserEntryPoint [as runMain] (internal/modules/run_main.js:71:12)
    at internal/main/run_main_module.js:17:47 {
```

trying `npm install --global windows-build-toos@4.0.0`
yeah well after doing that even cap will not install in this project nor in 2_ test