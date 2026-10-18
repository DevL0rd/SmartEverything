import { describe, expect, it } from 'vitest';
import {
  COMPUTER_GUARDS,
  COMPUTER_ICON_KEYS,
  COMPUTER_ROLE,
  COMPUTER_ROLE_ICONS,
  COMPUTER_ROLE_LABELS,
  COMPUTER_ROLE_MODELS,
  DEFAULT_HISTORY_POLICY,
  DEFAULT_HISTORY_SETTINGS,
  API_ENDPOINTS,
  HISTORY_BACKFILL_REQUEST,
  HISTORY_BACKFILL_RESPONSE,
  HISTORY_QUERY,
  HISTORY_SETTINGS,
  HISTORY_SETTINGS_CHANGE,
  NODE_DEMAND,
  NODE_HELLO,
  NODE_REQUEST,
  NODE_VERB_SCOPES,
  SETTINGS_ROW,
  applyHistorySettingsChange,
  computerGuardBlocks,
  computerIconKeyOfModel,
  computerRoleOfModel,
  effectiveHistoryPolicy,
  historyCapacity,
  historyClassOf,
} from '../src';

const DEVICE = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

describe('computer role', () => {
  it('has a model, label and distinct icon for each role', () => {
    expect(COMPUTER_ROLE.options).toEqual(['pc', 'hub']);
    expect(COMPUTER_ROLE_LABELS.hub).toBe('Hub');
    expect(COMPUTER_ROLE_ICONS).toEqual({ pc: 'computer', hub: 'hub' });
    expect(COMPUTER_ICON_KEYS).toEqual(['computer', 'hub']);
    expect(new Set(Object.values(COMPUTER_ROLE_MODELS)).size).toBe(2);
  });

  it('reads the role and icon from a device model', () => {
    expect(computerRoleOfModel(COMPUTER_ROLE_MODELS.hub)).toBe('hub');
    expect(computerRoleOfModel(COMPUTER_ROLE_MODELS.pc)).toBe('pc');
    expect(computerRoleOfModel('other')).toBeNull();
    expect(computerIconKeyOfModel(COMPUTER_ROLE_MODELS.hub)).toBe('hub');
    expect(computerIconKeyOfModel('other')).toBe('computer');
  });

  it('defaults a hello without a role to a pc', () => {
    const hello = NODE_HELLO.parse({
      machineId: 'a'.repeat(32),
      hostname: 'box',
      os: { name: 'Linux', kernel: '7' },
      hardware: { vendor: null, product: null, portable: false },
      cpu: { model: 'x', threads: 4, hybrid: false },
      memoryBytes: 1,
      interfaces: [],
      bootedAt: '2026-10-17T09:00:00.000Z',
    });
    expect(hello.role).toBe('pc');
    expect(NODE_HELLO.shape.role.parse('hub')).toBe('hub');
  });

  it('blocks hub power and own-service danger unless explicit', () => {
    expect(COMPUTER_GUARDS.pc.blockedPowerActions).toEqual([]);
    expect(computerGuardBlocks('hub', { kind: 'power', action: 'restart' }, false)).toBe(true);
    expect(computerGuardBlocks('hub', { kind: 'power', action: 'lock_screen' }, false)).toBe(false);
    expect(computerGuardBlocks('hub', { kind: 'own_service', operation: 'stop' }, false)).toBe(
      true,
    );
    expect(computerGuardBlocks('hub', { kind: 'own_service', operation: 'start' }, false)).toBe(
      false,
    );
    expect(computerGuardBlocks('hub', { kind: 'own_service', operation: 'stop' }, true)).toBe(
      false,
    );
    expect(computerGuardBlocks('pc', { kind: 'power', action: 'shut_down' }, false)).toBe(false);
  });
});

describe('history settings', () => {
  it('defaults to one second kept for thirty minutes in every class', () => {
    expect(DEFAULT_HISTORY_POLICY).toEqual({ interval_ms: 1000, window_ms: 1_800_000 });
    expect(HISTORY_SETTINGS.parse(DEFAULT_HISTORY_SETTINGS)).toEqual(DEFAULT_HISTORY_SETTINGS);
    expect(Object.keys(DEFAULT_HISTORY_SETTINGS.classes)).toEqual([
      'computers',
      'hub',
      'router',
      'syncthing',
      'adguard',
      'generic',
    ]);
  });

  it('accepts the interval and window limits and refuses outside them', () => {
    const policy = (interval_ms: number, window_ms: number): boolean =>
      HISTORY_SETTINGS.shape.classes.shape.hub.safeParse({ interval_ms, window_ms }).success;
    expect(policy(1000, 60_000)).toBe(true);
    expect(policy(60_000, 86_400_000)).toBe(true);
    expect(policy(999, 60_000)).toBe(false);
    expect(policy(61_000, 60_000)).toBe(false);
    expect(policy(1500, 60_000)).toBe(false);
    expect(policy(1000, 59_000)).toBe(false);
    expect(policy(1000, 86_460_000)).toBe(false);
  });

  it('carries the settings on the settings row with the defaults', () => {
    expect(SETTINGS_ROW.shape.history_settings.parse(undefined)).toEqual(DEFAULT_HISTORY_SETTINGS);
  });

  it('sorts devices into source classes', () => {
    expect(historyClassOf({ kind: 'computer', model: COMPUTER_ROLE_MODELS.hub })).toBe('hub');
    expect(historyClassOf({ kind: 'computer', model: COMPUTER_ROLE_MODELS.pc })).toBe('computers');
    expect(historyClassOf({ kind: 'router', model: 'x' })).toBe('router');
    expect(historyClassOf({ kind: 'file_sync', model: 'x' })).toBe('syncthing');
    expect(historyClassOf({ kind: 'dns_filter', model: 'x' })).toBe('adguard');
    expect(historyClassOf({ kind: 'sensor', model: 'x' })).toBe('generic');
  });

  it('lets a device override win field by field over its class', () => {
    const settings = applyHistorySettingsChange(DEFAULT_HISTORY_SETTINGS, {
      classes: { router: { interval_ms: 5000, window_ms: 3_600_000 } },
      devices: { [DEVICE]: { interval_ms: null, window_ms: 600_000 } },
    });
    expect(effectiveHistoryPolicy(settings, OTHER, 'router')).toEqual({
      interval_ms: 5000,
      window_ms: 3_600_000,
    });
    expect(effectiveHistoryPolicy(settings, DEVICE, 'router')).toEqual({
      interval_ms: 5000,
      window_ms: 600_000,
    });
    expect(effectiveHistoryPolicy(settings, OTHER, 'hub')).toEqual(DEFAULT_HISTORY_POLICY);
  });

  it('removes an override with null and keeps the rest', () => {
    const set = applyHistorySettingsChange(DEFAULT_HISTORY_SETTINGS, {
      devices: {
        [DEVICE]: { interval_ms: 2000, window_ms: null },
        [OTHER]: { interval_ms: null, window_ms: 120_000 },
      },
    });
    const cleared = applyHistorySettingsChange(set, { devices: { [DEVICE]: null } });
    expect(Object.keys(cleared.devices)).toEqual([OTHER]);
    expect(cleared.classes).toEqual(DEFAULT_HISTORY_SETTINGS.classes);
  });

  it('refuses an empty change and counts the points a window holds', () => {
    expect(HISTORY_SETTINGS_CHANGE.safeParse({}).success).toBe(false);
    expect(HISTORY_SETTINGS_CHANGE.safeParse({ devices: {} }).success).toBe(true);
    expect(historyCapacity(DEFAULT_HISTORY_POLICY)).toBe(1800);
    expect(historyCapacity({ interval_ms: 60_000, window_ms: 86_400_000 })).toBe(1440);
  });

  it('serves the change through an owner-only settings endpoint', () => {
    expect(API_ENDPOINTS.updateHistorySettings).toMatchObject({
      method: 'PATCH',
      path: '/api/settings/history',
      access: 'owner',
    });
  });
});

describe('history backfill', () => {
  const query = { topics: ['cpu'], maxPoints: 600 };

  it('asks since a moment or for a window, not both and not neither', () => {
    expect(HISTORY_QUERY.safeParse({ ...query, sinceMs: 1_000 }).success).toBe(true);
    expect(HISTORY_QUERY.safeParse({ ...query, windowMs: 300_000 }).success).toBe(true);
    expect(HISTORY_QUERY.safeParse(query).success).toBe(false);
    expect(HISTORY_QUERY.safeParse({ ...query, sinceMs: 1, windowMs: 60_000 }).success).toBe(false);
    expect(HISTORY_QUERY.safeParse({ topics: [], maxPoints: 600, windowMs: 60_000 }).success).toBe(
      false,
    );
    expect(HISTORY_QUERY.safeParse({ ...query, maxPoints: 1, windowMs: 60_000 }).success).toBe(
      false,
    );
  });

  it('names the device and source in the request', () => {
    const request = { device: DEVICE, source: 'hub', ...query, windowMs: 60_000 };
    expect(HISTORY_BACKFILL_REQUEST.safeParse(request).success).toBe(true);
    expect(HISTORY_BACKFILL_REQUEST.safeParse({ ...request, source: 'fridge' }).success).toBe(
      false,
    );
    expect(HISTORY_BACKFILL_REQUEST.safeParse({ ...query, windowMs: 60_000 }).success).toBe(false);
  });

  const response = {
    device: DEVICE,
    source: 'computers',
    intervalMs: 1000,
    windowMs: 1_800_000,
    oldestMs: 1000,
    newestMs: 3000,
    timestamps: [1000, 2000, 3000],
    series: [{ topic: 'cpu', key: 'load', unit: '%', values: [1, null, 3] }],
    downsample: { method: 'none', sourcePoints: 3, stepMs: 1000 },
  };

  it('answers columns with one value per timestamp', () => {
    expect(HISTORY_BACKFILL_RESPONSE.parse(response)).toEqual(response);
    const short = { ...response, series: [{ ...response.series[0], values: [1] }] };
    expect(HISTORY_BACKFILL_RESPONSE.safeParse(short).success).toBe(false);
  });

  it('reports downsampling and an empty history', () => {
    const thinned = {
      ...response,
      downsample: { method: 'mean', sourcePoints: 1800, stepMs: 3000 },
    };
    expect(HISTORY_BACKFILL_RESPONSE.parse(thinned).downsample.method).toBe('mean');
    const empty = {
      ...response,
      oldestMs: null,
      newestMs: null,
      timestamps: [],
      series: [],
    };
    expect(HISTORY_BACKFILL_RESPONSE.safeParse(empty).success).toBe(true);
  });

  it('serves it as a read-only member endpoint and as a metrics node verb', () => {
    expect(API_ENDPOINTS.readHistoryBackfill).toMatchObject({
      method: 'POST',
      path: '/api/history/backfill',
      access: 'member',
    });
    expect(
      NODE_REQUEST.safeParse({ verb: 'history', query: { ...query, windowMs: 60_000 } }).success,
    ).toBe(true);
    expect(NODE_VERB_SCOPES.history).toBe('metrics');
  });
});

describe('history policy on the demand frame', () => {
  it('carries the recording policy to the computer and refuses an interval off the 1 s grid', () => {
    expect(NODE_DEMAND.safeParse({ topics: {}, history: DEFAULT_HISTORY_POLICY }).success).toBe(
      true,
    );
    expect(
      NODE_DEMAND.safeParse({ topics: {}, history: { interval_ms: 1500, window_ms: 60_000 } })
        .success,
    ).toBe(false);
  });
});
