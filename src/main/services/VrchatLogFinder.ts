import Path from "path";
import {app} from "electron";
import fs from "fs/promises";
import {Service} from "typedi";
import readline from "node:readline/promises";
import fsPlain from "fs";
import LoggerService from "./LoggerService";
import OgbConfigService from "./OgbConfigService";
import VdfParser from "vdf-parser";
import existsAsync from "../../common/existsAsync";

/** Finds and keeps track of the local VRChat OSCQ service address */
@Service()
export default class VrchatLogFinder {
    private readonly logger;

    constructor(
      logger: LoggerService,
      private readonly configMap: OgbConfigService
    ) {
        this.logger = logger.get(this.constructor.name);
        this.configMap = configMap;
    }

    private locatedVrcConfigDir: undefined | Promise<null | string>;
    private async getVrcConfigDir() {
        // if a config value is set, use that instead
        const configVrcConfigDir = this.configMap.get("vrcConfigDir");
        if(configVrcConfigDir) {
            return configVrcConfigDir;
        }

        if (this.locatedVrcConfigDir === undefined) {
            this.locatedVrcConfigDir = this.locateVrcConfigDir();
            const dir = await this.locatedVrcConfigDir;
            this.logger.log(`Located VRC Config directory at ${dir}`)
            return dir;
        } else {
            return await this.locatedVrcConfigDir;
        }
    }

    private async locateVrcConfigDir(): Promise<string | null> {
        if(process.platform == 'win32') {
            return Path.resolve(app.getPath('appData'), '../LocalLow/VRChat/VRChat')
        }

        if (process.platform == 'linux') {
            // on linux, the proton prefix depends on where steam is installed
            // and the drive that VRChat is installed
            const prefixPath = "steamapps/compatdata/438100/pfx/drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat";

            const home = app.getPath('home');
            const possibleSteamRoots = [
                Path.resolve(home, '.var/app/com.valvesoftware.Steam/.local/share/Steam'),
                Path.resolve(home, '.local/share/Steam'),
                Path.resolve(home, '.steam')
            ];

            for (const steamRoot of possibleSteamRoots) {
                if (!await existsAsync(steamRoot)) continue;

                const fallbackPath = Path.resolve(steamRoot, prefixPath);

                let libraryFolders;
                try {
                    libraryFolders = await fs.readFile(Path.resolve(steamRoot, 'steamapps/libraryfolders.vdf'), {encoding: "utf-8"});
                } catch(err) {
                    this.logger.log(`Couldn't access libraryfolders.vdf at Steam install ${steamRoot}, falling back to likely path ${fallbackPath}`);
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

                const vrcConfigPath = Path.resolve(targetLibrary.path, prefixPath);
                this.logger.log("VRChat install located at " + vrcConfigPath);
                return vrcConfigPath;
            }

            this.logger.log("Failed to find steam root directory");
            return null;
        }

        this.logger.log("VRChat install could not be located due to unknown platform: " + process.platform);
        return null;
    }


    public async getLatestLog() {
        const vrcConfigDir = await this.getVrcConfigDir();
        if (!vrcConfigDir) return undefined;

        const files = (await fs.readdir(vrcConfigDir))
            .filter(name => name.startsWith("output_log"));
        files.sort();
        files.reverse();
        const newestConfig = files[0];
        if (!newestConfig) {
            this.logger.log(`Config dir did not contain an output_log`);
            return undefined;
        }
        const configPath = Path.resolve(vrcConfigDir, newestConfig);
        this.logger.log(`Found output_log at ${configPath}`);
        return configPath;
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
