import {execFile as execFileCallback} from "node:child_process";
import {promisify} from "node:util";
import semver from "semver";

const execFile = promisify(execFileCallback);

console.error("Determining next version ...");
const tagPrefix = "release/";
const allTags = await getTags();
const nextVersion = getNextVersion(allTags);
const branchName = process.env.OGB_BRANCH_NAME ?? "";
const isBeta = (process.env.OGB_BETA ?? "").toLowerCase() === "true";
const commitSha = process.env.OGB_COMMIT_SHA ?? "";
const nextBetaNumber = getNextBetaNumber(allTags, nextVersion);
const version = isBeta
    ? `${nextVersion}-beta.${nextBetaNumber}.${normalizeBranchName(branchName)}.${shortHash(commitSha)}`
    : nextVersion;
console.log(version);
console.error(version);

async function getTags(): Promise<string[]> {
    const {stdout} = await execFile("git", ["ls-remote", "--tags", "--refs", "origin", "refs/tags/release/*"], {encoding: "utf8"});
    return `${stdout ?? ""}`
        .split("\n")
        .filter(line => line.includes("refs/tags/"))
        .map(line => line.substring(line.indexOf("refs/tags/") + 10).trim())
        .filter(line => line !== "");
}

function getNextVersion(allTags: string[]): string {
    const versions = allTags
        .filter(tag => tag.startsWith(tagPrefix))
        .map(tag => tag.substring(tagPrefix.length))
        .filter(tagVersion => semver.valid(tagVersion) && semver.prerelease(tagVersion) === null);
    const maxVersion = semver.maxSatisfying(versions, "*");
    return maxVersion ? semver.inc(maxVersion, "minor") ?? "1.0.0" : "1.0.0";
}

function getNextBetaNumber(allTags: string[], baseVersion: string): number {
    const numberedBetaPrefixes = [
        `${baseVersion}-beta.`,
        `${baseVersion}-beta-`,
    ];
    let max = 0;
    for (const tag of allTags) {
        if (!tag.startsWith(tagPrefix)) continue;
        const version = tag.substring(tagPrefix.length);
        for (const prefix of numberedBetaPrefixes) {
            if (!version.startsWith(prefix)) continue;
            const rest = version.substring(prefix.length);
            const match = rest.match(/^(\d+)/);
            if (!match) continue;
            const n = Number(match[1]);
            if (Number.isInteger(n) && n > max) max = n;
        }
    }
    return max + 1;
}

function normalizeBranchName(name: string): string {
    const normalized = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return normalized || "branch";
}

function shortHash(hash: string): string {
    return hash.slice(0, 7) || "unknown";
}
