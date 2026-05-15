import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.mjs';

const dataDir = path.join(config.root, 'data');
const files = {
  tenants: path.join(dataDir, 'tenants.json'),
  ledger: path.join(dataDir, 'ledger.json'),
  sessions: path.join(dataDir, 'copywriting_sessions.json'),
};

function ensureDataFile(filePath, fallbackValue) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${JSON.stringify(fallbackValue, null, 2)}\n`, 'utf8');
  }
}

function readJson(filePath, fallbackValue) {
  ensureDataFile(filePath, fallbackValue);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureDataFile(filePath, []);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function loadTenants() {
  return readJson(files.tenants, []);
}

export function saveTenants(data) {
  writeJson(files.tenants, data);
}

export function loadLedger() {
  return readJson(files.ledger, []);
}

export function saveLedger(data) {
  writeJson(files.ledger, data);
}

export function loadSessions() {
  return readJson(files.sessions, []);
}

export function saveSessions(data) {
  writeJson(files.sessions, data);
}
