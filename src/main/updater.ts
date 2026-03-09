import { dialog, app } from 'electron';
import { createWriteStream } from "fs";
import child_process from 'child_process';
import got from 'got';
import semver from 'semver';
import stream from 'stream/promises';
import tmpPromise from 'tmp-promise';
import typia from "typia";
import {Service} from "typedi";
import {getPortableExecutablePath} from "./portableData";

interface UpdatesJsonSchema {
    latestVersion: string;
    latestInstaller?: string;
    downloadUrls?: {
        windowsSetup?: string;
        windowsPortable?: string;
    };
}

@Service()
export default class Updater {
    constructor() {
        void this.checkAndNotify();
    }

    async checkAndNotify(notifyOnFailure = false) {
        try {
            await this.checkAndNotifyUnsafe();
        } catch(e) {
            console.log("Update failed", e);
            if (notifyOnFailure) {
                dialog.showErrorBox('Updated failed', e instanceof Error ? e.stack+"" : e+"");
            }
        }
    }
    async checkAndNotifyUnsafe() {
        if (process.platform !== 'win32') {
            console.log("Not checking for updates, not on windows");
            return;
        }

        console.log("Checking for updates ...");

        let myversion = app.getVersion();
        if (!myversion) throw new Error('Failed to load local version file');

        const updatesJson = await got('https://updates.osc.toys/updates.json').json() as unknown;
        const updates = typia.assert<UpdatesJsonSchema>(updatesJson);
        console.log("Autoupdate version is " + updates.latestVersion);

        if (semver.gte(myversion, updates.latestVersion, { loose: true })) {
            console.log("Autoupdate doesn't need to do anything, app already up to date");
            return;
        }

        if (!app.isPackaged) throw new Error('App is not packaged');

        const portableExecutablePath = getPortableExecutablePath();
        const isPortableMode = portableExecutablePath !== undefined;
        const downloadUrl = isPortableMode
            ? updates.downloadUrls?.windowsPortable
            : updates.downloadUrls?.windowsSetup ?? updates.latestInstaller;
        if (!downloadUrl) throw new Error(isPortableMode
            ? "No portable update URL available in updates manifest"
            : "No installer URL available in updates manifest");

        const resp = await dialog.showMessageBox({
            title: 'Update',
            message: `Version ${updates.latestVersion} is available`,
            buttons: ['Install', 'Skip'],
            cancelId: 1
        });
        if (resp.response !== 0) return;

        console.log("Downloading update ...");
        const localPath = await tmpPromise.tmpName({
            prefix: "OGB-update-",
            postfix: ".exe"
        });
        await stream.pipeline(got.stream(downloadUrl), createWriteStream(localPath));
        console.log("Downloaded");

        console.log("Running updater ...");
        if (isPortableMode) {
            launchPortableSwapAndRelaunch(localPath, portableExecutablePath);
        } else {
            child_process.spawn(localPath, { detached: true, stdio: 'ignore' });
        }
        app.exit(0);
    }
}

function launchPortableSwapAndRelaunch(stagedExePath: string, portableExecutablePath: string | undefined): void {
    if (!portableExecutablePath) {
        throw new Error("Portable mode requires PORTABLE_EXECUTABLE_DIR and PORTABLE_EXECUTABLE_FILE");
    }

    const staged = escapeForCmdSet(stagedExePath);
    const current = escapeForCmdSet(portableExecutablePath);
    const command = [
        `set "SRC=${staged}"`,
        `set "DST=${current}"`,
        // Retry swap while the old process is still shutting down.
        `for /l %i in (1,1,30) do (@move /y "%SRC%" "%DST%" >nul 2>&1 && goto launch || timeout /t 1 /nobreak >nul)`,
        "exit /b 1",
        ":launch",
        `start "" "%DST%"`,
    ].join(" & ");

    const updater = child_process.spawn("cmd.exe", ["/d", "/s", "/c", command], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
    });
    updater.unref();
}

function escapeForCmdSet(value: string): string {
    return value.replace(/%/g, "%%").replace(/"/g, '""');
}
