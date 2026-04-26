import { execFile } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffprobeStatic from 'ffprobe-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const materialRoot = path.join(root, 'local_materials');
const publicRoot = path.join(root, 'public');
const videoExts = new Set(['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm']);

const buckets = {
  unused: path.join(materialRoot, 'unused'),
  fragments: path.join(materialRoot, 'fragments'),
  used: path.join(materialRoot, 'used'),
};

async function ensureFolders() {
  await mkdir(publicRoot, { recursive: true });
  await Promise.all(Object.values(buckets).map((folder) => mkdir(folder, { recursive: true })));
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

await ensureFolders();

const inventory = {
  updatedAt: new Date().toLocaleString('zh-CN'),
  root: materialRoot,
  unused: await scanBucket(buckets.unused),
  fragments: await scanBucket(buckets.fragments),
  used: await scanBucket(buckets.used),
};

const json = `${JSON.stringify(inventory, null, 2)}\n`;
await writeFile(path.join(publicRoot, 'material_inventory.json'), json, 'utf8');
await writeFile(path.join(materialRoot, 'material_inventory.json'), json, 'utf8');

console.log(`Scanned materials: ${materialRoot}`);
console.log(`unused=${inventory.unused.count}, fragments=${inventory.fragments.count}, used=${inventory.used.count}`);
