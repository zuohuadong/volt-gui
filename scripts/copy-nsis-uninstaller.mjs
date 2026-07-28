import { copyFileSync, statSync } from 'node:fs';

const [generatedUninstaller, preservedUninstaller] = process.argv.slice(2);

if (!generatedUninstaller || !preservedUninstaller) {
  throw new Error('usage: copy-nsis-uninstaller.mjs <generated-uninstaller> <preserved-uninstaller>');
}
if (statSync(generatedUninstaller).size === 0) {
  throw new Error(`generated NSIS uninstaller is empty: ${generatedUninstaller}`);
}

copyFileSync(generatedUninstaller, preservedUninstaller);
