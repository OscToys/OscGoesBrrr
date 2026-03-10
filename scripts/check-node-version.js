import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeExactVersion(label, value) {
  const normalized = String(value).trim().replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(normalized)) {
    throw new Error(`Could not determine exact ${label} version from "${value}"`);
  }
  return normalized;
}

function extractMajor(label, value) {
  const match = String(value).trim().match(/\d+/);
  if (!match) {
    throw new Error(`Could not determine ${label} major version from "${value}"`);
  }
  return match[0];
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = readJson(path.join(rootDir, "package.json"));
const nvmrcExact = normalizeExactVersion(".nvmrc", fs.readFileSync(path.join(rootDir, ".nvmrc"), "utf8"));
const engineExact = normalizeExactVersion("engines.node", packageJson.engines?.node);
const runtimeExact = normalizeExactVersion("current Node runtime", process.version);

const typesNodeMajor = extractMajor("@types/node", packageJson.devDependencies?.["@types/node"]);
const expectedMajor = extractMajor(".nvmrc", nvmrcExact);

const mismatches = [
  runtimeExact === nvmrcExact ? null : `Node runtime ${runtimeExact} does not match .nvmrc ${nvmrcExact}`,
  engineExact === nvmrcExact ? null : `package.json engines.node ${engineExact} does not match .nvmrc ${nvmrcExact}`,
  typesNodeMajor === expectedMajor ? null : `package.json @types/node ${typesNodeMajor} does not match .nvmrc major ${expectedMajor}`,
].filter(Boolean);

if (mismatches.length > 0) {
  for (const mismatch of mismatches) {
    console.error(mismatch);
  }
  process.exit(1);
}
