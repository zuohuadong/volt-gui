import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import rootPackage from '../package.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist', 'anyong-dsh');
const dshVersion = rootPackage.dependencies['@deepseek-ai/dsh'];

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(dshVersion)) {
  throw new Error(`@deepseek-ai/dsh must use an exact version, got ${JSON.stringify(dshVersion)}`);
}

async function main() {
  console.log('📦 Bundling Anyong DSH Distribution Package...');

  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  // 1. Copy profiles and default patch
  await fs.cp(path.join(rootDir, 'profiles'), path.join(distDir, 'profiles'), { recursive: true });

  // 2. Copy launcher
  await fs.mkdir(path.join(distDir, 'scripts'), { recursive: true });
  await fs.cp(path.join(rootDir, 'scripts', 'anyong.mjs'), path.join(distDir, 'scripts', 'anyong.mjs'));

  // 3. Create pre-configured package.json in dist
  const distPkg = {
    name: 'anyong-dsh-distribution',
    version: '1.0.0',
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
    },
  };

  await fs.writeFile(
    path.join(distDir, 'package.json'),
    JSON.stringify(distPkg, null, 2),
    'utf-8'
  );

  console.log(`✓ Distribution bundle generated at ${distDir}`);
  console.log(`✓ Default profile override '${path.join(distDir, 'profiles', 'anyong.yml')}' is bundled and auto-loaded.`);
}

main().catch((err) => {
  console.error('Bundle error:', err);
  process.exit(1);
});
