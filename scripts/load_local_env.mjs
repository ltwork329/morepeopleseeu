import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envFile = path.join(root, 'configs', 'tts_minimax.env');

function parseEnvFile(content) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const index = text.indexOf('=');
    if (index <= 0) continue;
    const key = text.slice(0, index).trim();
    const value = text.slice(index + 1).trim();
    if (!key) continue;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

if (existsSync(envFile)) {
  const content = readFileSync(envFile, 'utf8');
  parseEnvFile(content);
}
