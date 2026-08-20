import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function findLintFixtures(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') {
        continue;
      }
      findLintFixtures(fullPath, fileList);
    } else if (entry.isFile()) {
      if (fullPath.includes('__lint-fixtures__') && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        fileList.push(fullPath);
      }
    }
  }

  return fileList;
}

const fixtures = findLintFixtures('.');

if (fixtures.length === 0) {
  console.error('ERROR: No lint fixtures found in __lint-fixtures__ directories.');
  process.exit(1);
}

console.log(`Found ${fixtures.length} boundary lint fixture(s) to verify:\n`);

let failedRegressionCount = 0;

for (const fixture of fixtures) {
  const relPath = path.relative(process.cwd(), fixture).replace(/\\/g, '/');
  const isWindows = process.platform === 'win32';
  const npmCmd = isWindows ? 'npx.cmd' : 'npx';

  const result = spawnSync(npmCmd, ['eslint', '--no-ignore', relPath], {
    encoding: 'utf-8',
    shell: isWindows,
  });

  if (result.status === 0) {
    console.error(`❌ REGRESSION: Fixture "${relPath}" passed linting (exit 0), but was expected to FAIL.`);
    failedRegressionCount++;
  } else {
    console.log(`✓ Fixture "${relPath}" correctly failed linting (exit ${result.status}).`);
  }
}

console.log('');

if (failedRegressionCount > 0) {
  console.error(`FAILED: ${failedRegressionCount} fixture(s) did not trigger expected lint errors.`);
  process.exit(1);
}

console.log(`SUCCESS: All ${fixtures.length} boundary lint fixtures correctly failed as expected.`);
process.exit(0);
