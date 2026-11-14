#!/usr/bin/env node

// Audited browser/computer-use integrations; DSH remains the runtime owner.
export const browserSkill = Object.freeze({
  packageName: "@wxg-prc-cpg/browser-skill-dsh-plugin",
  version: "0.5.0",
  license: "MIT",
  integrity: "sha512-F9yhfiF6TZLJt/eYqxh52VBjD0t1WseRbWpJRZHl4JGlgfrJgPH9LsHarOvSIP6VSX8bwMCnhB8t/biQQnl5wg==",
  repository: "https://github.com/Tencent/BrowserSkill",
  role: "dsh-browser-plugin",
});

export const browserSkillCli = Object.freeze({
  version: "0.5.0",
  releaseUrl: "https://github.com/Tencent/BrowserSkill/releases/download/cli-v0.5.0",
  assets: {
    "win32-x64": { name: "bsk-v0.5.0-x86_64-pc-windows-msvc.zip", sha256: "1bba7cd6d771df48485c396b8d5f1e06f9bc93cd648b0552013c30f90aeaaa40", binarySha256: "d6e2875707ca89cb506fa0bebc881a638d721178974c4b26d8b4bf9070bc03f2" },
    "linux-x64": { name: "bsk-v0.5.0-x86_64-unknown-linux-musl.tar.gz", sha256: "4e4f14183511f8d03487cad93549c9db8ea10360ac01a9aa3584487f8d33e5f7" },
    "linux-arm64": { name: "bsk-v0.5.0-aarch64-unknown-linux-musl.tar.gz", sha256: "7db0665a2bdc0c9287f8806ab572a257ffcfb849e27291b1140bd46e21a6a34a" },
    "darwin-x64": { name: "bsk-v0.5.0-x86_64-apple-darwin.tar.gz", sha256: "9f278376741f2972a13014463bdf64504ba093877364a4c1202ceee3cbde4756" },
    "darwin-arm64": { name: "bsk-v0.5.0-aarch64-apple-darwin.tar.gz", sha256: "a16b66ab9d3629045d663f645fd2c2b8f544116ac3cc9efb94b34867fcfe1756" },
  },
});

export const browserSkillExtension = Object.freeze({
  version: "0.5.0",
  releaseUrl: "https://github.com/Tencent/BrowserSkill/releases/download/ext-v0.5.0",
  archive: "browser-skill-extension-v0.5.0-chrome.zip",
  sha256: "4de785b340e401de855448410be3b7bad5e685a9e5128c0bd4ec4edeba5c9fc9",
  vendorPath: "vendor/browser-skill/browser-skill-extension-v0.5.0-chrome.zip",
});
