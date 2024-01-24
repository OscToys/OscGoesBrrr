import Path from "path";
import {app} from "electron";
import fs from "fs/promises";
import path from "path";
import {Service} from "typedi";
import readline from "node:readline/promises";
import fsPlain from "fs";

/** Finds and keeps track of the local VRChat OSCQ service address */
@Service()
export default class VrchatLogFinder {
    private static readonly logDir = process.platform == 'win32' ? Path.resolve(app.getPath('appData'), '../LocalLow/VRChat/VRChat') : Path.resolve(app.getPath('home'), '.local/share/Steam/steamapps/compatdata/438100/pfx/drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat/');

    public async getLatestLog() {
        const files = await fs.readdir(VrchatLogFinder.logDir);
        files.sort();
        files.reverse();
        const newestConfig = files
            .filter(name => name.startsWith("output_log"))
            [0];
        if (!newestConfig) {
            return undefined;
        }
        return path.join(VrchatLogFinder.logDir, newestConfig);
    }

    public async forEachLine(each: (line:string)=>void) {
        const filename = await this.getLatestLog();
        if (!filename) return;
        const input = fsPlain.createReadStream(filename);
        try {
            const lineReader = readline.createInterface({input: input});
            for await (const line of lineReader) {
                each(line);
            }
        } finally {
            input.close();
        }
    }
}
