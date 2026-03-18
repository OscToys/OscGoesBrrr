import Path from "path";
import {app} from "electron";
import fs from "fs/promises";
import {Service} from "typedi";
import readline from "node:readline/promises";
import fsPlain from "fs";
import LoggerService from "./LoggerService";
import ConfigService from "./ConfigService";
import VdfParser from "vdf-parser";
import typia from "typia";

interface SteamLibraryFolders {
    libraryfolders: {
        [index: string]: {
            path: string;
            apps: {
                [index: string]: string;
            };
        }
    }
}

/** Finds and keeps track of the local VRChat OSCQ service address */
@Service()
export default class VrchatLogFinder {
    private readonly logger;

    constructor(
      logger: LoggerService,
      private readonly configService: ConfigService
    ) {
        this.logger = logger.get(this.constructor.name);
    }

    private locatedVrcConfigDir: undefined | Promise<string | undefined>;
    private async getVrcConfigDir() {
        // if a config value is set, use that instead
        const configVrcConfigDir = (await this.configService.get()).vrcConfigDir;
        if(configVrcConfigDir) {
            return configVrcConfigDir;
        }

        if (this.locatedVrcConfigDir === undefined) {
            this.locatedVrcConfigDir = this.locateVrcConfigDir();
            const dir = await this.locatedVrcConfigDir;
            if (dir) this.logger.log(`Located VRC Config directory at ${dir}`)
            else this.locatedVrcConfigDir = undefined;
            return dir;
        } else {
            const dir = await this.locatedVrcConfigDir;
            if (!dir) this.locatedVrcConfigDir = undefined;
            return dir;
        }
    }

    public async getDetectedVrcConfigDir() {
        return await this.getVrcConfigDir();
    }

    private async tryLocateVrcPath(path: string): Promise<string | undefined> {
        try {
            this.logger.log(`Trying ${path}...`);
            await fs.access(path);
            this.logger.log(`Found VRChat at ${path}`);
            return path;
        } catch {
            this.logger.log(`Couldn't access ${path}`);
            return undefined;
        }
    }

    private async trySteamRoot(steamRoot: string, prefixPath: string): Promise<string | undefined> {
        let candidateFromLibraryFolders: string | undefined;
        const libraryFoldersPath = Path.resolve(steamRoot, 'steamapps/libraryfolders.vdf');
        try {
            this.logger.log(`Trying ${libraryFoldersPath}...`);
            const libraryFolders = await fs.readFile(libraryFoldersPath, {encoding: "utf-8"});
            const libraryFoldersParsed = typia.assert<SteamLibraryFolders>(VdfParser.parse(libraryFolders, { types: false, arrayify: true }));
            const libraries = Object.values(libraryFoldersParsed.libraryfolders);
            const targetLibrary = libraries.find((l) => Object.keys(l.apps).includes("438100"));
            if (targetLibrary) {
                candidateFromLibraryFolders = Path.resolve(targetLibrary.path, prefixPath);
                const found = await this.tryLocateVrcPath(candidateFromLibraryFolders);
                if (found) return found;
            } else {
                this.logger.log(`VRChat not found in ${libraryFoldersPath}`);
            }
        } catch {
            this.logger.log(`Couldn't access ${libraryFoldersPath}`);
        }

        const fallbackPath = Path.resolve(steamRoot, prefixPath);
        return await this.tryLocateVrcPath(fallbackPath);
    }

    private async locateVrcConfigDir(): Promise<string | undefined> {
        if(process.platform == 'win32') {
            const path = Path.resolve(app.getPath('appData'), '../LocalLow/VRChat/VRChat');
            const found = await this.tryLocateVrcPath(path);
            if (found) return found;
        }

        if (process.platform == 'linux') {
            // on linux, the proton prefix depends on where steam is installed
            // and the drive that VRChat is installed
            const prefixPath = "steamapps/compatdata/438100/pfx/drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat";

            const home = app.getPath('home');
            const possibleSteamRoots = [
                Path.resolve(home, '.var/app/com.valvesoftware.Steam/.local/share/Steam'),
                Path.resolve(home, '.local/share/Steam'),
                Path.resolve(home, '.steam/steam')
            ];

            for (const steamRoot of possibleSteamRoots) {
                const found = await this.trySteamRoot(steamRoot, prefixPath);
                if (found) return found;
            }
        }

        this.logger.log("Failed to find VRChat at any attemped paths");
        return undefined;
    }

    public async getLatestLog() {
        const vrcConfigDir = await this.getVrcConfigDir();
        if (!vrcConfigDir) return undefined;

        let files;
        try {
            files = (await fs.readdir(vrcConfigDir))
                .filter(name => name.startsWith("output_log"));
        } catch(e) {
            this.logger.log(`Failed to read VRC config dir ${vrcConfigDir}: ${e}`);
            return undefined;
        }

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
