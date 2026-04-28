import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const materialRoot = path.join(root, 'local_materials');
const unusedDir = path.join(materialRoot, 'unused');
const fragmentsDir = path.join(materialRoot, 'fragments');
const usedDir = path.join(materialRoot, 'used');
const exportDir = path.join(os.homedir(), 'Desktop', '让更多人看到你_成片');
const configFile = path.join(root, 'configs', 'tts_minimax.env');
const configExample = path.join(root, 'configs', 'tts_minimax.env.example');

async function main() {
  for (const dir of [unusedDir, fragmentsDir, usedDir, exportDir, path.join(root, 'public')]) {
    await mkdir(dir, { recursive: true });
  }

  const folders = {
    materialRoot,
    unusedDir,
    fragmentsDir,
    usedDir,
    exportDir,
    note: '素材放入 unused；已用素材自动移动到 used；残片在 fragments；成片统一导出到桌面文件夹。',
  };
  await writeFile(path.join(materialRoot, 'windows_folders.json'), `${JSON.stringify(folders, null, 2)}\n`, 'utf8');

  const readme = [
    '让更多人看到你 - Windows 安装完成',
    '',
    `素材放这里：${unusedDir}`,
    `残片在这里：${fragmentsDir}`,
    `已用素材在这里：${usedDir}`,
    `成片导出到：${exportDir}`,
    '',
    existsSync(configFile)
      ? 'MiniMax 配置：已检测到 configs/tts_minimax.env。'
      : `MiniMax 配置：未检测到 configs/tts_minimax.env，请参考 ${configExample} 填写。`,
    '',
    '启动方式：双击 一键启动.bat',
    '',
  ].join('\r\n');
  await writeFile(path.join(root, '安装完成-请先看我.txt'), readme, 'utf8');

  console.log(readme);
}

main().catch((error) => {
  console.error(`安装失败：${error.message}`);
  process.exit(1);
});
