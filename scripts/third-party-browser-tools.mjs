#!/usr/bin/env node

// Audited browser/computer-use integrations; DSH remains the runtime owner.
export const browserSkill = Object.freeze({
  packageName: "@wxg-prc-cpg/browser-skill-dsh-plugin",
  version: "0.3.3",
  license: "MIT",
  integrity: "sha512-YleWGGDN7re7arDD8PVgcIuTeMXHne4JKilLaKmvO9L1EzvOKNKVXZ3eHq7CXbgF7uooxRjnYviMH2QMRqZv+A==",
  repository: "https://github.com/Tencent/BrowserSkill",
  role: "dsh-browser-plugin",
});

export const browserSkillCli = Object.freeze({
  version: "0.4.0",
  releaseUrl: "https://github.com/Tencent/BrowserSkill/releases/download/cli-v0.4.0",
  assets: {
    "win32-x64": { name: "bsk-v0.4.0-x86_64-pc-windows-msvc.zip", sha256: "6feeb22e608e63e3049b2611cf48fce73daac2420945c35174c16e784cdb2677", binarySha256: "4f95eee4f0d048f8ba213825a415217bfbca566a89fab2b7beb655bb2855c3c3" },
    "linux-x64": { name: "bsk-v0.4.0-x86_64-unknown-linux-musl.tar.gz", sha256: "d8a37ec49505e8bbac15cf3335c832d12c77118de276f8164dcad9323cafabc5" },
    "linux-arm64": { name: "bsk-v0.4.0-aarch64-unknown-linux-musl.tar.gz", sha256: "dcee46ef93959ed9656689803e6c013488d38c174ba201f674ca574e1f1ed99d" },
    "darwin-x64": { name: "bsk-v0.4.0-x86_64-apple-darwin.tar.gz", sha256: "10fcb8dd7fea96f471a11e3492c4d1d7846de630d3668136bfc5c59690afa95e" },
    "darwin-arm64": { name: "bsk-v0.4.0-aarch64-apple-darwin.tar.gz", sha256: "cbe6e6e29c1e215c3e445477c4855a03f43c63973ca578337c4281e6eea29aaf" },
  },
});
