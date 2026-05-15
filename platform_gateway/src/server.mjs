import { createServer } from 'node:http';
import { URL } from 'node:url';
import { assertConfig, config } from './config.mjs';
import { createTenant, getTenant, listLedger, listTenants, topupTenant } from './billing.mjs';
import { createCopywritingSession, generateCopywriting, getCopywritingSession, reviseCopywriting } from './copywriting.mjs';

assertConfig();

function writeJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(`${JSON.stringify(payload)}\n`);
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function requireAdmin(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== config.adminToken) {
    const error = new Error('admin unauthorized');
    error.statusCode = 401;
    throw error;
  }
}

const server = createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://127.0.0.1:${config.port}`);

  if (req.method === 'OPTIONS') {
    writeJson(res, 200, { ok: true });
    return;
  }

  try {
    if (req.method === 'GET' && parsedUrl.pathname === '/health') {
      writeJson(res, 200, { ok: true, service: 'platform-gateway' });
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/admin/tenants') {
      requireAdmin(req);
      writeJson(res, 200, { ok: true, items: listTenants() });
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/admin/tenants') {
      requireAdmin(req);
      const body = await readJsonBody(req);
      const tenant = createTenant(body);
      writeJson(res, 200, { ok: true, tenant });
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/admin/wallet/topup') {
      requireAdmin(req);
      const body = await readJsonBody(req);
      const tenant = topupTenant({
        tenantId: String(body.tenantId || '').trim(),
        points: Number(body.points || 0),
        operator: 'admin',
        remark: String(body.remark || '').trim(),
      });
      writeJson(res, 200, { ok: true, tenant });
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/admin/ledger') {
      requireAdmin(req);
      const tenantId = String(parsedUrl.searchParams.get('tenantId') || '').trim();
      writeJson(res, 200, { ok: true, items: listLedger(tenantId) });
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/tenant/me') {
      const tenantId = String(parsedUrl.searchParams.get('tenantId') || '').trim();
      const tenant = getTenant(tenantId);
      if (!tenant) {
        writeJson(res, 404, { ok: false, error: 'tenant not found' });
        return;
      }
      writeJson(res, 200, { ok: true, tenant });
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/tenant/copywriting/session') {
      const body = await readJsonBody(req);
      const session = createCopywritingSession({
        tenantId: String(body.tenantId || '').trim(),
        sourceUrl: String(body.sourceUrl || '').trim(),
        extractedText: String(body.extractedText || '').trim(),
        createdBy: String(body.createdBy || 'tenant').trim(),
      });
      writeJson(res, 200, { ok: true, session });
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/tenant/copywriting/generate') {
      const body = await readJsonBody(req);
      const result = await generateCopywriting({
        tenantId: String(body.tenantId || '').trim(),
        sessionId: String(body.sessionId || '').trim(),
        sourceText: String(body.sourceText || '').trim(),
        requirements: String(body.requirements || '').trim(),
        createdBy: String(body.createdBy || 'tenant').trim(),
      });
      writeJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/tenant/copywriting/revise') {
      const body = await readJsonBody(req);
      const result = await reviseCopywriting({
        tenantId: String(body.tenantId || '').trim(),
        sessionId: String(body.sessionId || '').trim(),
        currentVersionId: String(body.currentVersionId || '').trim(),
        feedback: String(body.feedback || '').trim(),
        createdBy: String(body.createdBy || 'tenant').trim(),
      });
      writeJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname.startsWith('/tenant/copywriting/session/')) {
      const sessionId = decodeURIComponent(parsedUrl.pathname.split('/').pop() || '');
      const session = getCopywritingSession(sessionId);
      if (!session) {
        writeJson(res, 404, { ok: false, error: 'session not found' });
        return;
      }
      writeJson(res, 200, { ok: true, session });
      return;
    }

    writeJson(res, 404, { ok: false, error: 'not found' });
  } catch (error) {
    writeJson(res, error.statusCode || 500, { ok: false, error: error.message || 'internal error' });
  }
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`Platform gateway ready: http://127.0.0.1:${config.port}`);
});
