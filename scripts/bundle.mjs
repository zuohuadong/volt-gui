import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parse, stringify } from 'yaml';

import rootPackage from '../package.json' with { type: 'json' };
import { browserSkill } from './third-party-browser-tools.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist', 'anyong-dsh');
const dshVersion = rootPackage.dependencies['@deepseek-ai/dsh'];
const officeCliVersion = rootPackage.dependencies['@officecli/officecli'];
const intranetAuthVersion = rootPackage.dependencies['@voltui/dsh-intranet-auth'];
const desktopRequire = createRequire(path.join(rootDir, 'apps/desktop-electron/package.json'));

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(dshVersion)) {
  throw new Error(`@deepseek-ai/dsh must use an exact version, got ${JSON.stringify(dshVersion)}`);
}

async function main() {
  const workspaceConfig = parse(await fs.readFile(path.join(rootDir, 'pnpm-workspace.yaml'), 'utf8'));
  console.log('📦 Bundling Anyong DSH Distribution Package...');

  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  // 1. Copy profiles and default patch
  await fs.cp(path.join(rootDir, 'profiles'), path.join(distDir, 'profiles'), { recursive: true });
  await fs.cp(path.join(rootDir, 'plugins', 'dsh-intranet-auth'), path.join(distDir, 'plugins', 'dsh-intranet-auth'), { recursive: true });
  for (const plugin of ['dsh-office', 'dsh-mcp-apps', 'dsh-native-ui']) {
    await fs.cp(path.join(rootDir, 'plugins', plugin), path.join(distDir, 'plugins', plugin), { recursive: true });
  }
  const patchedPlugins = {};
  for (const name of ['@wxg-prc-cpg/dsh-weknora', browserSkill.packageName]) {
    const source = path.dirname(desktopRequire.resolve(`${name}/package.json`));
    const relative = `plugins/${name.split('/').at(-1)}`;
    const destination = path.join(distDir, relative);
    await fs.cp(source, destination, { recursive: true, filter: file => path.basename(file) !== 'node_modules' });
    const manifest = JSON.parse(await fs.readFile(path.join(destination, 'package.json'), 'utf8'));
    manifest.dependencies = { ...manifest.dependencies, ...workspaceConfig.packageExtensions?.[`${name}@${manifest.version}`]?.dependencies };
    delete manifest.scripts;
    delete manifest.devDependencies;
    await fs.writeFile(path.join(destination, 'package.json'), JSON.stringify(manifest, null, 2));
    patchedPlugins[name] = `file:${relative}`;
  }

  // 2. Copy launcher
  await fs.mkdir(path.join(distDir, 'scripts'), { recursive: true });
  await fs.cp(path.join(rootDir, 'scripts', 'anyong.mjs'), path.join(distDir, 'scripts', 'anyong.mjs'));
  await fs.cp(path.join(rootDir, 'scripts', 'provision-dsh-profile.mjs'), path.join(distDir, 'scripts', 'provision-dsh-profile.mjs'));
  await fs.cp(path.join(rootDir, 'scripts', 'anyong-integrations-mcp.mjs'), path.join(distDir, 'scripts', 'anyong-integrations-mcp.mjs'));
  for (const script of ['office-control.ps1', 'report-docx.py', 'sheet-engine.py']) {
    await fs.cp(path.join(rootDir, 'scripts', script), path.join(distDir, 'scripts', script));
  }
  await fs.cp(path.join(rootDir, 'scripts', 'third-party-office-tools.mjs'), path.join(distDir, 'scripts', 'third-party-office-tools.mjs'));
  await fs.cp(path.join(rootDir, 'scripts', 'network-policy.mjs'), path.join(distDir, 'scripts', 'network-policy.mjs'));
  await fs.cp(path.join(rootDir, 'scripts', 'altium'), path.join(distDir, 'scripts', 'altium'), { recursive: true });

  // 3. Create pre-configured package.json in dist
  const distPkg = {
    name: 'anyong-dsh-distribution',
    version: rootPackage.version,
    private: true,
    type: 'module',
    engines: {
      node: rootPackage.engines.node,
    },
    bin: {
      anyong: './scripts/anyong.mjs',
    },
    scripts: {
      start: 'node ./scripts/anyong.mjs',
      web: 'node ./scripts/anyong.mjs web',
    },
    dependencies: {
      '@deepseek-ai/dsh': dshVersion,
      '@deepseek-ai/dsh-experimental-voice-input-bundle': rootPackage.dependencies['@deepseek-ai/dsh-experimental-voice-input-bundle'],
      '@officecli/officecli': officeCliVersion,
      memorix: rootPackage.dependencies.memorix,
      undici: rootPackage.dependencies.undici,
      '@voltui/dsh-intranet-auth': intranetAuthVersion,
      '@voltui/dsh-office': rootPackage.dependencies['@voltui/dsh-office'],
      '@voltui/dsh-mcp-apps': rootPackage.dependencies['@voltui/dsh-mcp-apps'],
      '@voltui/dsh-native-ui': rootPackage.dependencies['@voltui/dsh-native-ui'],
      ...patchedPlugins,
      'zod': rootPackage.dependencies.zod,
    },
    overrides: workspaceConfig.overrides,
  };

  await fs.writeFile(
    path.join(distDir, 'package.json'),
    JSON.stringify(distPkg, null, 2),
    'utf-8'
  );
  await fs.writeFile(path.join(distDir, 'pnpm-workspace.yaml'), stringify({
    overrides: workspaceConfig.overrides,
    allowBuilds: workspaceConfig.allowBuilds,
  }));

  console.log(`✓ Distribution bundle generated at ${distDir}`);
  console.log(`✓ Default profile override '${path.join(distDir, 'profiles', 'anyong.yml')}' is bundled and auto-loaded.`);
}

main().catch((err) => {
  console.error('Bundle error:', err);
  process.exit(1);
});
