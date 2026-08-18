import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist', 'anyong-dsh');

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
    bin: {
      anyong: './scripts/anyong.mjs',
    },
    scripts: {
      start: './scripts/anyong.mjs',
      web: './scripts/anyong.mjs web',
    },
    dependencies: {
      '@deepseek-ai/dsh': '^0.1.0-rc.7',
    },
  };

  await fs.writeFile(
    path.join(distDir, 'package.json'),
    JSON.stringify(distPkg, null, 2),
    'utf-8'
  );

  console.log(`✓ Distribution bundle generated at ${distDir}`);
  console.log(`✓ Default profile '${path.join(distDir, 'profiles', 'anyong.yml')}' is bundled and auto-loaded.`);
}

main().catch((err) => {
  console.error('Bundle error:', err);
  process.exit(1);
});
