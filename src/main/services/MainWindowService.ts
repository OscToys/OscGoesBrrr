import {app, BrowserWindow, shell} from "electron";
import path from "path";
import {Service} from "typedi";
import {IpcEventArgs, IpcEventChannel} from "../../common/ipcContract";
// @ts-ignore
import iconPath from '../../icons/ogb-logo.ico';
// @ts-ignore
import indexHtmlPath from '../index.html';

@Service()
export default class MainWindowService {
    private mainWindow?: BrowserWindow;

    constructor() {
        app.whenReady().then(() => {
            this.createOrFocus();
            app.on('activate', () => this.createOrFocus());
        }).then();
        app.on('second-instance', () => this.createOrFocus());
    }

    private get() {
        return this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : undefined;
    }

    send<C extends IpcEventChannel>(channel: C, ...args: IpcEventArgs<C>) {
        const window = this.get();
        if (!window) return false;
        window.webContents.send(channel, ...args);
        return true;
    }

    private createOrFocus() {
        const existing = this.get();
        if (existing) {
            if (existing.isMinimized()) existing.restore();
            existing.focus();
            return existing;
        }

        const created = this.mainWindow = new BrowserWindow({
            width: 1024,
            height: 768,
            webPreferences: {
                preload: path.join(app.getAppPath(), 'app/preload.js')
            },
            icon: path.join(app.getAppPath(), iconPath),
            title: 'OscGoesBrrr v' + app.getVersion()
        });
        created.setMenuBarVisibility(false);
        created.loadFile(indexHtmlPath);
        created.on('closed', () => this.mainWindow = undefined);
        created.on('page-title-updated', e => e.preventDefault());
        created.webContents.setWindowOpenHandler(details => {
            shell.openExternal(details.url);
            return {action: 'deny'};
        });
        return created;
    }
}
