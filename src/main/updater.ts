import { dialog, app } from 'electron';
import { createWriteStream } from "fs";
import child_process from 'child_process';
import got from 'got';
import semver from 'semver';
import stream from 'stream/promises';
// @ts-ignore
import versionPath from "./version.txt";
import tmpPromise from 'tmp-promise';
import typia from "typia";
import {Service} from "typedi";

interface UpdatesJsonSchema {
    latestVersion: string;
    latestInstaller: string;
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

        const exe = updates.latestInstaller;

        if (!app.isPackaged) throw new Error('App is not packaged');

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
        child_process.spawn(localPath, { detached: true, stdio: 'ignore' });
        app.exit(0);
    }
}
