#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '..');

const crudTests = [
  'TestSaveAutomationPersistsWorkbenchAutomation',
  'TestSaveProjectMaterialPersistsAndReloads',
  'TestDeleteProjectMaterialRemovesPersistedItem',
  'TestSaveWorkbenchProjectPersistsProject',
  'TestSaveTodoPersistsWorkbenchTodo',
  'TestWorkbenchDataPersistsBusinessSurfaces',
  'TestDeleteKnowledgeDocumentRemovesIndexAndWorkbenchMetadata',
  'TestWorkbenchDeleteCustomerRemovesRecord',
  'TestWorkbenchReportUpdateExportAndDelete',
  'TestWorkbenchTeamRoomAndChatPersist',
  'TestWorkbenchDistillAgentFromTodo',
  'TestWorkbenchEmptyDataStaysEmpty',
];

const pattern = `^(?:${crudTests.join('|')})$`;
const go = process.env.GO || 'go';
const result = spawnSync(go, ['test', '.', '-count=1', '-run', pattern], {
  cwd: path.join(root, 'desktop'),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Unable to start ${go}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
