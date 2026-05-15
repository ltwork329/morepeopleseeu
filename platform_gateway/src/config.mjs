import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');

function loadEnvFile() {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const eq = text.indexOf('=');
    if (eq <= 0) continue;
    const key = text.slice(0, eq).trim();
    const value = text.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();

export const config = {
  root,
  port: Number(process.env.PORT || 3320),
  adminToken: String(process.env.PLATFORM_ADMIN_TOKEN || '').trim(),
  minimaxApiKey: String(process.env.MINIMAX_API_KEY || '').trim(),
  minimaxGroupId: String(process.env.MINIMAX_GROUP_ID || '').trim(),
  minimaxBaseUrl: String(process.env.MINIMAX_BASE_URL || 'https://api.minimax.io').trim(),
  minimaxTextEndpoint: String(process.env.MINIMAX_TEXT_ENDPOINT || '/v1/text/chatcompletion_v2').trim(),
  minimaxTextModel: String(process.env.MINIMAX_TEXT_MODEL || 'MiniMax-Text-01').trim(),
};

export function assertConfig() {
  const missing = [];
  if (!config.adminToken) missing.push('PLATFORM_ADMIN_TOKEN');
  if (!config.minimaxApiKey) missing.push('MINIMAX_API_KEY');
  if (!config.minimaxGroupId) missing.push('MINIMAX_GROUP_ID');
  if (missing.length) {
    throw new Error(`missing config: ${missing.join(', ')}`);
  }
}
