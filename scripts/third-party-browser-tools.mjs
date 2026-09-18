#!/usr/bin/env node

// Audited browser/computer-use integrations; DSH remains the runtime owner.
export const browserSkill = Object.freeze({
  packageName: "@wxg-prc-cpg/browser-skill-dsh-plugin",
  version: "0.2.1",
  license: "MIT",
  integrity: "sha512-cWBdhqyRKoHgLjWSwwileiiWdSke2VML5/LBTDM8lbNYYHJ7Ghd+uwpzRJlNlt7a1QClMvfuk06Jgv5yiFzcfQ==",
  repository: "https://github.com/Tencent/BrowserSkill",
  role: "dsh-browser-plugin",
});

export const browserSkillCli = Object.freeze({
  version: "0.2.1",
  releaseUrl: "https://github.com/Tencent/BrowserSkill/releases/download/cli-v0.2.1",
  assets: {
    "win32-x64": { name: "bsk-v0.2.1-x86_64-pc-windows-msvc.zip", sha256: "98539807febcaca0442024b289ce2df5691e71bdc8d6568aa98e38054fd2a04e", binarySha256: "a9d33e8030d3f91c43d8e4ffd97d9c48fc31f6e1c17c76f9db50bf15a7834b7f" },
    "linux-x64": { name: "bsk-v0.2.1-x86_64-unknown-linux-musl.tar.gz", sha256: "a533cbf532fe9848332d72c2b92e92e0d76626765417ca5f374914385731265f" },
    "linux-arm64": { name: "bsk-v0.2.1-aarch64-unknown-linux-musl.tar.gz", sha256: "d30f301fe64ea4784899d0cba3e8991d6b59017173bf83258a161a64c94a42f5" },
    "darwin-x64": { name: "bsk-v0.2.1-x86_64-apple-darwin.tar.gz", sha256: "3181f7010e12e2b9a395d26690a21abc4cacc1cf5c705930baea2ed2efcae7e2" },
    "darwin-arm64": { name: "bsk-v0.2.1-aarch64-apple-darwin.tar.gz", sha256: "a2e7d03f7f9aa4d1f0cc977dae71099b9ee4805a5c06cdefde3919afbecf06ad" },
  },
});
