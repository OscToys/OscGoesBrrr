import fs from 'node:fs/promises';
import { spawn } from 'promisify-child-process';

const version = process.argv[2];
console.log(`Next version: ${version}`);

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
