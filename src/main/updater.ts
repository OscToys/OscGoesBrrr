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
import tmpPromise from 'tmp-promise';

const UpdatesJsonSchema = t.type({
    latestVersion: t.string,
    latestInstaller: t.string,
});

export default class Updater {
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
        console.log("Checking for updates ...");

        let myversion = app.getVersion();
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

        console.log("Downloading update ...");
        const localPath = await tmpPromise.tmpName({
            prefix: "OGB-update-",
            postfix: ".exe"
        });
        await stream.pipeline(got.stream(exe), createWriteStream(localPath));
        console.log("Downloaded");

        console.log("Running updater ...");
        child_process.spawn(localPath, { cwd: exeDir, detached: true, stdio: 'ignore' });
    }
}
