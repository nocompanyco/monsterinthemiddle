'use strict';

const electron      = require('electron');
const app           = electron.app;
const BrowserWindow = electron.BrowserWindow;
const fork          = require('child_process').fork;
const ipc           = require("electron").ipcMain;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
var mainWindow      = null;
var settingsWindow  = null;
var captureProc   = null; // child fork handler

// First window should be settings window
function showSettings() {
    settingsWindow = new BrowserWindow({
        width: 430, height: 600, frame: false, 
        titleBarStyle: 'hidden',
        title: 'Monster in the Middle - Settings',
        webPreferences: {
            nodeIntegration: true
          }
        });
    settingsWindow.loadURL('file://' + __dirname + '/ui/settings.html');
    // settingsWindow.webContents.openDevTools();
}

function showMain () {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 800, height: 600, show: false,
        title: 'Monster in the Middle',
        frame: true, //no removes all borders
        webPreferences: {
            nodeIntegration: true
          }
    });
    // mainWindow.setMenu(null);
    // mainWindow.webContents.openDevTools();

    // and load the index.html of the app.
    // mainWindow.loadURL('file://' + __dirname + '/ui/index.html');
    // mainWindow.show();
    // settingsWindow.close();

    setTimeout(function(){
        mainWindow.loadURL('http://localhost:8080');
        mainWindow.show();
        settingsWindow.close();
    }, 2000);

    mainWindow.on('closed', function() {
      mainWindow = null;
      if (captureProc !== null)
        captureProc.kill('SIGINT');
    });


}

ipc.on('settings-change', function(e, arg) {
    console.log('settings changed', arg);
    if (captureProc !== null)
        captureProc.kill('SIGINT');
    setTimeout(function(){
        captureProc = fork(__dirname+'/index.js', [arg.eth, arg.filter, arg.gateway]);
        if (mainWindow == null) {
            setTimeout(showMain, 1000);
        }
    }, 1000); // wait one second for existing process to die
});

// Quit when all windows are closed.
app.on('window-all-closed', function() {
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
