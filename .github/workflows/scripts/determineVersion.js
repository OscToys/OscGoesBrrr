import semver from 'semver';
import { spawn } from 'promisify-child-process';
import fs from "node:fs/promises";

console.error("Determining next version ...");
const tagPrefix = "release/";
const version = await getNextVersion();
console.log(version);
console.error(version);

console.error("Updating package.json ...");
const packageJson = await readJson('package.json');
packageJson.version = version;
await writeJson('package.json', packageJson);
console.error("Done");

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
async function readJson(file) {
    return JSON.parse(await fs.readFile(file, {encoding: 'utf-8'}));
}
async function writeJson(file, obj) {
    await fs.writeFile(file, JSON.stringify(obj, null, 2));
}
