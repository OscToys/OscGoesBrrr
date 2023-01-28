import {app} from 'electron';
import Path from 'path';
import fs from 'fs/promises';
import existsAsync from "../common/existsAsync";

const oscDir = Path.resolve(app.getPath('appData'), '../LocalLow/VRChat/VRChat/OSC');
const bakDir = Path.resolve(oscDir, '../OSC.bak');
const oldBakDir = Path.resolve(oscDir, 'bak');

export default class OscConfigDeleter {
    log;
    configMap;
    constructor(logger: (...args: unknown[]) => void, configMap: Map<string,string>) {
        this.log = logger;
        this.configMap = configMap;
        setInterval(() => this.check(), 10*1000);
    }

    async check() {
        try {
            if (await existsAsync(oldBakDir) && !(await existsAsync(bakDir))) {
                await fs.rename(oldBakDir, bakDir);
            }
        } catch(e) {
            this.log(e instanceof Error ? e.stack : e);
        }
        try {
            const skip = this.configMap.get('keepOscConfigs');
            if (skip == '1' || skip == 'true') return;
            //this.log("Scanning " + oscDir);
            let exists = await existsAsync(oscDir);
            if (!exists) return;
            await this.checkDir(oscDir);
        } catch(e) {
            this.log(e instanceof Error ? e.stack : e);
        }
    }

    async checkDir(dir: string) {
        for (const entry of await fs.readdir(dir, {withFileTypes:true})) {
            const fullPath = Path.resolve(dir, entry.name);
            if (entry.isDirectory()) {
                await this.checkDir(fullPath);
            } else if (entry.isFile() && entry.name.endsWith(".json")
                // https://gitlab.com/VRCFury/OscGoesBrrr/-/issues/3
                && !fullPath.includes("VOR")
            ) {
                await this.backupAndDelete(fullPath);
            }
        }
    }

    async backupAndDelete(path: string) {
        this.log("Removing OSC file:", path);
        const filename = Path.basename(path);
        const stat = await fs.stat(path);
        const existingBackup = await this.findBackup(filename, stat.size);
        if (existingBackup) {
            this.log("Backup already exists at: " + existingBackup);
            await fs.rm(path);
        } else {
            await fs.mkdir(bakDir, {recursive: true});
            for (let i = 0;;i++) {
                const bakPath = Path.resolve(bakDir, filename + '.' + i);
                if (!await existsAsync(bakPath)) {
                    this.log("Backing up to: " + bakPath);
                    await fs.rename(path, bakPath);
                    break;
                }
            }
        }
    }

    async findBackup(filename: string, size: number) {
        if (!await existsAsync(bakDir)) return undefined;
        for (const file of await fs.readdir(bakDir, {withFileTypes:true})) {
            const bakFile = Path.resolve(bakDir, file.name);
            if (file.isFile() && bakFile.includes(filename)) {
                const bakFileState = await fs.stat(bakFile);
                if (bakFileState.size == size) {
                    return bakFile;
                }
            }
        }
        return undefined;
    }
}
