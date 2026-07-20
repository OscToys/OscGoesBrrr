import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeExactVersion(label, value) {
  const normalized = String(value).trim().replace(/^[v^]/, "");
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
const configuredRuntimeExact = normalizeExactVersion("devEngines.runtime.version", packageJson.devEngines?.runtime?.version);
const runtimeExact = normalizeExactVersion("current Node runtime", process.version);
const typesExact = normalizeExactVersion("@types/node", packageJson.devDependencies?.["@types/node"]);

console.log(`devEngines.runtime: ${configuredRuntimeExact}`);
console.log(`current runtime: ${runtimeExact}`);
console.log(`@types/node: ${typesExact}`);

const typesNodeMajor = extractMajor("@types/node", typesExact);
const expectedMajor = extractMajor("devEngines.runtime", configuredRuntimeExact);

const mismatches = [
  runtimeExact === configuredRuntimeExact ? null : `Node runtime ${runtimeExact} does not match devEngines.runtime ${configuredRuntimeExact}`,
  typesNodeMajor === expectedMajor ? null : `package.json @types/node ${typesNodeMajor} does not match devEngines.runtime major ${expectedMajor}`,
].filter(Boolean);

if (mismatches.length > 0) {
  for (const mismatch of mismatches) {
    console.error(mismatch);
  }
  console.error("Make sure you are using pnpm, and that your pnpm is up to date.");
  process.exit(1);
}
