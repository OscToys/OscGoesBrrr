const { execSync } = require("node:child_process");

const branchName =
  process.env.GITHUB_REF_NAME || execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
const isMain = branchName === "main";
const preRelease = branchName
  .toLowerCase()
  .replace(/[\/_]/g, "-")
  .replace(/[^a-z0-9-]/g, "") || "beta";

module.exports = {
  preRelease: isMain ? false : preRelease,
  git: {
    tagName: "v${version}",
    tagMatch: "v*",
    commit: false,
    tag: false,
    push: true,
    requireCommits: true,
  },
  npm: false,
  github: false,
  plugins: {
    "@release-it/conventional-changelog": {
      preset: {
        name: "conventionalcommits",
      },
      infile: false,
    },
  },
};
