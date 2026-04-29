import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffprobeStatic from 'ffprobe-static';
import { resolveMaterialRoot } from './material_root.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const materialRoot = resolveMaterialRoot(root);
const publicRoot = path.join(root, 'public');
const videoExts = new Set(['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm']);
const pendingDeleteMarkerSuffix = '.pending-delete.json';

const buckets = {
  unused: path.join(materialRoot, 'unused'),
  fragments: path.join(materialRoot, 'fragments'),
  used: path.join(materialRoot, 'used'),
};

const kitchenPools = {
  outdoor: {
    label: '外场',
    unused: path.join(materialRoot, 'kitchen', 'outdoor', 'unused'),
    fragments: path.join(materialRoot, 'kitchen', 'outdoor', 'fragments'),
    used: path.join(materialRoot, 'kitchen', 'outdoor', 'used'),
  },
  aerial: {
    label: '航拍',
    unused: path.join(materialRoot, 'kitchen', 'aerial', 'unused'),
    fragments: path.join(materialRoot, 'kitchen', 'aerial', 'fragments'),
    used: path.join(materialRoot, 'kitchen', 'aerial', 'used'),
  },
  warehouse: {
    label: '仓库内部',
    unused: path.join(materialRoot, 'kitchen', 'warehouse', 'unused'),
    fragments: path.join(materialRoot, 'kitchen', 'warehouse', 'fragments'),
    used: path.join(materialRoot, 'kitchen', 'warehouse', 'used'),
  },
};

function getPendingDeleteMarkerPath(filePath) {
  return `${filePath}${pendingDeleteMarkerSuffix}`;
}

async function shouldSkipPendingDeleteFile(filePath) {
  const markerPath = getPendingDeleteMarkerPath(filePath);
  if (!existsSync(markerPath)) return false;
  if (!existsSync(filePath)) {
    await rm(markerPath, { force: true }).catch(() => {});
  }
  return true;
}

async function ensureFolders() {
  await mkdir(publicRoot, { recursive: true });
  await Promise.all(Object.values(buckets).map((folder) => mkdir(folder, { recursive: true })));
  for (const pool of Object.values(kitchenPools)) {
    await Promise.all(
      ['unused', 'fragments', 'used'].map((kind) => mkdir(pool[kind], { recursive: true })),
    );
  }
}

function probeDuration(filePath) {
  return new Promise((resolve) => {
    execFile(
      ffprobeStatic.path,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const duration = Number.parseFloat(String(stdout).trim());
        resolve(Number.isFinite(duration) ? Math.round(duration) : null);
      },
    );
  });
}

async function scanBucket(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!videoExts.has(ext)) continue;
    const filePath = path.join(folder, entry.name);
    if (await shouldSkipPendingDeleteFile(filePath)) continue;
    const duration = await probeDuration(filePath);
    files.push({
      name: entry.name,
      path: filePath,
      duration,
    });
  }

  return {
    count: files.length,
    totalDuration: files.reduce((sum, file) => sum + (file.duration || 0), 0),
    files,
  };
}

async function scanKitchenPools() {
  const result = {};
  for (const [poolKey, pool] of Object.entries(kitchenPools)) {
    result[poolKey] = {
      label: pool.label,
      unused: await scanBucket(pool.unused),
      fragments: await scanBucket(pool.fragments),
      used: await scanBucket(pool.used),
    };
  }
  return result;
}

await ensureFolders();

const inventory = {
  updatedAt: new Date().toLocaleString('zh-CN'),
  root: materialRoot,
  unused: await scanBucket(buckets.unused),
  fragments: await scanBucket(buckets.fragments),
  used: await scanBucket(buckets.used),
  kitchen: await scanKitchenPools(),
};

const json = `${JSON.stringify(inventory, null, 2)}\n`;
await writeFile(path.join(publicRoot, 'material_inventory.json'), json, 'utf8');
await writeFile(path.join(materialRoot, 'material_inventory.json'), json, 'utf8');

console.log(`Scanned materials: ${materialRoot}`);
console.log(`unused=${inventory.unused.count}, fragments=${inventory.fragments.count}, used=${inventory.used.count}`);
