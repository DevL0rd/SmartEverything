import type { AutomationDefinition, RowChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let clock = Date.parse('2026-10-08T10:00:00.000Z');

beforeEach(async () => {
  captureLogs();
  clock = Date.parse('2026-10-08T10:00:00.000Z');
  opened = await testStore(() => new Date(clock));
});

afterEach(async () => {
  await opened.close();
});

const DEFINITION: AutomationDefinition = {
  triggers: [{ type: 'interval', everyMinutes: 5 }],
  conditions: { mode: 'all', items: [] },
  actions: [{ type: 'notify', message: 'tick' }],
};

function plug(): string {
  const [device] = opened.store.devices.upsert([
    {
      provider: 'tuya',
      externalId: 'blaster',
      parentId: null,
      kind: 'ir_blaster',
      name: 'Blaster',
      model: 'b',
      manufacturer: 'Tuya',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  return device?.id ?? '';
}

describe('commands', () => {
  it('stores a JSON null value, names its requester and expires two minutes later', () => {
    const { store } = opened;
    const [hub] = store.commands.insert([
      { deviceId: null, capability: 'hub:discover', value: null, source: 'app', requestedBy: null },
    ]);
    expect(hub).toMatchObject({
      value: null,
      status: 'pending',
      result: null,
      expires_at: '2026-10-08T10:02:00.000Z',
    });
    expect(() =>
      store.commands.insert([
        {
          deviceId: '0d000000-0000-4000-8000-000000000001',
          capability: 'power',
          value: true,
          source: 'app',
          requestedBy: null,
        },
      ]),
    ).toThrow('There is no device 0d000000-0000-4000-8000-000000000001.');
  });

  it('claims a command only from the status it was seen in and records each outcome', () => {
    const { store } = opened;
    const rows = store.commands.insert(
      ['a', 'b', 'c'].map(() => ({
        deviceId: null,
        capability: 'hub:discover',
        value: null,
        source: 'app' as const,
        requestedBy: null,
      })),
    );
    const [first, second, third] = rows.map((row) => row.id);
    expect(store.commands.claim(first ?? '', 'running')).toBe(false);
    expect(store.commands.claim(first ?? '', 'pending')).toBe(true);
    expect(store.commands.open().map((row) => row.status)).toStrictEqual([
      'running',
      'pending',
      'pending',
    ]);
    expect(store.commands.finish(first ?? '', { status: 'succeeded', result: [1] })).toMatchObject({
      status: 'succeeded',
      result: [1],
      error: null,
    });
    expect(store.commands.finish(second ?? '', { status: 'failed', error: 'no' })).toMatchObject({
      result: null,
      error: 'no',
    });
    expect(store.commands.finish(third ?? '', { status: 'expired' })).toMatchObject({
      status: 'expired',
      error: null,
    });
    expect(store.commands.recent(2)).toHaveLength(2);
    expect(store.commands.open()).toStrictEqual([]);
  });
});

describe('events and settings', () => {
  it('normalises event times and acknowledges once', () => {
    const { store } = opened;
    const [event] = store.events.insert([
      {
        deviceId: null,
        kind: 'automation_run',
        occurredAt: '2026-10-08T12:00:00+02:00',
        details: { a: 1 },
      },
    ]);
    expect(event?.occurred_at).toBe('2026-10-08T10:00:00.000Z');
    const first = store.events.acknowledge(event?.id ?? '');
    clock += 5000;
    expect(store.events.acknowledge(event?.id ?? '').acknowledged_at).toBe(first.acknowledged_at);
    expect(
      store.events.list({ from: '2026-10-08T10:00:00Z', to: '2026-10-08T10:00:01Z', limit: 5 }),
    ).toHaveLength(1);
    expect(store.events.list({ from: '2026-10-08T10:00:01Z', limit: 5 })).toStrictEqual([]);
  });

  it('keeps the home settings, resets verification when the public URL changes and ignores a stale check', () => {
    const { store } = opened;
    expect(store.settings.read()).toMatchObject({
      home_name: 'Home',
      time_zone: 'UTC',
      ice_servers: [],
    });
    expect(
      store.settings.updateHome({ home_name: 'Flat', latitude: 52.5, longitude: 13.4 }),
    ).toMatchObject({ home_name: 'Flat', latitude: 52.5 });
    expect(
      store.settings.updateNetwork({ webrtc_candidates: ['192.168.1.2:8555'] }).webrtc_candidates,
    ).toStrictEqual(['192.168.1.2:8555']);
    store.settings.setPublicUrl('https://a.example.com');
    expect(
      store.settings.recordPublicUrlCheck('https://a.example.com', { verified: true }),
    ).toMatchObject({
      public_url_verified_at: '2026-10-08T10:00:00.000Z',
      public_url_error: null,
    });
    store.settings.setPublicUrl('https://b.example.com');
    expect(store.settings.read().public_url_verified_at).toBeNull();
    expect(
      store.settings.recordPublicUrlCheck('https://a.example.com', { verified: true })
        .public_url_verified_at,
    ).toBeNull();
    expect(
      store.settings.recordPublicUrlCheck('https://b.example.com', {
        verified: false,
        reason: 'HTTP 502',
      }),
    ).toMatchObject({
      public_url_error: 'HTTP 502',
      public_url_checked_at: '2026-10-08T10:00:00.000Z',
    });
    expect(store.settings.setPushProject('home-push').push_project_id).toBe('home-push');
  });
});

describe('clients and pairing', () => {
  it('protects the desktop owner and refuses to unpair or demote it', () => {
    const { store } = opened;
    const owner = store.clients.create(
      { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
      true,
    );
    expect(store.clients.owner()?.id).toBe(owner.id);
    expect(() => store.clients.update(owner.id, { role: 'member' })).toThrow(
      'the desktop owner cannot become a member',
    );
    expect(() => {
      store.clients.remove(owner.id);
    }).toThrow('the desktop owner cannot be unpaired');
    const phone = store.clients.create({
      name: 'Pixel',
      platform: 'android',
      role: 'member',
      tokenHash: 'b',
    });
    expect(store.clients.update(phone.id, { name: 'Pixel 9' }).name).toBe('Pixel 9');
    store.clients.remove(phone.id);
    expect(store.clients.list().map((client) => client.id)).toStrictEqual([owner.id]);
    store.clients.replaceToken(owner.id, 'c');
    expect(store.clients.byTokenHash('a')).toBeUndefined();
    expect(store.clients.byTokenHash('c')?.id).toBe(owner.id);
  });

  it('notes when a client was last seen at most once a minute', () => {
    const { store } = opened;
    const seen: RowChange[] = [];
    const phone = store.clients.create({
      name: 'Pixel',
      platform: 'android',
      role: 'member',
      tokenHash: 'b',
    });
    store.feed.subscribe((change) => seen.push(change));
    store.clients.seen(phone);
    const noted = store.clients.byId(phone.id);
    clock += 30_000;
    store.clients.seen(noted);
    clock += 31_000;
    store.clients.seen(noted);
    expect(
      seen.map((change) => (change.table === 'clients' ? change.record?.last_seen_at : null)),
    ).toStrictEqual(['2026-10-08T10:00:00.000Z', '2026-10-08T10:01:01.000Z']);
  });

  it('claims a pairing code once and only before it expires', () => {
    const { store } = opened;
    const owner = store.clients.create(
      { name: 'Desk', platform: 'desktop', role: 'owner', tokenHash: 'a' },
      true,
    );
    store.clients.addPairing('h1', 'member', owner.id, '2026-10-08T10:10:00.000Z');
    store.clients.addPairing('h2', 'owner', owner.id, '2026-10-08T10:00:00.000Z');
    expect(store.clients.claimPairing('nope')).toStrictEqual({ claimed: false, reason: 'unknown' });
    expect(store.clients.claimPairing('h2')).toStrictEqual({ claimed: false, reason: 'expired' });
    expect(store.clients.claimPairing('h1')).toStrictEqual({ claimed: true, role: 'member' });
    expect(store.clients.claimPairing('h1')).toStrictEqual({ claimed: false, reason: 'used' });
    expect(store.clients.forgetPairingsBefore('2026-10-08T10:05:00.000Z')).toBe(1);
  });
});

describe('scenes, automations, remotes and personal settings', () => {
  it('orders scenes and keeps a scene change to what was named', () => {
    const { store } = opened;
    const a = store.scenes.create({ name: 'A', icon: 'sun', actions: [], position: 0 });
    const b = store.scenes.create({ name: 'B', icon: 'moon', actions: [], position: 1 });
    expect(store.scenes.order([b.id, a.id]).map((scene) => scene.name)).toStrictEqual(['B', 'A']);
    expect(store.scenes.update(a.id, { icon: 'star' })).toMatchObject({ name: 'A', icon: 'star' });
    store.scenes.remove(a.id);
    expect(store.scenes.list().map((scene) => scene.id)).toStrictEqual([b.id]);
  });

  it('clears the last error of an automation only when its definition changes', () => {
    const { store } = opened;
    const rule = store.automations.create({ name: 'Rule', enabled: true, definition: DEFINITION });
    store.automations.recordRun(rule.id, {
      lastError: 'boom',
      lastRunAt: '2026-10-08T10:00:00.000Z',
      runCount: 1,
    });
    expect(store.automations.update(rule.id, { enabled: false })).toMatchObject({
      enabled: false,
      last_error: 'boom',
      run_count: 1,
    });
    expect(store.automations.update(rule.id, { definition: DEFINITION }).last_error).toBe('boom');
    const redefined: AutomationDefinition = {
      ...DEFINITION,
      actions: [{ type: 'notify', message: 'tock' }],
    };
    expect(
      store.automations.update(rule.id, { definition: redefined, name: 'Rule 2' }),
    ).toMatchObject({ last_error: null, name: 'Rule 2' });
    store.automations.remove(rule.id);
    expect(store.automations.list()).toStrictEqual([]);
  });

  it('replaces the code of a button and removes a remote with its codes', () => {
    const { store } = opened;
    const remote = store.infrared.addRemote({
      blaster_id: plug(),
      name: 'TV',
      category: 'tv',
      brand: 'Samsung',
    });
    const first = store.infrared.saveCode({
      remote_id: remote.id,
      button: 'power',
      format: 'pulses',
      code: '1,2',
    });
    const second = store.infrared.saveCode({
      remote_id: remote.id,
      button: 'power',
      format: 'head_key',
      code: 'k',
    });
    expect(second).toMatchObject({ id: first.id, format: 'head_key', code: 'k' });
    const seen: string[] = [];
    store.feed.subscribe((change) => seen.push(`${change.table}:${change.operation}`));
    store.infrared.removeRemote(remote.id);
    expect(seen).toStrictEqual(['ir_codes:DELETE', 'ir_remotes:DELETE']);
    expect(store.infrared.codes()).toStrictEqual([]);
  });

  it('keeps layouts per client and lets only the owning client forget its push token', () => {
    const { store } = opened;
    const phone = store.clients.create({
      name: 'Pixel',
      platform: 'android',
      role: 'member',
      tokenHash: 'b',
    });
    const other = store.clients.create({
      name: 'Tab',
      platform: 'android',
      role: 'member',
      tokenHash: 'c',
    });
    store.personal.saveLayout(phone.id, 'home', { a: 1 });
    expect(store.personal.saveLayout(phone.id, 'home', { a: 2 }).layout).toStrictEqual({ a: 2 });
    expect(store.personal.layout(other.id, 'home')).toBeUndefined();
    store.personal.savePushTarget('fcm-1', phone.id, 'android');
    expect(() => {
      store.personal.removePushTarget('fcm-1', other.id);
    }).toThrow('it belongs to another client');
    store.personal.removePushTarget('fcm-1', phone.id);
    expect(store.personal.pushTargets()).toStrictEqual([]);
  });

  it('revokes MCP tokens and OAuth grants', () => {
    const { store } = opened;
    const token = store.assistant.createToken('Claude', 'hash-1');
    expect(store.assistant.activeTokenByHash('hash-1')?.id).toBe(token.id);
    expect(store.assistant.revokeToken(token.id).revoked_at).toBe('2026-10-08T10:00:00.000Z');
    expect(store.assistant.activeTokenByHash('hash-1')).toBeUndefined();
    expect(store.assistant.tokens()).toHaveLength(1);
    expect(store.assistant.grants()).toStrictEqual([]);
    expect(() => {
      store.assistant.revokeGrant('nobody');
    }).toThrow('There is no OAuth client nobody.');
  });
});
