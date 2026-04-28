import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './load_local_env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const apiScript = path.join(root, 'scripts', 'materials_api.mjs');
const viteScript = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const url = 'http://127.0.0.1:5173/';

function startNode(args) {
  return spawn(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: false,
  });
}

if (!existsSync(viteScript)) {
  console.error('启动失败：缺少 node_modules。请使用完整安装包，或在项目目录运行 npm install。');
  process.exit(1);
}

const api = startNode([apiScript]);
const ui = startNode([viteScript, '--host', '127.0.0.1']);

setTimeout(() => {
  spawn('cmd', ['/c', 'start', '', url], { windowsHide: true });
}, 1800);

function shutdown() {
  api.kill();
  ui.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
