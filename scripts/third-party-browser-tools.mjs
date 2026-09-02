#!/usr/bin/env node

// Audited browser/computer-use integrations; DSH remains the runtime owner.
export const browserSkill = Object.freeze({
  packageName: "@wxg-prc-cpg/browser-skill-dsh-plugin",
  version: "0.1.2",
  license: "MIT",
  integrity: "sha512-k6BeAN0SpuaBj0M62wQhcKjCN7Fk6K6NTzGc/5c6LnOW2EvfQxdBssdnKhn7lLyTN3qHktCTpTeJsHdQUcnnTg==",
  repository: "https://github.com/Tencent/BrowserSkill",
  role: "dsh-browser-plugin",
});

export const browserSkillCli = Object.freeze({
  version: "0.1.11",
  releaseUrl: "https://github.com/Tencent/BrowserSkill/releases/download/cli-v0.1.11",
  assets: {
    "win32-x64": { name: "bsk-v0.1.11-x86_64-pc-windows-msvc.zip", sha256: "041785147342a704fd576470e63307880043a15ad52e0553f12e6dcf360ccf74", binarySha256: "5aefca2ee990fe54de387894d23bcb0e0b21cfb98d59fa0d7700d5ac63f72c2e" },
    "linux-x64": { name: "bsk-v0.1.11-x86_64-unknown-linux-musl.tar.gz", sha256: "fc34aa4fe5214b2efb6f91ed6dfc7937531b86b02c8c246d9643d12818bcd6cc" },
    "linux-arm64": { name: "bsk-v0.1.11-aarch64-unknown-linux-musl.tar.gz", sha256: "560079f71f89ed5a0b364bdebc4713182641f3a1c5a0cc3903f09d559b41b04e" },
    "darwin-x64": { name: "bsk-v0.1.11-x86_64-apple-darwin.tar.gz", sha256: "f1e0749fc2fac11f81d931862efa331bb9fcba30d1a5cce83b2a10626bb02bf6" },
    "darwin-arm64": { name: "bsk-v0.1.11-aarch64-apple-darwin.tar.gz", sha256: "819df4e0c001c6a32eb447c9cbf5a1d89b1a084e7cec15b0488a4889abf6f6d6" },
  },
});
