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

const GitlabRelease = t.type({
    description: t.string,
    assets: t.type({
        links: t.array(t.type({
            name: t.string,
            url: t.string
        }))
    })
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

        const releaseJson = await got('https://gitlab.com/api/v4/projects/vrcfury%2foscgoesbrrr/releases/autoupdater').json() as unknown;
        const release = decodeType(releaseJson, GitlabRelease);
        const desc = release.description;
        let version;
        for (let line of desc.split('\n')) {
            line = line.trim();
            if (line.startsWith('version=')) {
                version = line.substring(8).trim();
            }
        }
        if (!version) throw new Error("Failed to find version in description");
        console.log("Autoupdate version is " + version);

        if (semver.gte(myversion, version, { loose: true })) {
            console.log("Autoupdate doesn't need to do anything, app already up to date");
            return;
        }

        let asar, exe;
        for (const link of release.assets.links) {
            if (link.name === 'asar') asar = link.url;
            if (link.name === 'exe') exe = link.url;
        }

        if (!app.isPackaged) throw new Error('App is not packaged');

        const exeDir = path.dirname(app.getPath("exe"));
        if (!exeDir) throw new Error('Failed to find exe dir');
        console.log('Autoupdater exe dir is ' + exeDir);

        if (!asar && !exe) {
            dialog.showMessageBoxSync({
                title: 'Update',
                message: `Version ${version} is available - please install from the OscGoesBrrr website`,
            });
            return;
        }

        const resp = await dialog.showMessageBox({
            title: 'Update',
            message: `Version ${version} is available`,
            buttons: ['Install', 'Skip'],
            cancelId: 1
        });
        if (resp.response !== 0) return;

        await this.deleteOldUpdateFiles();

        if (asar) {
            await stream.pipeline(got.stream(asar), createWriteStream(path.join(exeDir, 'update.asa')));
        } else if (exe) {
            await stream.pipeline(got.stream(exe), createWriteStream(path.join(exeDir, 'update.exe')));
        }

        console.log("Writing update.bat");
        const batContent = `
taskkill /f /im osc-goes-brrr.exe
timeout /T 1 /NOBREAK
if exist update.exe (
  start update.exe
)
if exist update.asa (
  del /f /q /a resources\\app.asar
  move update.asa resources
  ren resources\\update.asa app.asar
  start osc-goes-brrr.exe
)
`;
        await fs.writeFile(path.join(exeDir, 'update.bat'), batContent);

        console.log("Running update.bat");
        child_process.spawn(path.join(exeDir, 'update.bat'), { cwd: exeDir, detached: true, stdio: 'ignore' });
    }
}
