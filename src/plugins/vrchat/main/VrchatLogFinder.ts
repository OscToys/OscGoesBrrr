import Path from "path";
import {app} from "electron";
import fs from "fs/promises";
import {Service} from "typedi";
import readline from "node:readline/promises";
import fsPlain from "fs";
import LoggerService from "../../../main/services/LoggerService";
import ConfigService from "../../../main/services/ConfigService";
import VdfParser from "vdf-parser";
import typia from "typia";
import {getSettings} from '../shared/config';

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

    private locatedVrcConfigDir: undefined | Promise<string[]>;
    private async getVrcConfigDir() {
        // if a config value is set, use that instead
        const configVrcConfigDir = getSettings(await this.configService.get()).vrcConfigDir;
        if(configVrcConfigDir) {
            return [configVrcConfigDir];
        }

        if (this.locatedVrcConfigDir === undefined) {
            this.locatedVrcConfigDir = this.locateVrcConfigDir();
            const dirs = await this.locatedVrcConfigDir;
            if (dirs.length > 0) this.logger.log(`Located VRC Config directories at ${dirs.join(', ')}`)
            else this.locatedVrcConfigDir = undefined;
            return dirs;
        } else {
            const dirs = await this.locatedVrcConfigDir;
            if (dirs.length === 0) this.locatedVrcConfigDir = undefined;
            return dirs;
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

    private async trySteamRoot(steamRoot: string, prefixPath: string): Promise<string[]> {
        const candidates = new Set<string>();
        const libraryFoldersPath = Path.resolve(steamRoot, 'steamapps/libraryfolders.vdf');
        try {
            this.logger.log(`Trying ${libraryFoldersPath}...`);
            const libraryFolders = await fs.readFile(libraryFoldersPath, {encoding: "utf-8"});
            const libraryFoldersParsed = typia.assert<SteamLibraryFolders>(VdfParser.parse(libraryFolders, { types: false, arrayify: true }));
            const libraries = Object.values(libraryFoldersParsed.libraryfolders);
            const targetLibraries = libraries.filter((library) => Object.keys(library.apps).includes("438100"));
            if (targetLibraries.length > 0) {
                for (const library of targetLibraries) {
                    candidates.add(Path.resolve(library.path, prefixPath));
                }
            } else {
                this.logger.log(`VRChat not found in ${libraryFoldersPath}`);
            }
        } catch {
            this.logger.log(`Couldn't access ${libraryFoldersPath}`);
        }

        candidates.add(Path.resolve(steamRoot, prefixPath));
        const found = await Promise.all([...candidates].map(candidate => this.tryLocateVrcPath(candidate)));
        return found.filter((candidate): candidate is string => candidate !== undefined);
    }

    private async locateVrcConfigDir(): Promise<string[]> {
        const dirs: string[] = [];
        if(process.platform == 'win32') {
            const path = Path.resolve(app.getPath('appData'), '../LocalLow/VRChat/VRChat');
            const found = await this.tryLocateVrcPath(path);
            if (found) dirs.push(found);
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
                dirs.push(...await this.trySteamRoot(steamRoot, prefixPath));
            }
        }

        if (dirs.length === 0) this.logger.log("Failed to find VRChat at any attemped paths");
        return [...new Set(dirs)];
    }

    public async getLatestLog() {
        const vrcConfigDirs = await this.getVrcConfigDir();
        const logs: {path: string; modified: number}[] = [];
        for (const vrcConfigDir of vrcConfigDirs) {
            try {
                const files = (await fs.readdir(vrcConfigDir)).filter(name => name.startsWith("output_log"));
                for (const file of files) {
                    const path = Path.resolve(vrcConfigDir, file);
                    const stat = await fs.stat(path);
                    if (stat.isFile()) logs.push({path, modified: stat.mtimeMs});
                }
            } catch(e) {
                this.logger.log(`Failed to read VRC config dir ${vrcConfigDir}: ${e}`);
            }
        }

        const newestLog = logs.reduce<{path: string; modified: number} | undefined>(
            (newest, log) => !newest || log.modified > newest.modified ? log : newest,
            undefined,
        );
        if (!newestLog) {
            this.logger.log(`Config directories did not contain an output_log`);
            return undefined;
        }
        this.logger.log(`Found output_log at ${newestLog.path}`);
        return newestLog.path;
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
