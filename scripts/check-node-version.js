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

function readWorkspaceUseNodeVersion(filePath) {
  const contents = fs.readFileSync(filePath, "utf8");
  const match = contents.match(/^\s*useNodeVersion:\s*("?)([^\r\n"]+)\1\s*$/m);
  if (!match) {
    throw new Error(`Could not determine exact useNodeVersion from "${filePath}"`);
  }
  return normalizeExactVersion("pnpm-workspace.yaml useNodeVersion", match[2]);
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
const workspaceUseNodeVersionExact = readWorkspaceUseNodeVersion(path.join(rootDir, "pnpm-workspace.yaml"));
const engineExact = normalizeExactVersion("engines.node", packageJson.engines?.node);
const runtimeExact = normalizeExactVersion("current Node runtime", process.version);
const typesExact = normalizeExactVersion("@types/node", packageJson.devDependencies?.["@types/node"]);

console.log(`useNodeVersion: ${workspaceUseNodeVersionExact}`);
console.log(`engines.node: ${engineExact}`);
console.log(`current runtime: ${runtimeExact}`);
console.log(`@types/node: ${typesExact}`);

const typesNodeMajor = extractMajor("@types/node", typesExact);
const expectedMajor = extractMajor("engines.node", engineExact);

const mismatches = [
  runtimeExact === engineExact ? null : `Node runtime ${runtimeExact} does not match engines.node ${engineExact}`,
  workspaceUseNodeVersionExact === engineExact ? null : `pnpm-workspace.yaml useNodeVersion ${workspaceUseNodeVersionExact} does not match engines.node ${engineExact}`,
  typesNodeMajor === expectedMajor ? null : `package.json @types/node ${typesNodeMajor} does not match engines.node major ${expectedMajor}`,
].filter(Boolean);

if (mismatches.length > 0) {
  for (const mismatch of mismatches) {
    console.error(mismatch);
  }
  process.exit(1);
}
