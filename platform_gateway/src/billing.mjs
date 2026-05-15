import { loadLedger, loadTenants, newId, nowIso, saveLedger, saveTenants } from './store.mjs';

function cloneTenant(tenant) {
  return JSON.parse(JSON.stringify(tenant));
}

export function listTenants() {
  return loadTenants();
}

export function getTenant(tenantId) {
  return loadTenants().find((item) => item.tenantId === tenantId) || null;
}

export function createTenant(input) {
  const tenants = loadTenants();
  if (tenants.some((item) => item.tenantId === input.tenantId)) {
    throw new Error('tenant already exists');
  }
  const tenant = {
    tenantId: input.tenantId,
    name: input.name,
    status: input.status || 'active',
    chargeMultiplier: Number(input.chargeMultiplier || 4),
    wallet: {
      balancePoints: Number(input.initialPoints || 0),
      frozenPoints: 0,
      availablePoints: Number(input.initialPoints || 0),
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  tenants.push(tenant);
  saveTenants(tenants);
  if (Number(input.initialPoints || 0) > 0) {
    addLedgerEntry({
      tenantId: tenant.tenantId,
      direction: 'credit',
      bizType: 'tenant_opening',
      providerCostUnits: 0,
      tenantChargePoints: Number(input.initialPoints || 0),
      remark: 'opening balance',
    });
  }
  return tenant;
}

export function topupTenant({ tenantId, points, operator = 'admin', remark = '' }) {
  const tenants = loadTenants();
  const index = tenants.findIndex((item) => item.tenantId === tenantId);
  if (index < 0) throw new Error('tenant not found');
  const tenant = cloneTenant(tenants[index]);
  const amount = Number(points || 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('invalid points');
  const before = tenant.wallet.balancePoints;
  tenant.wallet.balancePoints += amount;
  tenant.wallet.availablePoints += amount;
  tenant.updatedAt = nowIso();
  tenants[index] = tenant;
  saveTenants(tenants);
  addLedgerEntry({
    tenantId,
    direction: 'credit',
    bizType: 'recharge',
    providerCostUnits: 0,
    tenantChargePoints: amount,
    operator,
    remark,
    beforeBalance: before,
    afterBalance: tenant.wallet.balancePoints,
  });
  return tenant;
}

export function chargeTenant({ tenantId, bizType, providerCostUnits, chargeMultiplier, bizId, bizSnapshotJson, remark = '' }) {
  const tenants = loadTenants();
  const index = tenants.findIndex((item) => item.tenantId === tenantId);
  if (index < 0) throw new Error('tenant not found');
  const tenant = cloneTenant(tenants[index]);
  if (tenant.status !== 'active') throw new Error('tenant is not active');

  const units = Math.max(1, Number(providerCostUnits || 0));
  const multiplier = Number(chargeMultiplier || tenant.chargeMultiplier || 4);
  const tenantChargePoints = Math.ceil(units * multiplier);
  if (tenant.wallet.availablePoints < tenantChargePoints) {
    throw new Error(`insufficient points: need ${tenantChargePoints}, available ${tenant.wallet.availablePoints}`);
  }

  const before = tenant.wallet.balancePoints;
  tenant.wallet.balancePoints -= tenantChargePoints;
  tenant.wallet.availablePoints -= tenantChargePoints;
  tenant.updatedAt = nowIso();
  tenants[index] = tenant;
  saveTenants(tenants);
  addLedgerEntry({
    tenantId,
    direction: 'debit',
    bizType,
    providerCostUnits: units,
    chargeMultiplier: multiplier,
    tenantChargePoints,
    bizId,
    bizSnapshotJson,
    remark,
    beforeBalance: before,
    afterBalance: tenant.wallet.balancePoints,
  });

  return {
    tenant,
    providerCostUnits: units,
    tenantChargePoints,
    chargeMultiplier: multiplier,
  };
}

export function addLedgerEntry(entry) {
  const ledger = loadLedger();
  ledger.push({
    id: newId('ledger'),
    tenantId: entry.tenantId,
    direction: entry.direction,
    bizType: entry.bizType,
    providerCostUnits: Number(entry.providerCostUnits || 0),
    chargeMultiplier: Number(entry.chargeMultiplier || 0),
    tenantChargePoints: Number(entry.tenantChargePoints || 0),
    beforeBalance: Number(entry.beforeBalance || 0),
    afterBalance: Number(entry.afterBalance || 0),
    bizId: entry.bizId || '',
    bizSnapshotJson: entry.bizSnapshotJson || null,
    operator: entry.operator || 'system',
    remark: entry.remark || '',
    createdAt: nowIso(),
  });
  saveLedger(ledger);
  return ledger[ledger.length - 1];
}

export function listLedger(tenantId = '') {
  const ledger = loadLedger();
  return tenantId ? ledger.filter((item) => item.tenantId === tenantId) : ledger;
}
