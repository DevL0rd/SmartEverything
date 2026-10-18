import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { openStore } from '../../src/store/store';
import { sweepRetention } from '../../src/store/retention';
import { AiOutreachRepository } from '../../src/store/repositories/ai-outreach';
import { AiWakesRepository } from '../../src/store/repositories/ai-wakes';
import { AppSessionsRepository } from '../../src/store/repositories/app-sessions';
import { DevicesRepository } from '../../src/store/repositories/devices';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { countedStore, type CountedStore } from '../support/counted-store';
import { captureLogs, testLogger } from '../support/logs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DAY = 86_400_000;
const DAY_ZERO = Date.parse('2026-01-01T00:00:00.000Z');
const COUNT = z.object({ count: z.number() });

let clock = DAY_ZERO;
let counted: CountedStore;
let wakes: AiWakesRepository;
let outreach: AiOutreachRepository;
let sessions: AppSessionsRepository;
let profileId: string;
let deviceId: string;

function rowsIn(table: string): number {
  return counted.sql.get(COUNT, `select count(*) as count from ${table}`)?.count ?? -1;
}

function addAt(day: number): void {
  clock = DAY_ZERO + day * DAY;
  wakes.add({
    profile_id: profileId,
    chat_id: null,
    automation_id: null,
    automation_name: 'Night',
    headline: 'Woke',
    instruction: '',
    state: 'woke',
    reason: null,
  });
  outreach.add({
    profile_id: profileId,
    chat_id: null,
    from_chat_id: null,
    how: 'camera',
    target: 'living',
    target_label: 'Living room',
    reason: 'wake',
    urgent: false,
    state: 'live',
    detail: null,
    expires_at: null,
    origin: null,
  });
  sessions.add({
    deviceId,
    appId: 'app',
    appName: 'App',
    startedAt: new Date(clock - 60_000),
    endedAt: new Date(clock),
  });
}

beforeEach(async () => {
  captureLogs();
  clock = DAY_ZERO;
  counted = await countedStore(() => new Date(clock));
  const { context } = counted;
  wakes = new AiWakesRepository(context);
  outreach = new AiOutreachRepository(context);
  sessions = new AppSessionsRepository(context);
  profileId = new ProfilesRepository(context).first().id;
  const [device] = new DevicesRepository(context).upsert([
    {
      provider: 'xiaomi',
      externalId: 'phone-1',
      parentId: null,
      kind: 'phone',
      name: 'Phone',
      model: 'p',
      manufacturer: 'x',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  deviceId = device?.id ?? '';
  [0, 60, 85].forEach(addAt);
});

afterEach(async () => {
  await counted.close();
});

describe('sweepRetention', () => {
  it('keeps every table until its rows are older than ninety days', () => {
    const removed = sweepRetention(counted.sql, new Date(DAY_ZERO + 90 * DAY));
    expect(removed).toStrictEqual({
      ai_wakes: 0,
      ai_outreach: 0,
      app_sessions: 0,
      access_audit: 0,
    });
    expect([rowsIn('ai_wakes'), rowsIn('ai_outreach'), rowsIn('app_sessions')]).toStrictEqual([
      3, 3, 3,
    ]);
  });

  it('removes only the rows past ninety days from each table', () => {
    const removed = sweepRetention(counted.sql, new Date(DAY_ZERO + 100 * DAY));
    expect(removed).toStrictEqual({
      ai_wakes: 1,
      ai_outreach: 1,
      app_sessions: 1,
      access_audit: 0,
    });
    expect([rowsIn('ai_wakes'), rowsIn('ai_outreach'), rowsIn('app_sessions')]).toStrictEqual([
      2, 2, 2,
    ]);
  });

  it('forgets access audit events past ninety days and keeps newer ones', () => {
    for (const day of [0, 60, 85]) {
      counted.sql.run(
        'add an access event',
        "insert into access_audit (id, at, kind, detail) values ($id, $at, 'refused_scope', 'x')",
        { id: `audit-${String(day)}`, at: new Date(DAY_ZERO + day * DAY).toISOString() },
      );
    }
    sweepRetention(counted.sql, new Date(DAY_ZERO + 100 * DAY));
    expect(rowsIn('access_audit')).toBe(2);
  });

  it('is not run by inserting, so a new row never prunes its table', () => {
    addAt(200);
    expect([rowsIn('ai_wakes'), rowsIn('ai_outreach'), rowsIn('app_sessions')]).toStrictEqual([
      4, 4, 4,
    ]);
  });
});

describe('the store sweep', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'hub-retention-'));
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(directory, { recursive: true, force: true });
  });

  it('sweeps at start-up and again every day', () => {
    let now = DAY_ZERO;
    const store = openStore({
      path: join(directory, 'sweep.db'),
      log: testLogger('store'),
      now: () => new Date(now),
      systemTimeZone: 'UTC',
    });
    const profile = store.profiles.first().id;
    store.aiWakes.add({
      profile_id: profile,
      chat_id: null,
      automation_id: null,
      automation_name: 'Night',
      headline: 'Woke',
      instruction: '',
      state: 'woke',
      reason: null,
    });
    expect(store.aiWakes.recent(profile, 10)).toHaveLength(1);
    now = DAY_ZERO + 91 * DAY;
    vi.advanceTimersByTime(DAY);
    expect(store.aiWakes.recent(profile, 10)).toHaveLength(0);
    store.close();
  });
});
