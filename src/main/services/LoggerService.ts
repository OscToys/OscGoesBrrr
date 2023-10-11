import {ipcMain} from "electron";
import util from "util";
import {Service} from "typedi";
import MainWindowService from "./MainWindowService";

export class SubLogger {
    constructor(
        private prefix: string,
        private logger: LoggerService
    ) {}

    log(...args: unknown[]) {
        this.logger.log(this.prefix, ...args);
    }
}

@Service()
export default class LoggerService {
    private readonly history: string[] = [];
    constructor(
        private mainWindowService: MainWindowService
    ) {
        ipcMain.handle('log:history', async(_event, text) => {
            return this.history;
        });
    }

    get(prefix: string) {
        return new SubLogger(prefix, this);
    }

    log(prefix: string, ...args: unknown[]) {
        console.log(`[${prefix}]`, ...args);
        const mainWindow = this.mainWindowService!.get();

        const lines = util.format(...args);
        for (const line of lines.split('\n')) {
            this.history.push(line);
            mainWindow?.webContents.send(`log:line`, line);
        }
        while (this.history.length > 1000) {
            this.history.shift();
        }
    }
}
