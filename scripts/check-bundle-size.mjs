import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BUDGET_KB = 200;
const BUDGET_BYTES = BUDGET_KB * 1024;

const dotNextDir = path.resolve('.next');
const appBuildManifestPath = path.join(dotNextDir, 'app-build-manifest.json');
const buildManifestPath = path.join(dotNextDir, 'build-manifest.json');

if (!fs.existsSync(dotNextDir)) {
  console.error('ERROR: .next directory not found. Please run `npm run build` before checking bundle size.');
  process.exit(1);
}

const chunksToMeasure = new Set();

// 1. Collect files from build-manifest.json
if (fs.existsSync(buildManifestPath)) {
  const buildManifest = JSON.parse(fs.readFileSync(buildManifestPath, 'utf8'));
  const sharedFiles = [
    ...(buildManifest.polyfillFiles || []),
    ...(buildManifest.devFiles || []),
    ...(buildManifest.lowPriorityFiles || []),
    ...(buildManifest.rootMainFiles || []),
  ];
  sharedFiles.forEach((file) => chunksToMeasure.add(file));
}

// 2. Collect files from app-build-manifest.json
if (fs.existsSync(appBuildManifestPath)) {
  const appManifest = JSON.parse(fs.readFileSync(appBuildManifestPath, 'utf8'));
  for (const pageFiles of Object.values(appManifest.pages || {})) {
    pageFiles.forEach((file) => chunksToMeasure.add(file));
  }
}

// 3. Fallback: if manifests don't list chunks, scan .next/static/chunks
if (chunksToMeasure.size === 0) {
  const chunksDir = path.join(dotNextDir, 'static', 'chunks');
  if (fs.existsSync(chunksDir)) {
    const files = fs.readdirSync(chunksDir).filter((f) => f.endsWith('.js'));
    files.forEach((f) => chunksToMeasure.add(`static/chunks/${f}`));
  }
}

let totalGzipBytes = 0;
let totalRawBytes = 0;
const measuredFiles = [];

for (const relFile of chunksToMeasure) {
  const fullPath = path.join(dotNextDir, relFile);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath);
    const gzipped = zlib.gzipSync(content);
    totalRawBytes += content.length;
    totalGzipBytes += gzipped.length;
    measuredFiles.push({
      file: relFile,
      rawKb: (content.length / 1024).toFixed(2),
      gzipKb: (gzipped.length / 1024).toFixed(2),
    });
  }
}

const totalGzipKb = (totalGzipBytes / 1024).toFixed(2);
const totalRawKb = (totalRawBytes / 1024).toFixed(2);

console.log('--- Next.js Initial Client Bundle Size Analysis (RNF-RE-04) ---');
console.log(`Measured chunks: ${measuredFiles.length} file(s)`);
for (const item of measuredFiles) {
  console.log(`  - ${item.file}: ${item.gzipKb} kB (gzip) / ${item.rawKb} kB (raw)`);
}
console.log('---------------------------------------------------------------');
console.log(`Total Initial Uncompressed Size: ${totalRawKb} kB`);
console.log(`Total Initial Gzipped Size:      ${totalGzipKb} kB`);
console.log(`Budget Limit (RNF-RE-04):        ${BUDGET_KB} kB`);
console.log('---------------------------------------------------------------');

if (totalGzipBytes > BUDGET_BYTES) {
  console.error(`❌ BUDGET EXCEEDED: Initial bundle (${totalGzipKb} kB) exceeds ${BUDGET_KB} kB limit.`);
  process.exit(1);
}

console.log(`✓ SUCCESS: Initial bundle (${totalGzipKb} kB) is within the ${BUDGET_KB} kB budget.`);
process.exit(0);
