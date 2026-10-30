import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// 只用于制品 smoke：调用随包官方执行器，不构建新的生产工具或权限服务。
const [modules, pythonSmoke, distributions] = process.argv.slice(2);
const require = createRequire(path.join(modules, "_smoke.cjs"));
const load = (name) => import(pathToFileURL(require.resolve(name)).href);
const { Context } = await load("@deepseek-ai/cordis");
const { default: Subprocess } = await load("@deepseek-ai/dsh-subprocess-local");
const { default: PowerShell } = await load("@deepseek-ai/dsh-pwsh-local");
const context = new Context();
const subprocess = await context.plugin(Subprocess);
const shell = await context.plugin(PowerShell, { pwshPath: process.env.ANYONG_PWSH_PATH });

function quote(argument) {
  return `'${argument.replaceAll("'", "''")}'`;
}

try {
  assert.equal(context.shell.pwshPath, process.env.ANYONG_PWSH_PATH);
  const commands = [
    `python -I -B ${quote(pythonSmoke)} ${quote(distributions)}; exit $LASTEXITCODE`,
    "coreutils.exe printf 'z\\na\\n' | coreutils.exe sort; exit $LASTEXITCODE",
    "node --version; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; bun --version; exit $LASTEXITCODE",
  ];
  for (const command of commands) {
    const execution = await context.shell.execute(context.shell.resolve({ command, timeoutMs: 90_000 }));
    const outcome = await execution.result();
    assert.equal(outcome.exitCode, 0, outcome.stderr.text);
    assert.equal(outcome.timedOut, false);
    assert.equal(outcome.signal, null);
    if (command.startsWith("coreutils")) assert.equal(outcome.stdout.text.trim().replaceAll("\r", ""), "a\nz");
    if (command.startsWith("python")) assert.match(outcome.stdout.text, /document round trips passed/);
  }
  console.log("Official DSH PowerShell executor passed with bundled tools.");
} finally {
  await shell.dispose();
  await subprocess.dispose();
}
