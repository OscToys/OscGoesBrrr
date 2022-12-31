import 'source-map-support/register';
import {app, BrowserWindow, Menu, Tray, shell, ipcMain, dialog, desktopCapturer} from 'electron';
import path from 'path';
import util from 'util';
import Bridge from './bridge';
import fs from 'fs/promises';
import fsPlain from 'fs';
import Updater from './updater';
import OscConnection from "./OscConnection";
import Buttplug from "./Buttplug";
import OscConfigDeleter from "./OscConfigDeleter";
import VrcConfigCheck from "./VrcConfigCheck";

process.on("uncaughtException", (err) => {
  dialog.showErrorBox("Fatal Error", err.stack+'');
  app.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error('Unhandled rejection', err);
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.exit();
}

const updater = new Updater();
updater.checkAndNotify();

const savePath = path.join(app.getPath('appData'), 'OscGoesBrrr', 'config.txt');
const configMap = new Map<string,string>();
let configTxt = '';

let oscConnection: OscConnection | undefined;
let butt: Buttplug | undefined;

function loadConfig(txt: string) {
  configTxt = txt;
  const oldConfigMap = new Map<string,string>(configMap);
  configMap.clear();
  for (let line of configTxt.split('\n')) {
    line = line.trim();
    if (line.startsWith('/') || line.startsWith('#')) continue;
    const split = line.split('=', 2);
    const key = split[0]!.trim();
    if (!key) continue;
    const value = (split.length > 1 ? split[1]! : '').trim();
    configMap.set(key, value);
  }

  if (oldConfigMap.get('osc.port') !== configMap.get('osc.port')) {
    if (oscConnection) oscConnection.delayRetry();
  }
  if (oldConfigMap.get('bio.port') !== configMap.get('bio.port')) {
    if (butt) butt.delayRetry();
  }
}

const vrcConfigCheck = new VrcConfigCheck();
vrcConfigCheck.start();

if (fsPlain.existsSync(savePath)) {
  loadConfig(fsPlain.readFileSync(savePath, {encoding: 'utf-8'}));
}

let mainWindow: BrowserWindow | undefined;
function createWindow() {
  if (mainWindow != null) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'app/preload.js')
    }
  })
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('app/index.html');
  mainWindow.setIcon(path.join(app.getAppPath(), 'app/tps-bio.png'));
  mainWindow.setTitle('OSC Goes Brrr v' + updater.getLocalVersion());
  mainWindow.on('closed', () => mainWindow = undefined);
  mainWindow.on('page-title-updated', e => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(details => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', createWindow);
})

function sendLog(type: string, ...args: unknown[]) {
  console.log(`[${type}]`, ...args);
  if (mainWindow) {
    mainWindow.webContents.send(type, util.format(...args));
  }
}

//app.on('window-all-closed', e => e.preventDefault());

app.on('second-instance', createWindow);

/*
let tray = null
app.whenReady().then(() => {
  tray = new Tray(path.join(app.getAppPath(), 'tps-bio.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Exit', click: async () => { app.quit() } },
  ])
  tray.setToolTip('OSC Goes Brrr');
  tray.setContextMenu(contextMenu);
  tray.on('click', createWindow);
})
 */

const buttLogger = (...args: unknown[]) => sendLog('bioLog', ...args);
const oscLogger = (...args: unknown[]) => sendLog('oscLog', ...args);
butt = new Buttplug(buttLogger, configMap);
oscConnection = new OscConnection(oscLogger, configMap);
const bridge = new Bridge(oscConnection, butt, buttLogger, configMap);
new OscConfigDeleter(oscLogger, configMap);

ipcMain.handle('bioStatus:get', async (_event, text) => {
  let bioStatus = '';
  if (butt && butt.wsReady()) {
    const devices = Array.from(bridge.getToys()).map(toy => toy.getStatus());
    devices.sort();
    let devicesStr;
    if (devices.length) {
      devicesStr = devices.join('\n');
    } else {
      devicesStr = 'None';
    }
    bioStatus = 'Connected to Intiface!\nConnected Devices:\n' + devicesStr;
  } else {
    bioStatus = 'Not connected to Intiface.\nIs Intiface Desktop running?\nDid you click Start Server?';
  }
  return bioStatus;
});

ipcMain.handle('oscStatus:get', async (_event, text) => {
  if (!oscConnection || !oscConnection.socketopen) {
    return `OSC socket isn't open.\nIs something else using the OSC port?`;
  }
  if (!oscConnection.lastReceiveTime || oscConnection.lastReceiveTime < Date.now() - 60_000) {
    if (vrcConfigCheck.oscEnabled === false) {
      return `OSC is disabled in your game.\nEnable it in the radial menu:\nOptions > OSC > Enabled`;
    } else {
      return `Haven't received OSC status recently.\nIs game open and active?`;
    }
  }

  const gameDevices = Array.from(bridge.getGameDevices());

  const sections: string[] = [];

  if (vrcConfigCheck.oscEnabled === false) {
    sections.push(`OSC is disabled in your game.\nEnable it in the radial menu:\nOptions > OSC > Enabled`);
  }
  if (vrcConfigCheck.selfInteractEnabled === false) {
    sections.push('Self-Interaction is disabled in your game.\nThis breaks many OGB features.\nEnable it in the quick menu:\nSettings > Avatar Interactions > Self Interact');
  }
  if (vrcConfigCheck.everyoneInteractEnabled === false) {
    sections.push('Interaction is not set to everyone in game.\nEnable it in the quick menu:\nSettings > Avatar Interactions > Everyone');
  }

  if (vrcConfigCheck.selfInteractEnabled !== false) {
    const outdated = gameDevices.some(device => {
      if (device.type == 'Pen' && (device.getVersion() ?? 0) < 8) return true;
      if (device.type == 'Orf' && (device.getVersion() ?? 0) < 9) return true;
      return false;
    });
    if (outdated) {
      sections.push('OUTDATED AVATAR DETECTED\n' +
          'Your avatar was not built using\nthe newest OscGB upgrade tool.\n' +
          'Penetration may not work or be less effective.\n' +
          'If you are sure your avatar is updated already,\nbe sure "Self Interact" is on in your vrc settings.')
    }
  }

  if (gameDevices.length > 0) {
    const gameDeviceStatuses = gameDevices.map(d => d.getStatus());
    gameDeviceStatuses.sort();
    sections.push(gameDeviceStatuses.join('\n'));
  }

  const globalSources = bridge.getGlobalSources(false);
  if (globalSources.length > 0) {
    const globalSourcesLines = globalSources
        .map(source => source.deviceType+'.'+source.deviceName+'.'+source.featureName+'='+source.value);
    globalSourcesLines.sort();
    sections.push("Other sources:\n" + globalSourcesLines.join('\n'));
  }

  const rawOscParams = Array.from(oscConnection.entries())
      .map(([k,v]) => `${k}=${v.get()}`);
  rawOscParams.sort();
  if (rawOscParams.length > 0) {
    sections.push('Raw OSC data:\n' + rawOscParams.join('\n'));
  }

  return sections.join('\n\n');
});

ipcMain.handle('config:save', (_event, text) => {
  loadConfig(text);

  fs.mkdir(path.dirname(savePath), {recursive: true}).then(() => fs.writeFile(savePath, text));
  if (mainWindow) mainWindow.webContents.send('config:saved');
});
ipcMain.handle('config:load', (_event) => {
  return configTxt;
});

ipcMain.handle('fft:status', (_event, level) => {
  if (typeof level != 'number') return;
  if (level < 0 || level > 1 || isNaN(level)) return;
  bridge.receivedFft(level);
})

setInterval(() => {
  if(!mainWindow) return;
  const audioLevel = parseFloat(configMap.get('audio') ?? '');
  const on = !isNaN(audioLevel) && audioLevel > 0;
  mainWindow.webContents.send(on ? 'fft:start' : 'fft:stop');
}, 1000);
