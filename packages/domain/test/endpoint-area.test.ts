import { describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  LIVE_TABLES,
  MCP_TOOL_AREAS,
  OPEN_OPERATIONS,
  OWNER_TABLES,
  SNAPSHOT_ONLY_AREAS,
  TABLE_AREAS,
  endpointAccessArea,
  mcpOperationArea,
} from '../src';

const DECIDED_AS_SYSTEM = [
  'readFirewall',
  'status',
  'startPairing',
  'proveHub',
  'claimPairing',
  'listClients',
  'updateClient',
  'removeClient',
  'rotateOwnerToken',
  'listPersonAccess',
  'changePersonAccess',
  'revokePerson',
  'listAccessAudit',
  'hubIdentity',
  'listMcpTokens',
  'createMcpToken',
  'revokeMcpToken',
  'listOAuthGrants',
  'revokeOAuthGrant',
  'createApprovalCode',
  'updateMcpTools',
  'listMcpConsents',
  'decideMcpConsent',
  'checkFirewall',
];

describe('the area every app call belongs to', () => {
  it('puts device groups, targets and effects with the devices and the ear with the assistant', () => {
    expect(endpointAccessArea(API_ENDPOINTS.listDeviceGroups)).toBe('devices');
    expect(endpointAccessArea(API_ENDPOINTS.sendTargetCommands)).toBe('devices');
    expect(endpointAccessArea(API_ENDPOINTS.listDeviceEffects)).toBe('devices');
    expect(endpointAccessArea(API_ENDPOINTS.readListening)).toBe('assistant');
    expect(endpointAccessArea(API_ENDPOINTS.sendCommand)).toBe('control');
  });

  it('leaves what every paired app needs outside any area', () => {
    for (const name of OPEN_OPERATIONS) {
      expect(endpointAccessArea(API_ENDPOINTS[name])).toBeNull();
    }
    expect(OPEN_OPERATIONS).toContain('session');
    expect(OPEN_OPERATIONS).toContain('readSnapshot');
  });

  it('gives every other member call a real area; only decided calls fall to the system area', () => {
    const fallen = Object.entries(API_ENDPOINTS)
      .filter(([name]) => !OPEN_OPERATIONS.some((open) => open === name))
      .filter(([, endpoint]) => mcpOperationArea(endpoint) === 'system')
      .map(([name]) => name)
      .sort();
    expect(fallen).toStrictEqual([...DECIDED_AS_SYSTEM].sort());
  });
});

describe('the area every live table belongs to', () => {
  it('names a real area for each table that belongs to one', () => {
    for (const area of [...Object.values(TABLE_AREAS), ...Object.values(SNAPSHOT_ONLY_AREAS)]) {
      expect(MCP_TOOL_AREAS).toContain(area);
    }
  });

  it('leaves only owner tables and the tables every person needs outside any area', () => {
    const outside = LIVE_TABLES.filter((table) => TABLE_AREAS[table] === undefined)
      .filter((table) => !OWNER_TABLES.has(table))
      .sort();
    expect(outside).toStrictEqual(['exchange_rates', 'layouts', 'profiles', 'settings']);
  });
});
