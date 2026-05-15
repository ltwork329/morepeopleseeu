import { chargeTenant, getTenant } from './billing.mjs';
import { config } from './config.mjs';
import { loadSessions, newId, nowIso, saveSessions } from './store.mjs';

function minimaxTextUrl() {
  const endpoint = config.minimaxTextEndpoint.startsWith('http')
    ? config.minimaxTextEndpoint
    : `${config.minimaxBaseUrl}${config.minimaxTextEndpoint.startsWith('/') ? config.minimaxTextEndpoint : `/${config.minimaxTextEndpoint}`}`;
  const url = new URL(endpoint);
  if (!url.searchParams.get('GroupId')) url.searchParams.set('GroupId', config.minimaxGroupId);
  return url.toString();
}

async function callMiniMaxText({ systemPrompt, userPrompt }) {
  const body = {
    model: config.minimaxTextModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    tokens_to_generate: 800,
  };
  const response = await fetch(minimaxTextUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.minimaxApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.base_resp?.status_code) {
    throw new Error(payload?.base_resp?.status_msg || payload?.message || 'minimax text request failed');
  }
  const content = payload?.choices?.[0]?.message?.content || '';
  const usage = payload?.usage || {};
  return {
    content,
    usage,
    raw: payload,
  };
}

export function createCopywritingSession({ tenantId, sourceUrl = '', extractedText = '', createdBy = 'tenant' }) {
  const tenant = getTenant(tenantId);
  if (!tenant) throw new Error('tenant not found');
  const sessions = loadSessions();
  const session = {
    sessionId: newId('copy_session'),
    tenantId,
    sourceUrl,
    extractedText,
    createdBy,
    status: 'draft',
    versions: [],
    messages: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  sessions.push(session);
  saveSessions(sessions);
  return session;
}

export function getCopywritingSession(sessionId) {
  return loadSessions().find((item) => item.sessionId === sessionId) || null;
}

export async function generateCopywriting({ tenantId, sessionId, sourceText, requirements, createdBy = 'tenant' }) {
  const tenant = getTenant(tenantId);
  if (!tenant) throw new Error('tenant not found');
  const sessions = loadSessions();
  const index = sessions.findIndex((item) => item.sessionId === sessionId && item.tenantId === tenantId);
  if (index < 0) throw new Error('session not found');

  const systemPrompt = '你是中文短视频文案编辑。输出直接可用的口播文案，不要解释过程。';
  const userPrompt = [
    `原文案：${sourceText}`,
    `改写要求：${requirements || '更适合短视频口播，信息密度高，开头有钩子。'}`,
    '请输出：1. 标题 2. 正文口播稿',
  ].join('\n');

  const result = await callMiniMaxText({ systemPrompt, userPrompt });
  const providerCostUnits = Math.max(1, Math.ceil(Number(result.usage.total_tokens || 0) / 1000));
  const billing = chargeTenant({
    tenantId,
    bizType: 'copywriting_generate',
    providerCostUnits,
    chargeMultiplier: tenant.chargeMultiplier,
    bizId: sessionId,
    bizSnapshotJson: {
      sessionId,
      usage: result.usage,
      model: config.minimaxTextModel,
    },
    remark: 'copywriting generate',
  });

  const session = sessions[index];
  const version = {
    versionId: newId('copy_version'),
    versionNo: session.versions.length + 1,
    sourceType: 'ai_generated',
    content: result.content,
    requirementText: requirements || '',
    usage: result.usage,
    billing: {
      providerCostUnits: billing.providerCostUnits,
      tenantChargePoints: billing.tenantChargePoints,
      chargeMultiplier: billing.chargeMultiplier,
    },
    isFinal: false,
    createdBy,
    createdAt: nowIso(),
  };
  session.versions.push(version);
  session.messages.push({
    messageId: newId('copy_msg'),
    role: 'user',
    content: requirements || '',
    createdAt: nowIso(),
  });
  session.messages.push({
    messageId: newId('copy_msg'),
    role: 'assistant',
    content: result.content,
    createdAt: nowIso(),
  });
  session.status = 'generated';
  session.updatedAt = nowIso();
  sessions[index] = session;
  saveSessions(sessions);
  return { session, version };
}

export async function reviseCopywriting({ tenantId, sessionId, currentVersionId, feedback, createdBy = 'tenant' }) {
  const session = getCopywritingSession(sessionId);
  if (!session || session.tenantId !== tenantId) throw new Error('session not found');
  const currentVersion = session.versions.find((item) => item.versionId === currentVersionId);
  if (!currentVersion) throw new Error('version not found');
  return generateCopywriting({
    tenantId,
    sessionId,
    sourceText: currentVersion.content,
    requirements: feedback,
    createdBy,
  });
}
