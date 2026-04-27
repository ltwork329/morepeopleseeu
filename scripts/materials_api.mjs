import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import './load_local_env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const initScript = path.join(root, 'scripts', 'materials_init.mjs');
const scanScript = path.join(root, 'scripts', 'scan_materials.mjs');
const materialRoot = path.join(root, 'local_materials');
const generatedAudioDir = path.join(root, 'public', 'generated_audio');
const generatedVideoDir = path.join(root, 'public', 'generated_videos');
const generatedSubtitleDir = path.join(root, 'public', 'generated_subtitles');
const sourceBackupDir = path.join(materialRoot, 'source_backup');
const bucketDirs = {
  unused: path.join(materialRoot, 'unused'),
  fragments: path.join(materialRoot, 'fragments'),
  used: path.join(materialRoot, 'used'),
};

const host = '127.0.0.1';
const port = 3210;

function runInit() {
  return runNodeScript(initScript);
}

function runScan() {
  return runNodeScript(scanScript);
}

function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [scriptPath], { cwd: root, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(String(stdout || '').trim());
    });
  });
}

function openFolder(folderPath) {
  if (process.platform === 'win32') {
    execFile('explorer.exe', [folderPath], { windowsHide: true }, () => {});
  }
}

function writeJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(`${JSON.stringify(payload)}\n`);
}

async function readJsonBody(req, maxSize = 100 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxSize) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error(`invalid json: ${error.message}`));
      }
    });
    req.on('error', (error) => reject(error));
  });
}

async function loadInventory() {
  const inventoryPath = path.join(materialRoot, 'material_inventory.json');
  const raw = await readFile(inventoryPath, 'utf8');
  return JSON.parse(raw);
}

function buildFileUrl(fileName, bucketName) {
  const params = new URLSearchParams({
    bucket: bucketName,
    name: fileName,
  });
  return `http://${host}:${port}/api/materials/video?${params.toString()}`;
}

function resolveVideoPath(searchParams) {
  const bucketName = String(searchParams.get('bucket') || '');
  const fileName = String(searchParams.get('name') || '');
  const bucketPath = bucketDirs[bucketName];
  if (!bucketPath) {
    throw new Error('invalid bucket');
  }
  if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    throw new Error('invalid file');
  }
  return {
    filePath: path.join(bucketPath, fileName),
    fileName,
  };
}

function streamVideo(req, res, filePath) {
  const range = req.headers.range;
  try {
    const stats = statSync(filePath);
    const total = stats.size;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(String(range));
      const start = match && match[1] ? Number(match[1]) : 0;
      const end = match && match[2] ? Number(match[2]) : total - 1;
      const safeStart = Number.isFinite(start) ? start : 0;
      const safeEnd = Number.isFinite(end) ? Math.min(end, total - 1) : total - 1;
      res.writeHead(206, {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${safeStart}-${safeEnd}/${total}`,
        'Content-Length': safeEnd - safeStart + 1,
        'Access-Control-Allow-Origin': '*',
      });
      createReadStream(filePath, { start: safeStart, end: safeEnd }).pipe(res);
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': total,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
    });
    createReadStream(filePath).pipe(res);
  } catch {
    writeJson(res, 500, { ok: false, error: 'stream failed' });
  }
}

function minimaxApiKey() {
  const key = String(process.env.MINIMAX_API_KEY || '').trim();
  if (!key) {
    throw new Error('MINIMAX_API_KEY missing');
  }
  return key;
}

function minimaxGroupId() {
  const groupId = String(process.env.MINIMAX_GROUP_ID || '').trim();
  if (!groupId) {
    throw new Error('MINIMAX_GROUP_ID missing');
  }
  return groupId;
}

function resolveMinimaxUrl(endpointPath, fallbackPath) {
  const base = String(process.env.MINIMAX_BASE_URL || 'https://api.minimax.io').trim();
  const endpoint = String(endpointPath || fallbackPath).trim();
  if (!endpoint) return `${base}${fallbackPath}`;
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return `${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}

function withGroupId(urlText) {
  const groupId = minimaxGroupId();
  const url = new URL(urlText);
  if (!url.searchParams.get('GroupId')) {
    url.searchParams.set('GroupId', groupId);
  }
  return url.toString();
}

function minimaxFetch(url, options = {}) {
  const timeoutS = Number.parseInt(String(process.env.MINIMAX_TIMEOUT_S || '60'), 10);
  const timeoutMs = Number.isFinite(timeoutS) && timeoutS > 0 ? timeoutS * 1000 : 60000;
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function parseMinimaxError(payload, fallback = 'MiniMax request failed') {
  if (!payload) return fallback;
  const baseResp = payload.base_resp || {};
  if (baseResp.status_msg) return baseResp.status_msg;
  if (payload.message) return payload.message;
  if (payload.error) return payload.error;
  return fallback;
}

function pickFileId(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.file?.file_id) return payload.file.file_id;
  if (payload.file_id) return payload.file_id;
  if (payload.data?.file_id) return payload.data.file_id;
  if (payload.data?.file?.file_id) return payload.data.file.file_id;
  return null;
}

function sanitizeVoiceId(name = '') {
  const raw = String(name || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^-+/, '')
    .replace(/^_+/, '');
  let base = raw || 'voice';
  if (!/^[a-zA-Z]/.test(base)) {
    base = `v_${base}`;
  }
  if (/[-_]$/.test(base)) {
    base = `${base}v`;
  }
  const stamp = Date.now().toString(36);
  const voiceId = `${base}_${stamp}`.slice(0, 60);
  return voiceId.length < 8 ? `${voiceId}_cloneid` : voiceId;
}

async function minimaxUploadFile({ fileName, mimeType, buffer, purpose = 'voice_clone' }) {
  const endpoint = withGroupId(resolveMinimaxUrl(process.env.MINIMAX_UPLOAD_ENDPOINT, '/v1/files/upload'));
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), fileName || 'sample.bin');

  const response = await minimaxFetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${minimaxApiKey()}`,
    },
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseMinimaxError(payload, `upload failed: http ${response.status}`));
  }
  if ((payload.base_resp?.status_code ?? 0) !== 0) {
    throw new Error(parseMinimaxError(payload, 'upload failed'));
  }
  const fileId = pickFileId(payload);
  if (!fileId) {
    throw new Error('upload failed: missing file_id');
  }
  return fileId;
}

function languageBoostFrom(language) {
  if (language === 'mandarin') return 'Chinese';
  if (language === 'english') return 'English';
  return 'Chinese,Yue';
}

function containsCjk(text) {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(String(text || ''));
}

function assertTextMatchesLanguage(text, language) {
  if (language === 'english' && containsCjk(text)) {
    throw new Error('English TTS requires English text. The current script contains Chinese characters.');
  }
}

function decodeAudioPayload(audio) {
  if (!audio || typeof audio !== 'string') return null;
  if (/^[0-9a-fA-F]+$/.test(audio) && audio.length % 2 === 0) {
    return Buffer.from(audio, 'hex');
  }
  try {
    return Buffer.from(audio, 'base64');
  } catch {
    return null;
  }
}

async function writeGeneratedAudio({ itemNumber, ext, bytes }) {
  await mkdir(generatedAudioDir, { recursive: true });
  const safeExt = String(ext || 'mp3').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'mp3';
  const safeName = String(itemNumber || `audio_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeName}_${Date.now()}.${safeExt}`;
  const filePath = path.join(generatedAudioDir, fileName);
  await writeFile(filePath, bytes);
  return {
    fileName,
    url: `/generated_audio/${fileName}`,
  };
}

async function writeGeneratedSubtitles({ audioFileName, chunks }) {
  await mkdir(generatedSubtitleDir, { recursive: true });
  const baseName = path.basename(audioFileName, path.extname(audioFileName));
  const fileName = `${baseName}.json`;
  const filePath = path.join(generatedSubtitleDir, fileName);
  await writeFile(filePath, `${JSON.stringify({ chunks }, null, 2)}\n`, 'utf8');
  return `/generated_subtitles/${fileName}`;
}

function safeFolderName(name, fallback = 'batch_videos') {
  const text = String(name || '').trim() || fallback;
  return text.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 80) || fallback;
}

function safeExportFileName({ itemNumber, title }) {
  const safeItem = String(itemNumber || `video_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeTitle = String(title || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 40);
  return `${safeItem}${safeTitle ? `_${safeTitle}` : ''}.mp4`;
}

function toSafeFileName(name, fallback = 'sample.bin') {
  const text = String(name || '').trim();
  if (!text) return fallback;
  return text.replace(/[\\/:*?"<>|]/g, '_');
}

function extFromName(name) {
  return path.extname(String(name || '')).toLowerCase();
}

function isDirectAudioSupported(fileName, mimeType) {
  const ext = extFromName(fileName);
  const audioExt = new Set(['.mp3', '.wav', '.m4a']);
  if (audioExt.has(ext)) return true;
  const mime = String(mimeType || '').toLowerCase();
  return mime.startsWith('audio/');
}

function runExecFile(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(String(stdout || '').trim());
    });
  });
}

function runExecCapture(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        error: error ? new Error(stderr || error.message) : null,
      });
    });
  });
}

function resolvePublicFile(relUrl, expectedPrefix) {
  const text = String(relUrl || '').trim();
  if (!text || !text.startsWith(expectedPrefix)) {
    throw new Error(`invalid path: ${expectedPrefix}`);
  }
  const normalized = text.replace(/^\/+/, '');
  const fullPath = path.join(root, 'public', normalized);
  const publicRoot = path.join(root, 'public');
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(publicRoot))) {
    throw new Error('invalid path');
  }
  if (!existsSync(resolved)) {
    throw new Error('file not found');
  }
  return resolved;
}

function pickFontPath() {
  const candidates = [
    process.env.SUBTITLE_FONT_PATH,
    'C:/Windows/Fonts/msyh.ttc',
    'C:/Windows/Fonts/msyh.ttf',
    'C:/Windows/Fonts/simhei.ttf',
  ].filter(Boolean);
  return candidates.find((it) => existsSync(it)) || '';
}

function escapeDrawText(input) {
  return String(input || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\n/g, ' ');
}

function escapeFilterPath(input) {
  return String(input || '')
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function parseDurationSeconds(raw) {
  const m = String(raw || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!m) return 0;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  if (![hh, mm, ss].every((n) => Number.isFinite(n))) return 0;
  return hh * 3600 + mm * 60 + ss;
}

async function getMediaDurationSeconds(filePath) {
  if (!ffmpegPath) throw new Error('ffmpeg not available');
  const probe = await runExecCapture(ffmpegPath, ['-i', filePath]);
  const merged = `${probe.stdout}\n${probe.stderr}`;
  const seconds = parseDurationSeconds(merged);
  if (!seconds) throw new Error('failed to detect media duration');
  return seconds;
}

function extNameSafe(name, fallback = '.mp4') {
  const ext = path.extname(String(name || '')).toLowerCase();
  return ext || fallback;
}

function secondsFromSubtitleValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number > 100 ? number / 1000 : number;
}

function textFromSubtitleEntry(entry) {
  return String(entry?.text ?? entry?.subtitle ?? entry?.content ?? entry?.word ?? '').trim();
}

function timedChunkFromEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const line = textFromSubtitleEntry(entry);
  if (!line) return null;
  const start = secondsFromSubtitleValue(entry.start ?? entry.start_time ?? entry.begin_time ?? entry.begin);
  const end = secondsFromSubtitleValue(entry.end ?? entry.end_time ?? entry.finish_time ?? entry.finish);
  if (start === null || end === null || end <= start) return null;
  const wrapped = line.length > 8 ? `${line.slice(0, 8)}\n${line.slice(8, 16)}`.trim() : line;
  return { line: wrapped, start, end };
}

function collectTimedSubtitleChunks(payload) {
  const chunks = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) {
        const chunk = timedChunkFromEntry(item);
        if (chunk) chunks.push(chunk);
        visit(item);
      }
      return;
    }
    if (typeof value === 'object') {
      for (const item of Object.values(value)) {
        visit(item);
      }
    }
  };
  visit(payload);
  const unique = [];
  const seen = new Set();
  for (const chunk of chunks.sort((a, b) => a.start - b.start)) {
    const key = `${chunk.start.toFixed(3)}:${chunk.end.toFixed(3)}:${chunk.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(chunk);
  }
  return unique;
}

async function loadGeneratedSubtitleChunks(audioUrl) {
  const audioPath = resolvePublicFile(audioUrl, '/generated_audio/');
  const audioFileName = path.basename(audioPath);
  const subtitlePath = path.join(generatedSubtitleDir, `${path.basename(audioFileName, path.extname(audioFileName))}.json`);
  if (!existsSync(subtitlePath)) {
    throw new Error('missing real subtitle timestamps; regenerate audio first');
  }
  const payload = JSON.parse(await readFile(subtitlePath, 'utf8'));
  const chunks = Array.isArray(payload?.chunks) ? payload.chunks.map(timedChunkFromEntry).filter(Boolean) : [];
  if (!chunks.length) {
    throw new Error('real subtitle timestamps are empty; regenerate audio first');
  }
  return chunks;
}
function createBucketFileName(baseName, suffix, ext) {
  const safeBase = String(baseName || 'material').replace(/[\\/:*?"<>|]/g, '_');
  return `${safeBase}_${suffix}_${Date.now()}${ext}`;
}

function normalizeMaterialBaseName(fileName) {
  const ext = extNameSafe(fileName);
  let base = path.basename(fileName, ext).replace(/[\\/:*?"<>|]/g, '_');
  base = base
    .replace(/_(used|frag|unused|src)_\d+$/i, '')
    .replace(/_\d{10,}$/g, '');
  return base || 'material';
}

async function createClip({ sourcePath, start, duration, outputPath }) {
  await runExecFile(ffmpegPath, [
    '-y',
    '-ss',
    `${Math.max(0, start)}`,
    '-i',
    sourcePath,
    '-t',
    `${Math.max(0.1, duration)}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-an',
    outputPath,
  ]);
}

async function composeFinalVideo({
  itemNumber,
  title,
  subtitle,
  titleStyle = {},
  subtitleStyle = {},
  titleHold = '8',
  audioUrl,
  exportDir = '',
  excludedMaterialBases = new Set(),
}) {
  if (!ffmpegPath) throw new Error('ffmpeg not available');
  await runScan();
  const inventory = await loadInventory();
  const excludedBases = excludedMaterialBases instanceof Set ? excludedMaterialBases : new Set(excludedMaterialBases || []);
  const source = (inventory?.unused?.files || []).find((file) => !excludedBases.has(normalizeMaterialBaseName(file.name)));
  if (!source?.name) throw new Error('no unused materials');

  const sourceVideoPath = path.join(bucketDirs.unused, source.name);
  const sourceBase = normalizeMaterialBaseName(source.name);
  const audioPath = resolvePublicFile(audioUrl, '/generated_audio/');
  const audioDuration = await getMediaDurationSeconds(audioPath);
  const sourceDuration = Number(source.duration || 0) || await getMediaDurationSeconds(sourceVideoPath);
  const targetDuration = Math.max(2, Math.min(audioDuration + 1, sourceDuration));
  const remainingDuration = Math.max(0, sourceDuration - targetDuration);

  await mkdir(generatedVideoDir, { recursive: true });
  const safeItem = String(itemNumber || `video_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const outputName = `${safeItem}_${Date.now()}.mp4`;
  const outputPath = path.join(generatedVideoDir, outputName);

  const fontPath = pickFontPath();
  const previewBaseWidth = 390;
  const outputWidth = 1080;
  const styleScale = outputWidth / previewBaseWidth;
  const titleSize = Math.max(18, Math.round(Number(titleStyle.size || 64) * styleScale));
  const subtitleSize = Math.max(16, Math.round(Number(subtitleStyle.size || 42) * styleScale));
  const titleX = Math.max(5, Math.min(95, Number(titleStyle.x || 50)));
  const titleY = Math.max(5, Math.min(95, Number(titleStyle.y || 18)));
  const subtitleX = Math.max(5, Math.min(95, Number(subtitleStyle.x || 50)));
  const subtitleY = Math.max(5, Math.min(95, Number(subtitleStyle.y || 78)));
  const titleColor = String(titleStyle.color || '#ffffff').replace('#', '0x');
  const subtitleColor = String(subtitleStyle.color || '#ffffff').replace('#', '0x');
  const titleText = String(title || '').replace(/\r?\n/g, ' ').trim();
  const subtitleText = String(subtitle || '').replace(/\r?\n/g, ' ').trim();
  const titleXExpr = `(w-text_w)*${(titleX / 100).toFixed(4)}`;
  const titleYExpr = `(h-text_h)*${(titleY / 100).toFixed(4)}`;
  const subtitleXExpr = `(w-text_w)*${(subtitleX / 100).toFixed(4)}`;
  const subtitleYExpr = `(h-text_h)*${(subtitleY / 100).toFixed(4)}`;
  const titleHoldSec = titleHold === 'always' ? null : Math.max(0.5, Number(titleHold) || 8);

  const drawBase = [
    'scale=1080:1920:force_original_aspect_ratio=increase',
    'crop=1080:1920',
  ];
  const textFilters = [];
  const textTempDir = await mkdtemp(path.join(os.tmpdir(), 'compose-text-'));
  try {
    if (titleText) {
      const titleTextPath = path.join(textTempDir, 'title.txt');
      await writeFile(titleTextPath, titleText, 'utf8');
      const titleArgs = [
        `textfile='${escapeFilterPath(titleTextPath)}'`,
        `fontsize=${titleSize}`,
        `fontcolor=${titleColor}`,
        `x=${titleXExpr}`,
        `y=${titleYExpr}`,
      'shadowx=3',
      'shadowy=3',
      'shadowcolor=0x000000',
      ];
      if (fontPath) titleArgs.unshift(`fontfile='${escapeDrawText(fontPath)}'`);
      if (titleHoldSec) titleArgs.push(`enable='between(t,0,${titleHoldSec.toFixed(2)})'`);
      textFilters.push(`drawtext=${titleArgs.join(':')}`);
    }

    const subtitleChunks = await loadGeneratedSubtitleChunks(audioUrl);
    for (let i = 0; i < subtitleChunks.length; i += 1) {
      const chunk = subtitleChunks[i];
      const chunkPath = path.join(textTempDir, `sub_${i}.txt`);
      await writeFile(chunkPath, chunk.line, 'utf8');
      const subtitleArgs = [
        `textfile='${escapeFilterPath(chunkPath)}'`,
        `fontsize=${subtitleSize}`,
        `fontcolor=${subtitleColor}`,
        `x=${subtitleXExpr}`,
        `y=${subtitleYExpr}`,
        'shadowx=3',
        'shadowy=3',
        'shadowcolor=0x000000',
        `enable='between(t,${chunk.start.toFixed(2)},${chunk.end.toFixed(2)})'`,
      ];
      if (fontPath) subtitleArgs.unshift(`fontfile='${escapeDrawText(fontPath)}'`);
      textFilters.push(`drawtext=${subtitleArgs.join(':')}`);
    }

    const vf = [...drawBase, ...textFilters].join(',');
    await runExecFile(ffmpegPath, [
      '-y',
      '-ss',
      '0',
      '-i',
      sourceVideoPath,
      '-i',
      audioPath,
      '-t',
      `${targetDuration}`,
      '-vf',
      vf,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      outputPath,
    ]);
  } finally {
    await rm(textTempDir, { recursive: true, force: true });
  }

  const ext = extNameSafe(source.name);
  const base = normalizeMaterialBaseName(source.name);
  const usedName = createBucketFileName(base, 'used', ext);
  const usedPath = path.join(bucketDirs.used, usedName);
  await createClip({
    sourcePath: sourceVideoPath,
    start: 0,
    duration: targetDuration,
    outputPath: usedPath,
  });

  let remainderName = '';
  let remainderBucket = '';
  if (remainingDuration > 0.3) {
    remainderBucket = remainingDuration < 40 ? 'fragments' : 'unused';
    remainderName = createBucketFileName(base, remainderBucket === 'fragments' ? 'frag' : 'unused', ext);
    const remainderPath = path.join(bucketDirs[remainderBucket], remainderName);
    await createClip({
      sourcePath: sourceVideoPath,
      start: targetDuration,
      duration: remainingDuration,
      outputPath: remainderPath,
    });
  }

  await mkdir(sourceBackupDir, { recursive: true });
  const backupName = createBucketFileName(base, 'src', ext);
  await copyFile(sourceVideoPath, path.join(sourceBackupDir, backupName));
  await rm(sourceVideoPath, { force: true });
  await runScan();

  let exportPath = '';
  if (exportDir) {
    await mkdir(exportDir, { recursive: true });
    exportPath = path.join(exportDir, safeExportFileName({ itemNumber, title }));
    await copyFile(outputPath, exportPath);
  }

  return {
    videoUrl: `/generated_videos/${outputName}`,
    outputPath,
    exportPath,
    usedMaterial: usedName,
    sourceMaterial: source.name,
    sourceBase,
    duration: targetDuration,
    remainingDuration,
    remainderBucket,
    remainderName,
    previewUrl: buildFileUrl(usedName, 'used'),
  };
}

async function prepareCloneSample({ fileName, mimeType, buffer }) {
  if (isDirectAudioSupported(fileName, mimeType)) {
    return {
      fileName: toSafeFileName(fileName || 'sample.mp3'),
      mimeType: mimeType || 'audio/mpeg',
      buffer,
    };
  }

  if (!ffmpegPath) {
    throw new Error('当前样本不是可直传音频，且本地 ffmpeg 不可用');
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'minimax-clone-'));
  const inputName = toSafeFileName(fileName || 'sample.bin');
  const inputPath = path.join(tempDir, inputName);
  const outputPath = path.join(tempDir, 'converted.wav');
  try {
    await writeFile(inputPath, buffer);
    await runExecFile(ffmpegPath, [
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '24000',
      '-f',
      'wav',
      outputPath,
    ]);
    const converted = await readFile(outputPath);
    return {
      fileName: 'converted.wav',
      mimeType: 'audio/wav',
      buffer: converted,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

const server = createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://${host}:${port}`);

  if (req.method === 'OPTIONS') {
    writeJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/api/materials/init') {
    try {
      const output = await runInit();
      writeJson(res, 200, { ok: true, output });
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/api/materials/scan') {
    try {
      const output = await runScan();
      writeJson(res, 200, { ok: true, output });
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/api/batch/folders') {
    try {
      const body = await readJsonBody(req);
      const folderName = safeFolderName(body.folderName || `batch_${Date.now()}_videos`);
      const exportDir = path.join(os.homedir(), 'Desktop', folderName);
      await mkdir(bucketDirs.unused, { recursive: true });
      await mkdir(exportDir, { recursive: true });
      openFolder(bucketDirs.unused);
      openFolder(exportDir);
      writeJson(res, 200, {
        ok: true,
        materialDir: bucketDirs.unused,
        exportDir,
      });
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'GET' && parsedUrl.pathname === '/api/materials/first-frame') {
    try {
      const inventory = await loadInventory();
      const first = inventory?.unused?.files?.[0] || null;
      if (!first) {
        writeJson(res, 404, { ok: false, error: 'no unused materials' });
        return;
      }
      writeJson(res, 200, {
        ok: true,
        fileName: first.name,
        duration: first.duration || 0,
        url: buildFileUrl(first.name, 'unused'),
      });
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'GET' && parsedUrl.pathname === '/api/materials/video') {
    try {
      const { filePath } = resolveVideoPath(parsedUrl.searchParams);
      streamVideo(req, res, filePath);
    } catch (error) {
      writeJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/api/minimax/clone-voice') {
    try {
      const body = await readJsonBody(req);
      const voiceName = String(body.voiceName || '').trim();
      const fileName = String(body.fileName || '').trim();
      const mimeType = String(body.mimeType || '').trim() || 'application/octet-stream';
      const dataBase64 = String(body.dataBase64 || '').trim();
      if (!voiceName) throw new Error('voiceName required');
      if (!dataBase64) throw new Error('voice sample required');

      const fileBuffer = Buffer.from(dataBase64, 'base64');
      const prepared = await prepareCloneSample({
        fileName: fileName || 'voice_sample.bin',
        mimeType,
        buffer: fileBuffer,
      });
      const sourceFileId = await minimaxUploadFile({
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
        buffer: prepared.buffer,
        purpose: 'voice_clone',
      });

      const cloneEndpoint = resolveMinimaxUrl(process.env.MINIMAX_VOICE_CLONE_ENDPOINT, '/v1/voice_clone');
      const voiceId = sanitizeVoiceId(voiceName);
      const clonePayload = {
        file_id: sourceFileId,
        voice_id: voiceId,
        model: process.env.MINIMAX_TTS_MODEL || 'speech-2.8-hd',
        language_boost: 'Chinese,Yue',
        need_noise_reduction: false,
        need_volume_normalization: false,
      };

      const cloneResponse = await minimaxFetch(withGroupId(cloneEndpoint), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${minimaxApiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(clonePayload),
      });
      const cloneResult = await cloneResponse.json().catch(() => ({}));
      if (!cloneResponse.ok) {
        throw new Error(parseMinimaxError(cloneResult, `clone failed: http ${cloneResponse.status}`));
      }
      if ((cloneResult.base_resp?.status_code ?? 0) !== 0) {
        throw new Error(parseMinimaxError(cloneResult, 'clone failed'));
      }

      writeJson(res, 200, {
        ok: true,
        voiceId,
        sourceFileId,
        demoAudio: cloneResult.demo_audio || '',
      });
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/api/minimax/delete-voice') {
    try {
      const body = await readJsonBody(req);
      const voiceId = String(body.voiceId || '').trim();
      if (!voiceId) throw new Error('voiceId required');

      const deleteEndpoint = resolveMinimaxUrl(process.env.MINIMAX_VOICE_DELETE_ENDPOINT, '/v1/delete_voice');
      const payload = {
        voice_id: voiceId,
      };
      const response = await fetch(deleteEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${minimaxApiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voice_type: String(body.voiceType || 'voice_cloning'),
          ...payload,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(parseMinimaxError(result, `delete voice failed: http ${response.status}`));
      }
      if ((result.base_resp?.status_code ?? 0) !== 0) {
        throw new Error(parseMinimaxError(result, 'delete voice failed'));
      }
      writeJson(res, 200, { ok: true, voiceId });
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/api/minimax/tts') {
    try {
      const body = await readJsonBody(req);
      const text = String(body.text || '').trim();
      const language = String(body.language || 'yue').trim();
      const voiceId = String(body.voiceId || process.env.MINIMAX_VOICE_ID || '').trim();
      const itemNumber = String(body.itemNumber || `audio_${Date.now()}`);
      if (!text) throw new Error('text required');
      if (!voiceId) throw new Error('voiceId required');
      assertTextMatchesLanguage(text, language);

      const ttsEndpoint = resolveMinimaxUrl(process.env.MINIMAX_TTS_ENDPOINT, '/v1/t2a_v2');
      const audioFormat = String(process.env.MINIMAX_AUDIO_FORMAT || 'mp3').trim() || 'mp3';
      const sampleRate = Number.parseInt(String(process.env.MINIMAX_SAMPLE_RATE || '24000'), 10);
      const ttsPayload = {
        model: process.env.MINIMAX_TTS_MODEL || 'speech-2.8-hd',
        text,
        stream: false,
        output_format: 'hex',
        subtitle_enable: true,
        language_boost: languageBoostFrom(language),
        english_normalization: language === 'english',
        voice_setting: {
          voice_id: voiceId,
          speed: 1,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: Number.isFinite(sampleRate) ? sampleRate : 24000,
          bitrate: 128000,
          format: audioFormat,
          channel: 1,
        },
      };

      const ttsResponse = await minimaxFetch(withGroupId(ttsEndpoint), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${minimaxApiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ttsPayload),
      });
      const ttsResult = await ttsResponse.json().catch(() => ({}));
      if (!ttsResponse.ok) {
        throw new Error(parseMinimaxError(ttsResult, `tts failed: http ${ttsResponse.status}`));
      }
      if ((ttsResult.base_resp?.status_code ?? 0) !== 0) {
        throw new Error(parseMinimaxError(ttsResult, 'tts failed'));
      }

      let audioBytes = null;
      let source = 'hex';
      if (ttsResult.data?.audio) {
        audioBytes = decodeAudioPayload(ttsResult.data.audio);
      } else if (ttsResult.data?.audio_url || ttsResult.data?.url) {
        const remoteUrl = String(ttsResult.data.audio_url || ttsResult.data.url);
        const fileResponse = await fetch(remoteUrl);
        if (!fileResponse.ok) throw new Error('tts audio url fetch failed');
        audioBytes = Buffer.from(await fileResponse.arrayBuffer());
        source = 'url';
      }
      if (!audioBytes || !audioBytes.length) {
        throw new Error('tts success but no audio returned');
      }

      const subtitleChunks = collectTimedSubtitleChunks(ttsResult);
      if (!subtitleChunks.length) {
        throw new Error('tts succeeded but no real subtitle timestamps returned');
      }

      const audioFile = await writeGeneratedAudio({
        itemNumber,
        ext: audioFormat,
        bytes: audioBytes,
      });
      const subtitleUrl = await writeGeneratedSubtitles({
        audioFileName: audioFile.fileName,
        chunks: subtitleChunks,
      });

      writeJson(res, 200, {
        ok: true,
        audioUrl: audioFile.url,
        subtitleUrl,
        traceId: ttsResult.trace_id || '',
        source,
        voiceId,
        subtitleCount: subtitleChunks.length,
      });
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/api/compose/render') {
    try {
      const body = await readJsonBody(req);
      const result = await composeFinalVideo({
        itemNumber: String(body.itemNumber || `video_${Date.now()}`),
        title: String(body.title || ''),
        subtitle: String(body.subtitle || ''),
        titleStyle: body.titleStyle || {},
        subtitleStyle: body.subtitleStyle || {},
        titleHold: String(body.titleHold || '8'),
        audioUrl: String(body.audioUrl || ''),
      });
      writeJson(res, 200, { ok: true, ...result });
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/api/compose/batch-render') {
    try {
      const body = await readJsonBody(req);
      const tasks = Array.isArray(body.tasks) ? body.tasks : [];
      if (!tasks.length) throw new Error('batch tasks required');
      const folderName = safeFolderName(body.folderName || `batch_${Date.now()}`);
      const exportDir = path.join(os.homedir(), 'Desktop', folderName);
      const usedBases = new Set();
      const results = [];
      await runScan();
      const inventory = await loadInventory();
      const uniqueMaterialBases = new Set((inventory?.unused?.files || []).map((file) => normalizeMaterialBaseName(file.name)));
      if (uniqueMaterialBases.size < tasks.length) {
        throw new Error(`not enough unique unused materials: need ${tasks.length}, got ${uniqueMaterialBases.size}`);
      }

      for (const task of tasks) {
        const result = await composeFinalVideo({
          itemNumber: String(task.itemNumber || `video_${Date.now()}`),
          title: String(task.title || ''),
          subtitle: String(task.subtitle || ''),
          titleStyle: task.titleStyle || {},
          subtitleStyle: task.subtitleStyle || {},
          titleHold: String(task.titleHold || '8'),
          audioUrl: String(task.audioUrl || ''),
          exportDir,
          excludedMaterialBases: usedBases,
        });
        usedBases.add(result.sourceBase);
        results.push({
          taskId: String(task.id || ''),
          ...result,
        });
      }

      writeJson(res, 200, {
        ok: true,
        exportDir,
        results,
      });
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  writeJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(port, host, () => {
  console.log(`Materials API ready: http://${host}:${port}`);
});
