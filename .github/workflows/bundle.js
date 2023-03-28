import fs from 'node:fs/promises';
import semver from 'semver';
import { spawn } from 'promisify-child-process';

const tagPrefix = "release/";
const version = await getNextVersion();
const tagName = `${tagPrefix}${version}`

console.log(`Next version: ${version}`);

console.log('Updating package.json ...');
const packageJson = await readJson('package.json');
packageJson.version = version;
await writeJson('package.json', packageJson);

console.log('Building distributable ...');
await spawn('/bin/bash', ['.github/workflows/build.sh'], { stdio: "inherit" });

console.log('Creating github release ...');
await spawn('gh', [
    'release',
    'create',
    tagName,
    'dist/OscGoesBrrr-setup.exe',
    '--target', process.env.GITHUB_SHA,
    '--title', `Release ${version}`
], { stdio: "inherit" });

console.log('Updating version manifest ...');
const versionJson = await readJson('../versions/updates.json');
versionJson.latestVersion = version;
versionJson.latestInstaller = `https://github.com/OscToys/OscGoesBrrr/releases/download/${encodeURIComponent(tagName)}/${encodeURIComponent('OscGoesBrrr-setup.exe')}`;
await writeJson('../versions/updates.json', versionJson);






// ---

function checkFileExists(file) {
    return fs.access(file, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false)
}

async function readJson(file) {
    return JSON.parse(await fs.readFile(file, {encoding: 'utf-8'}));
}
async function writeJson(file, obj) {
    await fs.writeFile(file, JSON.stringify(obj, null, 2));
}
async function rmdir(path) {
    if (await checkFileExists(path)) {
        await fs.rm(path, {recursive: true});
    }
}
async function createTar(dir, outputFilename) {
    await tar.create({
        gzip: true,
        cwd: dir,
        file: outputFilename,
        portable: true,
        noMtime: true,
        prefix: 'package/'
    }, await fs.readdir(dir));
}

async function getTags() {
    const { stdout, stderr } = await spawn('git', ['ls-remote', '--tags', 'origin'], {encoding: 'utf8'});
    return (stdout+'')
        .split('\n')
        .filter(line => line.includes("refs/tags/"))
        .map(line => line.substring(line.indexOf('refs/tags/') + 10).trim())
        .filter(line => line !== "");
}
async function getNextVersion() {
    const allTags = await getTags();
    const versions = allTags
        .filter(tag => tag.startsWith(tagPrefix))
        .map(tag => tag.substring(tagPrefix.length));
    const maxVersion = semver.maxSatisfying(versions, '*');
    if (!maxVersion) return '1.0.0';
    return semver.inc(maxVersion, 'minor');
}
