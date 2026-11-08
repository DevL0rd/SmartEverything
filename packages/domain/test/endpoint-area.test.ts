import { describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  GOOGLE_SCOPE,
  GOOGLE_SCOPES,
  LIVE_TABLES,
  MCP_TOOL_AREAS,
  OPEN_OPERATIONS,
  OWNER_TABLES,
  SNAPSHOT_ONLY_AREAS,
  TABLE_AREAS,
  TEMPLATE_SCOPES,
  endpointAccessArea,
  mcpOperationArea,
} from '../src';
import { SERVED_PLANNER } from '../src/mcp/served-planner';

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
  'decideAccessRequest',
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
  'applyFirewall',
  'readMachineUpdate',
  'readHubUpdateRecovery',
  'checkHubUpdateSource',
  'startHubUpdateSource',
  'saveHubUpdateSource',
  'recoverHubUpdate',
  'readDeveloperDevice',
  'setDeveloperDevice',
  'saveWatchCaptures',
  'readWatchCaptures',
  'clearWatchCaptures',
  'dropRuntimeLogs',
  'ingestDesktopRuntimeLogs',
  'readRuntimeLogComponents',
  'readRuntimeLogGaps',
  'readRuntimeLogPlatforms',
  'readRuntimeLogSignatures',
  'readRuntimeLogSources',
  'readRuntimeLogsAround',
  'searchRuntimeLogs',
  'listAiRepairGroups',
  'dismissAiRepairGroups',
  'diagnoseAiRepairGroup',
  'proposeAiRepairPatch',
  'readAppUpdate',
  'readAppUpdateKey',
  'readAndroidAppBuild',
  'readAndroidAppBuilds',
  'readAndroidApkOffer',
  'readAndroidUpdateHistory',
  'listAppUpdates',
  'reportAppUpdate',
  'reportAndroidAppBuild',
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

describe('the planner area', () => {
  const PLANNER_TABLES = [
    'planner_collections',
    'planner_items',
    'planner_occurrences',
    'planner_alarms',
    'planner_timers',
    'planner_stopwatches',
    'google_accounts',
  ] as const;

  it('puts every planner and Google call, the planner tables and both planner tools in it', () => {
    const planner = Object.values(API_ENDPOINTS).filter(
      (endpoint) =>
        endpoint.path.startsWith('/api/planner') || endpoint.path.startsWith('/api/google'),
    );
    expect(planner.length).toBeGreaterThan(0);
    for (const endpoint of planner) {
      expect(endpointAccessArea(endpoint)).toBe('planner');
    }
    for (const table of PLANNER_TABLES) {
      expect(TABLE_AREAS[table]).toBe('planner');
    }
    expect(SERVED_PLANNER.map((tool) => tool.area)).toStrictEqual(['planner', 'planner']);
  });

  it('gives every template that is not refused the planner', () => {
    for (const template of ['owner', 'adult', 'child', 'guest'] as const) {
      expect(TEMPLATE_SCOPES[template].areas).toContain('planner');
    }
  });

  it('accepts only the Calendar and Tasks scopes of the link', () => {
    for (const scope of GOOGLE_SCOPES) {
      expect(GOOGLE_SCOPE.safeParse(scope).success).toBe(true);
    }
    expect(GOOGLE_SCOPE.safeParse('https://www.googleapis.com/auth/drive').success).toBe(false);
    expect(GOOGLE_SCOPE.safeParse('https://www.googleapis.com/auth/calendar').success).toBe(false);
  });
});
