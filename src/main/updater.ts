import { app } from 'electron';
import { createWriteStream } from "fs";
import child_process from 'child_process';
import got from 'got';
import semver from 'semver';
import stream from 'stream/promises';
import tmpPromise from 'tmp-promise';
import typia from "typia";
import {Service} from "typedi";
import {getPortableExecutablePath} from "./portableData";
import {handleIpc} from "./ipc";

interface UpdatesJsonSchema {
    latestVersion: string;
    downloadUrls?: {
        generic?: string;
        windowsSetup?: string;
        windowsPortable?: string;
    };
}

interface AvailableUpdateInfo {
    version?: string;
    downloadUrl?: string;
    status: 'downloading' | 'installIpc' | 'download' | 'error';
}

@Service()
export default class Updater {
    private availableUpdate?: AvailableUpdateInfo;
    private pendingInstallAction?: () => void;

    constructor() {
        handleIpc('updater:install', async () => {
            await this.installAvailableUpdate();
        });
        void this.checkAndNotify();
    }

    getAvailableUpdate() {
        return this.availableUpdate;
    }

    async checkAndNotify() {
        try {
            await this.checkAndNotifyUnsafe();
        } catch(e) {
            console.log("Update failed", e);
            this.availableUpdate = {
                status: 'error',
            };
        }
    }
    async checkAndNotifyUnsafe() {
        console.log("Checking for updates ...");

        const myversion = app.getVersion();

        const updatesJson = await got('https://updates.osc.toys/updates.json').json() as unknown;
        const updates = typia.assert<UpdatesJsonSchema>(updatesJson);
        console.log("Autoupdate version is " + updates.latestVersion);

        if (semver.gte(myversion, updates.latestVersion, { loose: true })) {
            this.availableUpdate = undefined;
            this.pendingInstallAction = undefined;
            console.log("Autoupdate doesn't need to do anything, app already up to date");
            return;
        }

        if (!app.isPackaged) {
            this.availableUpdate = undefined;
            this.pendingInstallAction = undefined;
            console.log("Update available, but app is in dev mode and unpackaged");
            return;
        }

        this.availableUpdate = {
            version: updates.latestVersion,
            downloadUrl: updates.downloadUrls?.generic,
            status: 'download',
        };

        if (process.platform === 'win32') {
            this.availableUpdate = {
                version: updates.latestVersion,
                downloadUrl: updates.downloadUrls?.generic,
                status: 'downloading',
            };

            void (async () => {
                const portableExecutablePath = getPortableExecutablePath();
                const isPortableMode = portableExecutablePath !== undefined;
                const downloadUrl = isPortableMode
                    ? updates.downloadUrls?.windowsPortable
                    : updates.downloadUrls?.windowsSetup;
                if (!downloadUrl) throw new Error(isPortableMode
                    ? "No portable update URL available in updates manifest"
                    : "No installer URL available in updates manifest");

                console.log("Downloading update in background ...");
                const localPath = await tmpPromise.tmpName({
                    prefix: "OGB-update-",
                    postfix: ".exe"
                });
                await stream.pipeline(got.stream(downloadUrl), createWriteStream(localPath));
                console.log("Background update download complete");

                this.pendingInstallAction = () => {
                    console.log("Running updater ...");
                    if (isPortableMode) {
                        launchPortableSwapAndRelaunch(localPath, portableExecutablePath);
                    } else {
                        child_process.spawn(localPath, { detached: true, stdio: 'ignore' });
                    }
                    app.exit(0);
                };
                this.availableUpdate = {
                    version: updates.latestVersion,
                    downloadUrl: updates.downloadUrls?.generic,
                    status: 'installIpc',
                };
            })().catch((error) => {
                console.log("Background update preparation failed", error);
                this.availableUpdate = {
                    version: updates.latestVersion,
                    downloadUrl: updates.downloadUrls?.generic,
                    status: 'download',
                };
                this.pendingInstallAction = undefined;
            });
        }
    }

    async installAvailableUpdate() {
        if (!this.pendingInstallAction) {
            throw new Error("Update is not ready to install yet");
        }
        this.pendingInstallAction();
    }
}

function launchPortableSwapAndRelaunch(stagedExePath: string, portableExecutablePath: string | undefined): void {
    if (!portableExecutablePath) {
        throw new Error("Portable mode requires PORTABLE_EXECUTABLE_DIR and PORTABLE_EXECUTABLE_FILE");
    }

    // Using cmd.exe by itself is error prone because the quoting behaviour is so bad
    // Using powershell directly doesn't work for some reason when detached: true
    // So... we use cmd.exe to run powershell.exe :shrug:
    const script = "for($i=0;$i -lt 30;$i++){try{Move-Item -LiteralPath $env:OGB_SRC -Destination $env:OGB_DST -Force -ErrorAction Stop; Start-Sleep -Seconds 1; Start-Process -FilePath $env:OGB_DST; exit 0}catch{Start-Sleep -Seconds 1}}; exit 1";
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const command = `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${encoded}`;
    const updater = child_process.spawn(
        "cmd.exe",
        ["/d", "/c", command],
        {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
            env: {
                ...process.env,
                OGB_SRC: stagedExePath,
                OGB_DST: portableExecutablePath,
            },
        }
    );
    updater.unref();
}
