import 'reflect-metadata';
import 'source-map-support/register';
import {app, BrowserWindow, Menu, Tray, shell, ipcMain, dialog, desktopCapturer} from 'electron';
import path from 'path';
import Bridge from './bridge';
import Updater from './updater';
// @ts-ignore
import iconPath from '../icons/ogb-logo.ico';
// @ts-ignore
import indexHtmlPath from './index.html';
import {Container, ServiceNotFoundError} from "typedi";
import MainWindowService from "./services/MainWindowService";
import OscConfigDeleter from "./services/OscConfigDeleter";
import SystemLogService from "./services/SystemLogService";
import FrontendDataService from "./services/FrontendDataService";
import VrcConfigCheck from "./VrcConfigCheck";

try {
  app.enableSandbox();
  process.on("uncaughtException", (err) => {
    dialog.showErrorBox("Fatal Error", err.stack + '');
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

  let mainWindow_: BrowserWindow | undefined;

  function getMainWindow() {
    return mainWindow_ && !mainWindow_.isDestroyed() ? mainWindow_ : undefined;
  }

  function createWindow() {
    const oldMainWindow = getMainWindow();
    if (oldMainWindow) {
      if (oldMainWindow.isMinimized()) oldMainWindow.restore()
      oldMainWindow.focus()
      return;
    }
    const mainWindow = mainWindow_ = new BrowserWindow({
      width: 1024,
      height: 768,
      webPreferences: {
        preload: path.join(app.getAppPath(), 'app/preload.js')
      },
      icon: path.join(app.getAppPath(), iconPath),
      title: 'OscGoesBrrr v' + app.getVersion()
    })
    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile(indexHtmlPath);
    mainWindow.on('closed', () => mainWindow_ = undefined);
    mainWindow.on('page-title-updated', e => e.preventDefault());
    mainWindow.webContents.setWindowOpenHandler(details => {
      shell.openExternal(details.url);
      return {action: 'deny'};
    });
  }

  app.whenReady().then(() => {
    createWindow()
    app.on('activate', createWindow);
  })

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

  const container = Container;
  container.set(MainWindowService, new MainWindowService(getMainWindow));

  container.get(SystemLogService);
  container.get(OscConfigDeleter);
  container.get(FrontendDataService);
  container.get(Bridge);
  container.get(VrcConfigCheck);


} catch(e) {
  console.log("Startup error:");
  console.log((e instanceof ServiceNotFoundError) ? e.message : e);
  throw e;
}
