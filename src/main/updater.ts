import { dialog, app } from 'electron';
import fs from 'fs/promises';
import path from "path";
import { createWriteStream, existsSync } from "fs";
import child_process from 'child_process';
import got from 'got';
import semver from 'semver';
import stream from 'stream/promises';
import decodeType, {t} from "../common/decodeType";
import { readFileSync } from "fs";
import existsAsync from "../common/existsAsync";
// @ts-ignore
import versionPath from "./version.txt";

const UpdatesJsonSchema = t.type({
    latestVersion: t.string,
    latestInstaller: t.string,
});

export default class Updater {
    async deleteOldUpdateFiles() {
        const exeDir = path.dirname(app.getPath("exe"));
        if (!exeDir) return;
        if (await existsAsync(path.join(exeDir, 'update.bat'))) {
            await fs.rm(path.join(exeDir, 'update.bat'));
        }
        if (await existsAsync(path.join(exeDir, 'update.asar'))) {
            await fs.rm(path.join(exeDir, 'update.asar'));
        }
        if (await existsAsync(path.join(exeDir, 'update.exe'))) {
            await fs.rm(path.join(exeDir, 'update.exe'));
        }
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
    _myVersion?: string;
    getLocalVersion() {
        if (this._myVersion !== undefined) {
            return this._myVersion;
        }
        let myversion = readFileSync(path.join(app.getAppPath(), versionPath), {encoding: 'utf-8'});
        if (!myversion) myversion = '';
        myversion = myversion.trim();
        console.log("Local version is " + myversion);
        this._myVersion = myversion;
        return myversion;
    }
    async checkAndNotifyUnsafe() {
        await this.deleteOldUpdateFiles();

        console.log("Checking for updates ...");

        let myversion = this.getLocalVersion();
        if (!myversion) throw new Error('Failed to load local version file');

        const updatesJson = await got('https://updates.osc.toys/updates.json').json() as unknown;
        const updates = decodeType(updatesJson, UpdatesJsonSchema);
        console.log("Autoupdate version is " + updates.latestVersion);

        if (semver.gte(myversion, updates.latestVersion, { loose: true })) {
            console.log("Autoupdate doesn't need to do anything, app already up to date");
            return;
        }

        const exe = updates.latestInstaller;

        if (!app.isPackaged) throw new Error('App is not packaged');

        const exeDir = path.dirname(app.getPath("exe"));
        if (!exeDir) throw new Error('Failed to find exe dir');
        console.log('Autoupdater exe dir is ' + exeDir);

        const resp = await dialog.showMessageBox({
            title: 'Update',
            message: `Version ${updates.latestVersion} is available`,
            buttons: ['Install', 'Skip'],
            cancelId: 1
        });
        if (resp.response !== 0) return;

        await this.deleteOldUpdateFiles();

        console.log("Downloading update ...");
        const localPath = path.join(exeDir, 'update.exe');
        await stream.pipeline(got.stream(exe), createWriteStream(localPath));
        console.log("Downloaded");

        console.log("Running updater ...");
        child_process.spawn(localPath, { cwd: exeDir, detached: true, stdio: 'ignore' });
    }
}
