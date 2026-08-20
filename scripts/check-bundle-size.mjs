import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB) || 200;
const BUDGET_BYTES = BUDGET_KB * 1024;

const dotNextDir = path.resolve('.next');
const appBuildManifestPath = path.join(dotNextDir, 'app-build-manifest.json');
const buildManifestPath = path.join(dotNextDir, 'build-manifest.json');

if (!fs.existsSync(dotNextDir)) {
  console.error('ERROR: .next directory not found. Please run `npm run build` before checking bundle size.');
  process.exit(1);
}

// Map of route -> Set of JS chunk relative paths
const routeChunks = new Map();

// Helper to get gzipped size of a file
const gzipCache = new Map();
function getFileSizeInfo(relFile) {
  if (gzipCache.has(relFile)) {
    return gzipCache.get(relFile);
  }

  const fullPath = path.join(dotNextDir, relFile);
  if (!fs.existsSync(fullPath)) {
    return { rawBytes: 0, gzipBytes: 0 };
  }

  const content = fs.readFileSync(fullPath);
  const gzipped = zlib.gzipSync(content);
  const info = {
    rawBytes: content.length,
    gzipBytes: gzipped.length,
    rawKb: (content.length / 1024).toFixed(2),
    gzipKb: (gzipped.length / 1024).toFixed(2),
  };
  gzipCache.set(relFile, info);
  return info;
}

if (fs.existsSync(appBuildManifestPath)) {
  const appManifest = JSON.parse(fs.readFileSync(appBuildManifestPath, 'utf8'));
  const pages = appManifest.pages || {};

  // Find all layout chunks (excluding CSS)
  const layoutChunks = [];
  for (const [key, files] of Object.entries(pages)) {
    if (key.endsWith('/layout') || key === '/layout') {
      for (const file of files) {
        if (file.endsWith('.js') && !file.includes('polyfills')) {
          layoutChunks.push(file);
        }
      }
    }
  }

  // Process all page routes
  for (const [key, files] of Object.entries(pages)) {
    if (key.endsWith('/page') || key === '/page') {
      const routeName = key.replace(/\/page$/, '') || '/';
      const chunks = new Set();

      // Add shared layout JS chunks
      layoutChunks.forEach((f) => chunks.add(f));

      // Add page-specific JS chunks (excluding CSS and polyfills)
      for (const file of files) {
        if (file.endsWith('.js') && !file.includes('polyfills')) {
          chunks.add(file);
        }
      }

      routeChunks.set(routeName, chunks);
    }
  }
} else if (fs.existsSync(buildManifestPath)) {
  // Fallback for Pages Router
  const buildManifest = JSON.parse(fs.readFileSync(buildManifestPath, 'utf8'));
  const rootMainFiles = (buildManifest.rootMainFiles || []).filter(
    (f) => f.endsWith('.js') && !f.includes('polyfills')
  );

  for (const [route, files] of Object.entries(buildManifest.pages || {})) {
    if (route === '/_app' || route === '/_document' || route === '/_error') continue;
    const chunks = new Set(rootMainFiles);
    files.forEach((f) => {
      if (f.endsWith('.js') && !f.includes('polyfills')) {
        chunks.add(f);
      }
    });
    routeChunks.set(route, chunks);
  }
}

if (routeChunks.size === 0) {
  console.error('ERROR: No application routes found to measure.');
  process.exit(1);
}

console.log('--- Initial JavaScript Bundle Size Analysis by Route (RNF-RE-04) ---');
console.log(`Budget Limit (RNF-RE-04): ${BUDGET_KB} kB (gzipped JS per route, excluding CSS & polyfills)\n`);

let maxGzipBytes = 0;
let maxGzipRoute = '';
let budgetExceeded = false;

for (const [route, chunks] of routeChunks.entries()) {
  let routeGzipBytes = 0;
  let routeRawBytes = 0;

  for (const chunk of chunks) {
    const info = getFileSizeInfo(chunk);
    routeGzipBytes += info.gzipBytes;
    routeRawBytes += info.rawBytes;
  }

  const routeGzipKb = (routeGzipBytes / 1024).toFixed(2);
  const routeRawKb = (routeRawBytes / 1024).toFixed(2);

  if (routeGzipBytes > maxGzipBytes) {
    maxGzipBytes = routeGzipBytes;
    maxGzipRoute = route;
  }

  const status = routeGzipBytes <= BUDGET_BYTES ? '✓ PASS' : '❌ FAIL';
  console.log(`Route "${route}": ${routeGzipKb} kB (gzip) / ${routeRawKb} kB (raw) [${chunks.size} chunks] -> ${status}`);

  if (routeGzipBytes > BUDGET_BYTES) {
    budgetExceeded = true;
  }
}

const maxGzipKb = (maxGzipBytes / 1024).toFixed(2);
console.log('\n---------------------------------------------------------------');
console.log(`Largest Route: "${maxGzipRoute}" with ${maxGzipKb} kB (gzip)`);
console.log(`Budget Limit:  ${BUDGET_KB} kB`);
console.log('---------------------------------------------------------------');

if (budgetExceeded) {
  console.error(`❌ BUDGET EXCEEDED: Route "${maxGzipRoute}" (${maxGzipKb} kB) exceeds ${BUDGET_KB} kB budget.`);
  process.exit(1);
}

console.log(`✓ SUCCESS: All routes are within the ${BUDGET_KB} kB First Load JS budget.`);
process.exit(0);
