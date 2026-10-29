# Releasing

## Candidate

Release candidates are immutable commits verified with Node `26.13.0`, pnpm `12.16.1`, the frozen lockfile and the current official DSH package.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run test:dsh-integration
node scripts/check-migration-boundary.mjs
node scripts/check-skills-sync.mjs
pnpm run build
```

## Desktop artifact

Windows x64 packaging runs with:

```sh
pnpm run dist:desktop
```

Electron runtime installation reuses a complete installed runtime (binary, matching `dist/version`, and matching `path.txt`) and otherwise retries up to three times, with a 180-second timeout per attempt. `ELECTRON_INSTALL_ATTEMPTS` and `ELECTRON_INSTALL_TIMEOUT_MS` accept positive integers. Cache selection prefers `electron_config_cache`, then `ELECTRON_CACHE`, then the ignored repository directory `.cache/electron`; the selected path is passed to both cache variable spellings. An explicitly configured `ELECTRON_MIRROR` is preserved. No mirror is forced by this repository. A zero exit code without the complete platform runtime is a failed installation. Packaging removes both stale target directories before the first build, then builds and collects NSIS and ZIP sequentially.

On a machine that already staged the desktop runtime, the official DSH packaged graph can be smoked without Windows electron-builder:

```sh
pnpm --dir apps/desktop-electron run stage:runtime
pnpm run smoke:staged-runtime
```

The workflow records hashes for the installer executable and portable ZIP archive, and requires the installer's Authenticode status to be `NotSigned`. The archive is extracted once and runs `Anyong.exe` directly instead of unpacking the complete DSH runtime on every launch. These remain unsigned-review artifacts, not a production release.

Windows packaging copies missing `node-pty` `win32-x64` ConPTY files and `@koromix/koffi-win32-x64` from the desktop workspace or pnpm virtual store, then fail closed unless `node.exe`, `officecli.exe`, `bsk.exe`, `conpty.node`, `conpty_console_list.node`, `conpty.dll`, `OpenConsole.exe`, Koffi, and `Anyong.exe` exist as Windows x64 PE images (`MZ` + `PE` + AMD64 machine). The Windows extraResources graph omits Darwin/Linux/ARM64 natives and `*.pdb` files. Desktop CI and release both require Authenticode `NotSigned`. Do not run `electron-builder --win` from a macOS-staged runtime. Official DSH child processes do not inherit user API keys or OEM endpoint environment variables.

## GitHub unsigned-review release

Run `.github/workflows/release-desktop.yml` with `workflow_dispatch`. The Windows runner verifies the candidate, packages the installer and portable ZIP, and requires Authenticode `NotSigned`.

OEM gateway credentials must be provided as GitHub Actions secrets (`XG_GOMODEL_API_KEY`, plus optional `XG_GOMODEL_ENDPOINT` / `XG_MODEL_BASE_URL`). The workflow sets `REQUIRE_XG_MODEL_BUNDLE=1`, writes `bundled.env` only into the package, and verifies the packaged sidecar. Tracked `.cnb/envs.yml` is a template and must stay empty of live keys.

CNB remains a Node 26 source-validation gate for this repository. It does not import secrets, vendor BrowserSkill binaries, or publish installers.


## Future release gates

Signing, notarization, updater provenance, public release creation and rollback must be implemented and independently reviewed before the workflow may publish a stable artifact. Do not reintroduce the retired native package or multi-channel release chain.

## Anyong product-line port

CNB `anyong-agent` is a faster product-line reference, not a git upstream. Do not merge its `main` into this repository.

Port allowlisted product paths from an isolated shallow clone:

- Include: `apps/desktop-electron/`, `apps/desktop-frontend/`, `profiles/anyong.yml`, official DSH launcher/runtime scripts, and product docs that do not encode CNB release.
- Exclude: `.cnb.yml` tag/release jobs, `.cnb/envs.yml` secrets, `vendor/bsk/`, `publish-cnb-*`, `install-cnb-*`, `ensure-cnb-workspace.ps1`, and CNB task contracts.

Keep GitHub as the Windows x64 unsigned-review packager and CNB as a Node 26 source gate. Runtime upgrades still come from exact npm versions of official DSH, not from copying Anyong's `node_modules`. Root package metadata must stay on `github.com/zuohuadong/volt-gui` with the MIT license; do not copy CNB `repository` URLs or a fake `main: index.js` from the reference tree.

## Selective sync protocol

Use the product line as a source of reviewed fixes, not as release authority:

1. Resolve the live source `main` SHA in an isolated reference clone. Record both the previous reviewed source SHA and the new source SHA; version bumps alone are not feature or quality evidence.
2. Group the source delta by behavior: runtime/lifecycle, official RPC compatibility, UI, integrations, packaging, and source-only CI. Review each group against the allowlist and local changes before applying it.
3. Prefer a focused source commit with attribution when the histories remain compatible. Otherwise port its behavioral patch and tests, recording the source commit and local adaptation. Never use a whole-tree checkout or merge to overwrite the working tree.
4. Keep a receipt for each source group: ported, already covered locally, excluded with reason, or pending. A partially ported source SHA is not an accepted synchronization baseline.
5. Run targeted tests first, then core tests, official DSH integration, build, boundaries, dependency audit, and staged-runtime smoke for shared runtime changes. Associate Windows artifact and real UI acceptance with the final immutable candidate separately.
6. Feed generic fixes back through a separately authorized PR on the product line or official DSH. Keep brand defaults, provider endpoints, secrets, and publishing jobs outside the shared patch scope.

Do not automate external merges or releases. A future monitor may generate a delta report or review PR only after explicit authorization; it must not promote unverified source changes to `main`.

### Selective continuation receipt: October 24, 2026

Reference `main` was fetched at `93c131b74ad7c4623ab1aab989997160b8c8522d`. The previous reviewed source was `32b034fafb1270150a6f44243bdd176e84dbbd20`, not a fully accepted synchronization baseline. The intervening 140 commits were inventoried by subject and path; the complete runtime/UI delta has not been ported or accepted.

| Source change | Disposition | Evidence or remaining boundary |
| --- | --- | --- |
| `38d6f5ca`: bounded Electron runtime installation | Ported with positive-integer validation, forced timeout termination, and the existing mirror policy | Nine local behavior tests cover retries, cache/mirror propagation, incomplete/stale installation repair, invalid bounds, platform paths, and a genuinely stalled child |
| `986ddaba`: bounded packaging disk use | Ported the cleanup-before-first-target behavior; kept the existing sequential builder | Two fixture-process tests cover stale target cleanup, collection order, and fail-fast behavior; no Windows artifact was built |
| `a1525b2`: sequential Windows artifacts | Already present locally | The new regression tests exercise both artifact targets without downloading or publishing |
| `6748e24`: OfficeCLI checksum correction | Not applicable to local OfficeCLI `1.0.149`; its manifest and ignored installer already agree | Do not substitute the hash for another version or import the excluded CNB installer |
| `6f8e6c3`, `0826125`, `2b84a39`, `6169ce0`: CNB runner/cache/publication changes | Excluded | These operate the reference line's Windows release runner; this repository's CNB role remains source-only |
| `e5aabe1`: BrowserSkill vendor fallback | Excluded | No `vendor/bsk` lookup or binary is imported; local staging already supports a verified `BSK_PATH` and staged binary |
| DSH `0.2.1-rc.2`, Node/pnpm upgrades, RPC/session/UI changes, extensions, Office/OCR integrations and dependency security upgrades | Pending | Require a separate dependency-compatible migration and real DSH/desktop validation; this patch does not establish those capabilities or security fixes |

The workflow contract suite also passed 13 tests using the existing cached `yaml@2.9.0` via `NODE_PATH`, because this checkout's workspace dependency links are incomplete. This is targeted source verification, not a successful frozen install, full build, dependency audit, or Windows packaged-runtime acceptance. The source synchronization remains `PARTIAL`.

The expanded run passed 29 of 30 tests (including four pnpm invocation tests and four Electron boundary rejection cases). The remaining boundary assertion expects DSH `0.1.5-rc.2` while the existing desktop manifest pins `0.1.5-rc.3`. Scanning files exported from the unchanged `c5e417ca7` baseline reproduced the same `official-dsh-version` finding. This pre-existing version-policy mismatch is left for the dependency migration; the complete suite is not green.

An independent review found that the initial reference-style binary-only readiness check missed incomplete extraction, and that Electron 44 consumes `electron_config_cache`. Both findings were addressed using the installed Electron 44 installer as the contract: version/path metadata must match, and the cache path is mapped to the consumed variable. The final focused suites passed 28 tests (9 installer, 2 packaging, 13 workflow, 4 pnpm); these do not include the known failing version-policy assertion.

### Source review receipt: September 16, 2026

Live source `main` resolves to `29ab4d236cae03250e81982bdcfa08afe4e58867` (tag `v0.31.56`). No previously fully accepted source-sync SHA is available in this candidate. The range from `9b3c00e457077083751c0c0067aee6c24229d707` (`0.31.48`) to that head was inspected to classify its eight commits, not to invent an accepted baseline.

| Source group | Current candidate disposition | Acceptance boundary |
| --- | --- | --- |
| The eight `0.31.49` through `0.31.56` commits | Mostly CNB workspace/LFS/upload fixes and version metadata; not desktop feature deltas | Exclude CNB release/workspace/vendor changes; migration-boundary behavior is reviewed separately |
| Session health, pending interactions, session follow, single flight, renderer security | Corresponding implementation files match the reference bytes | Byte equality is provenance evidence, not Windows/UI runtime acceptance |
| `b702ca2`: filter unusable gateway models | Local model-catalog logic is retained with translated copy | Synthetic tests do not prove a real gateway completion |
| `305879a`: recover silent/duplicate chat errors | Local frontend adapts the reference behavior with additional error/i18n handling | Real Chinese/English UI and model-flow acceptance remains pending |
| `9b3c00e`: official profile bundles and integrations | Profile provisioning and WeKnora tool metadata match; document-import paths are additionally hardened locally | Latest local official DSH integration passes; external connector accounts are not accepted |
| Runtime, authentication, lifecycle and export | Local adaptation adds credential filtering, cancellation, bounded stop, recovery and atomic export | Fault injection is not a real packaged-runtime receipt |
| CLI/distribution, dependency and Windows packaging controls | Local exact overrides, production audit and PE/resource checks remain authoritative | No Windows installer/ZIP or unsigned-review release receipt for this dirty candidate |

Keep two-way collaboration at the behavioral-patch level: shared DSH/RPC, lifecycle, transcript and packaging fixes should carry source attribution and tests; branding, private provider defaults and publishing credentials stay product-line specific. Do not create a shared core package or another Harness merely to simplify Git synchronization. A source group remains pending until its local adaptation and required tests are accepted on one immutable candidate.

### Selective sync receipt: October 29, 2026

The live CNB `anyong-agent` source `main` resolves to `a8a664cd1752494d75f79f62c2d4783672393c6d` (`v0.31.169`). The delta from the previous reviewed source `93c131b74ad7c4623ab1aab989997160b8c8522d` contains 32 commits and 102 changed paths. This repository keeps its own GitHub metadata, DSH `0.1.5-rc.3` contract, and Electron architecture; no CNB merge or release commit was applied.

| Source group | Disposition | Evidence or remaining boundary |
| --- | --- | --- |
| `45ff971e`: internal gateway image capability declarations | Ported | `profiles/anyong.yml` now declares `text,image` with validated `ANYONG_MODEL_INPUT_OVERRIDES_JSON` fallback; `scripts/model-modalities.test.mjs` and profile assertions cover defaults, valid overrides, and malformed values |
| `705f380e`: credential context for 401 failures | Ported with local adaptation | The Svelte workbench shows model/provider/reference context without secret values; the built-in gateway action opens Model Services and other providers open matching credential settings |
| `6e825652`: inactive Provider credential references | Ported independently of voice input | Namespaces with only inactive providers no longer contribute default credential references; unknown namespaces and namespaces shared with an active provider remain visible |
| `09ad2125`: Windows integration cleanup | Ported with local adaptation | Shared cleanup helper retries Windows directory-lock errors while propagating unexpected or non-Windows failures; deterministic unit tests cover all branches |
| `3f4be902`: integration-policy timeout increase | Not directly applicable | The local policy test has no corresponding 180-second test timeout; its existing child startup bounds remain unchanged |
| `6abc70ba`, `164087cb`: runtime staging link-boundary fixes | Pending / not applicable | This checkout has no corresponding `runtime-staging-cache` module; no unrelated staging subsystem was introduced merely to copy the reference patch |
| `3e82d693`, `6e825652`: official voice input | Pending | Requires the DSH voice bundle and RPC contract from the `0.2.x` product line; local `0.1.5-rc.3` must not receive guessed endpoints |
| `16f7c6cc`, `85510810`, `198cff67`, `dc0b5b37`: generated Surface widgets | Pending | Requires the reference `@svadmin/surface` contract and newer integration behavior; current renderer already has a separate read-only Surface protocol |
| `9d4113e9`, `372035f4`, `faddc0a9`: bounded spreadsheet engine | Pending separate compatibility migration | Requires new Python/runtime binaries, DuckDB extension staging, Office isolation, and Windows packaging evidence; no partial engine was introduced |
| `0c50851d`: offline failure-analysis DOCX | Pending separate compatibility migration | Requires `python-docx`, new local report MCP scope, path policy, and packaging/test acceptance; it is not a safe one-file port |
| DSH/dependency upgrades, CNB workflow/publication changes, vendor binaries, release metadata | Pending or product-line-specific | Runtime upgrades need a separate exact-version migration; CNB release authority, secrets, vendor artifacts, and source repository metadata remain outside this selective behavioral sync |

This receipt is a partial behavioral sync, not a fully accepted CNB baseline. A complete DSH `0.2.x` migration requires a separate authorized scope with frozen installation, integration, build, boundary, dependency-audit, and packaged-runtime evidence.

Execution status: `PARTIAL`. Full source acceptance is blocked on the separately scoped DSH/dependency migration and the pending source groups above; real gateway, Electron UI and Windows packaged-runtime acceptance also remain outstanding. The reviewed source SHA must not become an accepted baseline merely because these focused fixes pass.

Observed local evidence on October 29, 2026:

- Frozen offline installation with pnpm `12.1.0` and `--ignore-scripts` completed successfully; `pnpm-lock.yaml` is unchanged. The earlier online attempt was interrupted during linking. This is not a successful lifecycle-script or native-binary installation receipt.
- Official DSH profile-loader modality tests and cleanup tests passed 6/6. The override accepts only `text` and `image`; malformed JSON, unknown modalities and mixed invalid arrays fall back to the default. An independent read-only verifier found the missing enum validation, which was fixed and retested.
- Focused frontend tests passed 27/27. `svelte-check` reported zero errors and warnings; the Svelte autofixer reported no issues. The Vite production build passed with large-chunk warnings.
- Full frontend tests passed 105/106. The failing responsive-layout test reads the final mobile CSS block; comparison with `HEAD` confirms that block is unchanged by this patch. This is a pre-existing failure, not a green full suite.
- Workflow tests passed 13/13; migration boundary and skills-sync checks passed. Final diff hygiene passed.
- Electron profile tests passed 4/5 and Electron boundary tests passed 4/5. Both failures, plus the plugin compatibility gate, still expect DSH `0.1.5-rc.2` while the existing manifests pin `0.1.5-rc.3`; this patch does not weaken or rewrite that historical approval policy.
- The DSH integration attempt failed its version assertion, then was interrupted while the launcher waited for the required OfficeCLI binary. No real DSH loopback, image completion, credential recovery UI, complete root build or Windows package was accepted. The package-manager frontend-test attempt also waited in OfficeCLI postinstall and was stopped; frontend tests/build were run directly with the installed workspace executables instead.

No commit, push, workflow dispatch, release, CNB vendor import, or production write was performed.

## Local hardening evidence

The September 16, 2026 candidate work keeps official DSH `0.1.5-rc.1` pinned and adds exact compatible transitive overrides for `sharp@0.35.4`, `js-yaml@4.3.2`, and `hono@4.13.5`. The CLI distribution carries the same npm overrides. Windows workflows audit production dependencies before packaging and uploading; release secrets are scoped to the credential check and package step, not installation, audit, or tests.

Failure-path coverage includes retained runtime ownership after failed stop, bounded forced-stop waits, authenticated startup cancellation, cancelled credential import, recovery after closing the last window, repeated quit requests, history cancellation before its first frame, and atomic session-export replacement. Fault-injection tests are not evidence of a real Electron window or Windows installer.

Status remains `PARTIAL` until the final candidate has Windows x64 installer/ZIP, PE, unsigned Authenticode, SHA256, packaged DSH smoke, and credential-authorized Chinese/English UI and real-model flow evidence. Local build success or a reference release tag must not be reported as production acceptance.

Observed local evidence for this worktree on September 16, 2026:

- Frozen installation and production dependency audit exited successfully; the audit reported zero vulnerabilities.
- Core tests exited successfully, including 101 frontend tests and 65 shared script tests. The focused lifecycle, Remote, runtime, and workflow run passed 68 tests with the real Windows process-tree test skipped, plus 5 profile, 8 SMB, and 5 Electron security tests.
- Full source build exited successfully; subsequent main-process changes passed typecheck and main bundling. Electron/migration boundaries, workflow tests, skills checks, and diff hygiene also passed.
- Updated runtime staging exited successfully. Its installed manifest versions are DSH `0.1.5-rc.1`, sharp `0.35.4`, js-yaml `4.3.2`, and Hono `4.13.5`.
- An earlier DSH integration attempt exited unsuccessfully: 10 passed and two desktop credential cases exceeded the 240-second startup timeout. The first staged smoke also exceeded the 30-second Node version timeout. Those failures remain historical evidence and are not treated as passing acceptance.
- Earlier staged smoke and credential-only retries were interrupted after official DSH startup remained pending. Their child processes were stopped; the underlying startup cause was not proven.

Continuation evidence on September 16, 2026:

- Public npm dist-tags were rechecked: `latest` is `0.1.5-rc.1`, `next` is `0.1.5-rc.2`, and `alpha` is `0.1.6-alpha.1`. This work does not adopt `next` or `alpha`.
- Direct source and staged DSH `--version`, with and without `--expose-internals`, all returned `0.1.5-rc.1` successfully. A separately copied Node executable returned `v26.8.1`; that alone is not loopback startup acceptance.
- Short bounded startup probes of official stock web, patched web, `web`/`--profile web`, and both Node flag shapes did not receive a trusted loopback URL. They are diagnostics, not replacements for the failed 240-second integration cases. ESM traces reached different dependencies; no single cause is established.
- Recursive copying of the full hoisted graph was interrupted after I/O waiting. A later launcher comparison was also interrupted and its child stopped; it does not establish a successful isolated runtime or a command-line compatibility defect.
- Staged-smoke assembly now rejects the temp root, traversal, escaping ancestor links and existing destinations. It creates unique exclusive directories, uses Windows junctions for directory resources, and removes only its newly created target on failure or normal CLI completion. The related safety/resource-layout tests passed locally; actual Windows execution is still separate acceptance.
- The final production-source core regression exited successfully: profile 5 passed, runtime 68 passed with one Windows process-tree skip, SMB 8 passed, Electron security 5 passed, frontend 101 passed, and shared scripts 65 passed. The final scoped safety/resource-layout/migration/workflow run passed all 41 tests. Both smoke files passed `node --check`, and final diff hygiene passed.
- One independent read-only verifier found no confirmed defect in the owned-temp-directory implementation. Its missing existing-file and dangling-leaf assertions were added and passed. This review does not establish actual Windows junction execution, real DSH startup, or production acceptance.
- The latest bounded runtime evidence passed: `pnpm run test:dsh-integration` completed 12/12 tests, runtime staging completed with Node `v26.8.1` and official DSH `0.1.5-rc.1`, and a subsequent `pnpm run smoke:staged-runtime` completed with loopback startup and plugin RPC. A cold staged launch timed out once at the 30-second Node version check; the unchanged smoke passed on the immediate retry, so the cold-start behavior remains recorded rather than hidden.

The reference source `main` was checked at `29ab4d236cae03250e81982bdcfa08afe4e58867`. The local HEAD remains `eb724b7b85eef311cfbbfd745b47322cda1517b3`; live `origin/main` was checked at `b0568ba99bc409a4c55d08af8fbc1f7cce7a8c5f`. Existing remote changes still need reconciliation with this dirty candidate before a new immutable release SHA can be accepted. No commit, push, workflow dispatch, or release was performed.
