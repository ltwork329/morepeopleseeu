import { spawn } from 'node:child_process';
import './load_local_env.mjs';

function start(command, args) {
  return spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const api = start(npmCmd, ['run', 'dev:api']);
const ui = start(npmCmd, ['run', 'dev:ui']);

function shutdown() {
  api.kill();
  ui.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
