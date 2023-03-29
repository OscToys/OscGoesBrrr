import fs from 'node:fs/promises';

const version = process.argv[2];
const url = process.argv[3];
console.log(`Next version: ${version}`);
console.log(`Next URL: ${url}`);

console.log('Updating version manifest ...');
const versionJson = await readJson('updates.json');
versionJson.latestVersion = version;
versionJson.latestInstaller = url;
await writeJson('updates.json', versionJson);

// ---

async function readJson(file) {
    return JSON.parse(await fs.readFile(file, {encoding: 'utf-8'}));
}
async function writeJson(file, obj) {
    await fs.writeFile(file, JSON.stringify(obj, null, 2));
}
