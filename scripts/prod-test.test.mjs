import assert from "node:assert/strict";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktopBuild = readFileSync(join(root, "scripts", "desktop-build.sh"), "utf8");

function writeExecutable(path, source) {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

test("prod_test runs the Wails packaging chain in headless mode when no TTY is available", () => {
  const fixture = mkdtempSync(join(tmpdir(), "voltui-prod-test-"));
  const bin = join(fixture, "bin");
  const capture = join(fixture, "ci.txt");

  try {
    mkdirSync(join(fixture, "desktop"), { recursive: true });
    mkdirSync(join(fixture, "scripts"), { recursive: true });
    mkdirSync(bin, { recursive: true });
    copyFileSync(join(root, "prod_test"), join(fixture, "prod_test"));
    chmodSync(join(fixture, "prod_test"), 0o755);
    writeFileSync(join(fixture, "desktop", "wails.json"), "{}\n");

    writeExecutable(
      join(fixture, "scripts", "desktop-build.sh"),
      '#!/usr/bin/env bash\nprintf "%s|%s" "${CI:-}" "${VOLTUI_DMG_SKIP_FINDER:-}" > "$PROD_TEST_ENV_CAPTURE"\n'
    );
    writeExecutable(
      join(bin, "git"),
      `#!/usr/bin/env bash
case "$*" in
  "branch --show-current") printf 'main\\n' ;;
  "rev-parse --short=8 HEAD") printf 'deadbeef\\n' ;;
  "status --porcelain"|"status --short") ;;
esac
`
    );
    writeExecutable(
      join(bin, "go"),
      `#!/usr/bin/env bash
if [[ "$*" == "env GOBIN" ]]; then
  printf '%s\\n' "$FAKE_GOBIN"
elif [[ "$*" == "env GOPATH" ]]; then
  printf '%s\\n' "${fixture}/gopath"
fi
`
    );
    for (const command of ["node", "pnpm", "wails", "create-dmg"]) {
      writeExecutable(join(bin, command), "#!/usr/bin/env bash\nexit 0\n");
    }

    const env = {
      ...process.env,
      PATH: `${bin}:/usr/bin:/bin`,
      FAKE_GOBIN: bin,
      PROD_TEST_ENV_CAPTURE: capture,
      PROD_TEST_INSTALL_TOOLS: "0",
      PROD_TEST_OPEN_DIST: "0",
    };
    delete env.CI;

    const result = spawnSync(join(fixture, "prod_test"), ["darwin/arm64", "v1.2.3", "stable"], {
      cwd: fixture,
      env,
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(readFileSync(capture, "utf8"), "true|1");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("desktop-build skips Finder DMG layout only through the dedicated opt-in", () => {
  assert.match(
    desktopBuild,
    /if \[ "\$\{VOLTUI_DMG_SKIP_FINDER:-0\}" = "1" \]; then[\s\S]*dmg_args\+=\(--skip-jenkins\)/,
    "headless DMG mode must be gated by VOLTUI_DMG_SKIP_FINDER=1",
  );
  assert.match(
    desktopBuild,
    /create-dmg\s+"\$\{dmg_args\[@\]\}"\s+"\$dmg"\s+"\$dmgsrc"/,
    "create-dmg must receive the conditionally assembled argument list",
  );
  assert.doesNotMatch(
    desktopBuild,
    /if \[[^\n]*\bCI\b[^\n]*\][\s\S]{0,200}--skip-jenkins/,
    "formal release CI must not silently lose Finder layout merely because CI=true",
  );
});

test("desktop-build skips Finder DMG layout only when explicitly requested", () => {
  const fixture = mkdtempSync(join(tmpdir(), "voltui-desktop-build-"));
  const bin = join(fixture, "bin");
  const capture = join(fixture, "create-dmg-args.txt");

  try {
    mkdirSync(join(fixture, "desktop"), { recursive: true });
    mkdirSync(join(fixture, "scripts"), { recursive: true });
    mkdirSync(bin, { recursive: true });
    copyFileSync(join(root, "scripts", "desktop-build.sh"), join(fixture, "scripts", "desktop-build.sh"));
    chmodSync(join(fixture, "scripts", "desktop-build.sh"), 0o755);
    writeFileSync(join(fixture, "desktop", "wails.json"), "{}\n");

    writeExecutable(
      join(bin, "node"),
      `#!/usr/bin/env bash
case "\${1:-}" in
  */stage-computer-use-mcp.mjs|*/stage-bun-runtime.mjs) mkdir -p "$2" ;;
esac
`
    );
    writeExecutable(
      join(bin, "wails"),
      `#!/usr/bin/env bash
mkdir -p build/bin/西谷智灯暗涌系统.app/Contents/MacOS
: > build/bin/西谷智灯暗涌系统.app/Contents/MacOS/voltui-desktop
`
    );
    writeExecutable(join(bin, "codesign"), "#!/usr/bin/env bash\nexit 0\n");
    writeExecutable(
      join(bin, "ditto"),
      `#!/usr/bin/env bash
last=""
for arg in "$@"; do last="$arg"; done
mkdir -p "$(dirname "$last")"
: > "$last"
`
    );
    writeExecutable(
      join(bin, "create-dmg"),
      `#!/usr/bin/env bash
printf '%s\\n' "$@" > "$CREATE_DMG_ARGS_CAPTURE"
for arg in "$@"; do
  case "$arg" in
    *.dmg) mkdir -p "$(dirname "$arg")"; : > "$arg" ;;
  esac
done
`
    );

    const runBuild = (skipFinder) => {
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        CREATE_DMG_ARGS_CAPTURE: capture,
        HAS_APPLE_CERT: "false",
      };
      if (skipFinder) env.VOLTUI_DMG_SKIP_FINDER = "1";
      else delete env.VOLTUI_DMG_SKIP_FINDER;
      return spawnSync(
        "bash",
        [join(fixture, "scripts", "desktop-build.sh"), "darwin/arm64", "v1.2.3", "stable"],
        { cwd: fixture, env, encoding: "utf8" }
      );
    };

    const headlessResult = runBuild(true);
    assert.equal(headlessResult.status, 0, headlessResult.stderr || headlessResult.stdout);
    const headlessArgs = readFileSync(capture, "utf8").trim().split("\n");
    assert.ok(headlessArgs.includes("--skip-jenkins"), `create-dmg args: ${headlessArgs.join(" ")}`);

    const releaseResult = runBuild(false);
    assert.equal(releaseResult.status, 0, releaseResult.stderr || releaseResult.stdout);
    const releaseArgs = readFileSync(capture, "utf8").trim().split("\n");
    assert.ok(!releaseArgs.includes("--skip-jenkins"), `release create-dmg args: ${releaseArgs.join(" ")}`);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
