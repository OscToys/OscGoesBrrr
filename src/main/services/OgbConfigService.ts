import {Config} from "../../common/configTypes";
import path from "path";
import {app, ipcMain} from "electron";
import fsPlain from "fs";
import {Service} from "typedi";

@Service()
export default class OgbConfigService {
    private config = Config.parse({});

    constructor() {
        const savePath = path.join(app.getPath('appData'), 'OscGoesBrrr', 'config.txt');
        const savePathJson = path.join(app.getPath('appData'), 'OscGoesBrrr', 'config.json');

        if (fsPlain.existsSync(savePathJson)) {
            const rawJson = fsPlain.readFileSync(savePathJson, {encoding: 'utf-8'});
            const json = JSON.parse(rawJson);
            const parsedJson = Config.parse(json);
            this.set(parsedJson);
        }

        ipcMain.handle('config:get', (_event) => {
            return this.config;
        });
        ipcMain.handle('config:set', (_event, data) => {
            this.config = Config.parse(data);
        });
    }

    set(config: Config) {
        this.config = config;
    }

    get() {
        return this.config;
    }
}
