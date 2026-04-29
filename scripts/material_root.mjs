import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function extractConfigPath(raw, key) {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, 'i');
  const match = pattern.exec(raw);
  if (!match || !match[1]) return '';
  return match[1].replace(/\\\\/g, '\\').trim();
}

export function resolveMaterialRoot(root) {
  const defaultRoot = path.join(root, 'local_materials');
  const configPath = path.join(defaultRoot, 'windows_folders.json');
  if (!existsSync(configPath)) {
    return defaultRoot;
  }

  try {
    const raw = readFileSync(configPath, 'utf8');
    const configuredRoot = extractConfigPath(raw, 'materialRoot');
    if (configuredRoot && existsSync(configuredRoot)) {
      return configuredRoot;
    }
  } catch {
    // Fall back to the bundled local_materials directory.
  }

  return defaultRoot;
}
