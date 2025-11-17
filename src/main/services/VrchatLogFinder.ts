import Path from "path";
import {app} from "electron";
import fs from "fs/promises";
import path from "path";
import {Service} from "typedi";
import readline from "node:readline/promises";
import fsPlain from "fs";
import LoggerService from "./LoggerService";
import OgbConfigService from "./OgbConfigService";
import VdfParser from "vdf-parser";

/** Finds and keeps track of the local VRChat OSCQ service address */
@Service()
export default class VrchatLogFinder {
    private readonly logger;
    private configMap: OgbConfigService;
    private fetchedLogDir: string = "";

    constructor(
      logger: LoggerService,
      configMap: OgbConfigService
    ) {
        this.logger = logger.get("LogFinder");
        this.configMap = configMap;
        this.fetchedLogDir = this.fetchLogDir();
    }

    private get logDir() {
        // if a config value is set, use that instead
        if(this.configMap.has("logpath")) {
            return Path.resolve(this.configMap.get("logpath")!);
        }

        return this.fetchedLogDir;
    }

    private fetchLogDir() {
        if(process.platform == 'win32') {
            return Path.resolve(app.getPath('appData'), '../LocalLow/VRChat/VRChat')
        } else {
            // on linux, the proton prefix depends on where steam is installed
            // and the drive that VRChat is installed
            const prefixPath = "steamapps/compatdata/438100/pfx/drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat/";
            const fallbackPath = Path.resolve(app.getPath('home'), '.local/share/Steam/', prefixPath);

            // flatpak steam is installed somewhere else
            let basePath;
            try {
                fsPlain.accessSync(Path.resolve(app.getPath('home'), ".var/app/com.valvesoftware.Steam"), fsPlain.constants.F_OK);
                this.logger.log("Flatpak Steam installation detected");
                basePath = Path.join(app.getPath('home'), '.var/app/com.valvesoftware.Steam/.local/share/Steam/');
            } catch {
                basePath = Path.join(app.getPath('home'), '.local/share/Steam/');
            }

            // scan libraryfolders.vdf to find which Steam library has VRChat
            let libraryFolders;
            try {
                libraryFolders = fsPlain.readFileSync(Path.join(basePath, 'steamapps/libraryfolders.vdf'), {encoding: "utf-8"});
            } catch(err) {
                this.logger.log(`Couldn't access libraryfolders.vdf at Steam install ${basePath.toString()}, falling back to likely path`);
                return fallbackPath;
            }

            const libraryFoldersParsed = VdfParser.parse<{
                libraryfolders: {
                    [index: string]: {
                        path: string;
                        apps: {
                          [index: string]: string;
                        };
                    }
                }
            }>(libraryFolders);
            const libraries = Object.values(libraryFoldersParsed.libraryfolders);
            const targetLibrary = libraries.find((l) => Object.keys(l.apps).includes("438100"));

            if(!targetLibrary) {
                this.logger.log("VRChat not found in any Steam libraries, falling back to likely path");
                return fallbackPath;
            }

            const vrcPath = path.join(targetLibrary.path, prefixPath);
            this.logger.log("VRChat install located at " + vrcPath.toString());

            return vrcPath;
        }
    }


    public async getLatestLog() {
        const files = await fs.readdir(this.logDir);
        files.sort();
        files.reverse();
        const newestConfig = files
            .filter(name => name.startsWith("output_log"))
            [0];
        if (!newestConfig) {
            return undefined;
        }
        return path.join(this.logDir, newestConfig);
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
