'use strict';

const {ipcMain, app, Menu, BrowserWindow} = require('electron');
const fork = require('child_process').fork;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let settingsWindow   = null;
let packetsWindow    = null;
let devicesWindow    = null;
let scanWindow   = null;
let packetsProc      = null; // child fork handler for packets capture
let devicesProc      = null; // child fork  handler for devices ui
let scanProc     = null;
let network_settings = null;

/* eslint-disable indent, object-curly-spacing, brace-style */
const menuTemplate = [
{ label: '&File', submenu: [
    // { label: 'Open saved session', accelerator: 'CmdOrCtrl+O',
    // click (item, win) { showSettings(); } },
    // { label: 'Save session', accelerator: 'CmdOrCtrl+S',
    // click (item, win) { showSettings; } },
    { type: 'separator' },
    { role: 'close' },
    { role: 'quit' },
]},
{ label: '&MiTM', submenu: [
    { label: 'Devices monitor', accelerator: 'CmdOrCtrl+D',
      click(item, win) {showDevices();} },
    { label: 'Packets monitor', accelerator: 'CmdOrCtrl+P',
      click(item, win) {showPackets();} },
    { label: 'Network scan and control', accelerator: 'CmdOrCtrl+N',
    click(item, win) {showScan();} },
]},
{ label: '&View', submenu: [
    { role: 'reload'},
    { role: 'toggleDevTools'},
    // { label: 'Toggle Developer Tools',
    //   accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
    //   click (item, win) { if (win) win.webContents.toggleDevTools() } },
    { type: 'separator' },
    { role: 'resetzoom' },
    { role: 'zoomin' },
    { role: 'zoomout' },
    { type: 'separator' },
    { role: 'togglefullscreen' }] },
{ label: '&Help', submenu: [
    { label: 'Documentation',
      click() {require('electron').shell.openExternal('https://github.com/nocompanyco/monisterinthemiddle');} },
    { label: 'About',
      click() {require('electron').shell.openExternal('https://counterpart.org');} }] },
];
/* eslint-enable */
const menu = Menu.buildFromTemplate(menuTemplate);


// First window should be settings window
function showSettings() {
  if (settingsWindow) {
    settingsWindow.show();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 700, height: 580,
    frame: false,
    titleBarStyle: 'hidden',
    title: 'Settings',
    webPreferences: {
      nodeIntegration: true,
      // enableRemoteModule: true
    },
    // icon: __dirname + '/build/icon.png'
  });
  Menu.setApplicationMenu(menu);


  settingsWindow.loadURL('file://' + __dirname + '/ui/settings.html');
  // settingsWindow.webContents.openDevTools();
}


function showPackets() {
  if (packetsWindow) {
    packetsWindow.show();
    return;
  }

  // Create the browser window.
  packetsWindow = new BrowserWindow({
    width: 800, height: 600,
    frame: true, // no removes all borders
    show: true,
    x: 100, y: 100,
    title: 'Packets monitor',
    webPreferences: {
      nodeIntegration: true,
    },
    // icon: __dirname + '/build/icon.png'
  });
  Menu.setApplicationMenu(menu);
  // packetsWindow.setMenu(null);
  // packetsWindow.webContents.openDevTools();

  setTimeout(function() {
    packetsWindow.loadURL('http://localhost:8080');
    packetsWindow.show();
    settingsWindow.close();
  }, 2000);

  packetsWindow.on('closed', function() {
    packetsWindow = null;
  });
}

function showDevices() {
  if (devicesWindow) {
    devicesWindow.show();
    return;
  }
  devicesWindow = new BrowserWindow({
    width: 800, height: 600,
    title: 'Devices monitor',
    frame: true, // no removes all borders
    show: true,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
    },
    // icon: __dirname + '/build/icon.png'
  });
  Menu.setApplicationMenu(menu);
  // devicesWindow.webContents.openDevTools();

  setTimeout(function() {
    devicesWindow.loadURL('http://localhost:8081');
    devicesWindow.show();
  }, 2000);

  devicesWindow.on('closed', function() {
    devicesWindow = null;
  });
}

function showScan() {
  if (!scanProc) {
    const args = network_settings;
    scanProc = fork(__dirname+'/scan.js', ['--eth', args.eth, '--gateway', args.gateway, '--start', 'no']);
  }

  if (scanWindow) {
    scanWindow.show();
    return;
  }
  scanWindow = new BrowserWindow({
    width: 600, height: 650,
  title: 'Network scan and control',
    frame: true, // no removes all borders
    show: true,
    webPreferences: {
      nodeIntegration: true,
    },
    // icon: __dirname + '/build/icon.png'
  });
  Menu.setApplicationMenu(menu);
  // scanWindow.webContents.openDevTools();

  setTimeout(function() {
    scanWindow.loadURL('http://localhost:8083');
    scanWindow.show();
  }, 2000);

  scanWindow.on('closed', function() {
    scanWindow = null;
  });
}

ipcMain.on('start-live-capture', function(e, arg) {
  console.log('start-live-capture', arg);
  network_settings = arg;
  // if settings ui opened and settings changed, restart:
  let killwait = 0;
  if (packetsProc !== null) {
    packetsProc.kill('SIGINT');
    killwait = 1000;
  }
  if (devicesProc !== null) {
    devicesProc.kill('SIGINT');
    killwait = 1000;
  }
  if (scanProc !== null) {
    scanProc.kill('SIGINT');
    killwait = 1000;
  }

  // wait at least one second for restart
  setTimeout(function() {
    packetsProc = fork(__dirname+'/packets.js', [arg.eth, arg.filter, arg.gateway]);
    setTimeout(function() {
      devicesProc = fork(__dirname+'/devices.js');
      if (devicesWindow == null) {
        // setTimeout(showPackets, 1000);
        setTimeout(showPackets, 1000);
      }
    }, 1000);
  }, killwait); // wait one second for existing process to die
});
ipcMain.on('start-load-capture', function(e, arg) {
  console.log('start-load-capture', arg);
  console.log('TODO');
});

// Quit when all windows are closed.
app.on('window-all-closed', function() {
  if (packetsProc !== null) packetsProc.kill('SIGINT');
  if (devicesProc !== null) devicesProc.kill('SIGINT');
  if (scanProc !== null) scanProc.kill('SIGINT');
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform != 'darwin') {
    app.quit();
  }
});


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', function() {
  console.log('ready');
  showSettings();
});


