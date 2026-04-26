import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const materialRoot = path.join(root, 'local_materials');

const folders = [
  { name: 'unused', note: 'Put new source videos here. Auto-pick reads from this folder only.' },
  { name: 'fragments', note: 'Short leftovers are stored here. Auto-pick does not read this folder.' },
  { name: 'used', note: 'Used videos are moved here. These are never reused.' },
];

async function ensureMaterialFolders() {
  await mkdir(materialRoot, { recursive: true });
  for (const folder of folders) {
    const dir = path.join(materialRoot, folder.name);
    await mkdir(dir, { recursive: true });
    const readme = [
      `Folder: ${folder.name}`,
      '',
      folder.note,
      '',
      'Rule: used videos are never reused.',
      '',
    ].join('\n');
    await writeFile(path.join(dir, 'README.txt'), readme, 'utf8');
  }

  const config = {
    root: materialRoot,
    unused: path.join(materialRoot, 'unused'),
    fragments: path.join(materialRoot, 'fragments'),
    used: path.join(materialRoot, 'used'),
    rule: 'used videos are never reused',
  };
  await writeFile(path.join(materialRoot, 'material_folders.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

await ensureMaterialFolders();
console.log(`Material folders ready: ${materialRoot}`);
await import('./scan_materials.mjs');
