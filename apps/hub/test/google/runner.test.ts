import { join } from 'node:path';
import type {
  GoogleSyncLogEntry,
  GoogleSyncTrigger,
  PlannerItemRow,
} from '@smarteverything/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimulatedClock } from '../../src/clock/simulated';
import { GoogleChannels, channelToken } from '../../src/google/channels';
import { GoogleLink } from '../../src/google/link';
import { GooglePushReceiver, type PushOutcome } from '../../src/google/push-receiver';
import { GoogleSyncRunner, QUOTA_WINDOW_MS, type ProductSync } from '../../src/google/sync-runner';
import { GoogleTokens } from '../../src/google/tokens';
import { instantsOf } from '../../src/planner/instants';
import { GoogleCalendarSync } from '../../src/planner/google/calendar-sync';
import { SecretStore } from '../../src/secrets/store';
import { sweepRetention } from '../../src/store/retention';
import { GoogleAccountsRepository } from '../../src/store/repositories/google-accounts';
import { GoogleSyncLogRepository } from '../../src/store/repositories/google-sync-log';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { countedStore } from '../support/counted-store';
import {
  createFakeGoogle,
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  type FakeGoogle,
  type PushNotification,
} from '../fakes/google';
import { testStore, type TestStore } from '../support/store';

const EMAIL = 'ann@example.test';
const REDIRECT = 'http://127.0.0.1:53682/callback';
const PUBLIC_URL = 'https://hub.example.test';
const START = '2026-11-08T00:00:00.000Z';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const KEY = Buffer.alloc(32, 9);

interface Rig {
  readonly google: FakeGoogle;
  readonly test: TestStore;
  readonly sim: SimulatedClock;
  readonly ann: string;
  readonly calendar: GoogleCalendarSync;
  readonly runner: GoogleSyncRunner;
  readonly channels: GoogleChannels;
  readonly receiver: GooglePushReceiver;
  readonly outcomes: PushOutcome[];
}

let rig: Rig;

const idle: ProductSync = { sync: () => Promise.resolve(null) };

function headerOf(notification: PushNotification, name: string): string | null {
  return notification.headers[name] ?? null;
}

async function build(withPublicUrl: boolean, calendarOverride?: ProductSync): Promise<Rig> {
  const outcomes: PushOutcome[] = [];
  let receive: ((notification: PushNotification) => void) | null = null;
  const google = createFakeGoogle({
    deliver: (notification) => {
      receive?.(notification);
    },
  });
  const test = await testStore(() => google.clock.now());
  const { store } = test;
  const ann = store.profiles.create({ name: 'Ann' }).id;
  const secrets = await SecretStore.open(join(test.directory, 'secrets'), Buffer.alloc(32, 7));
  await secrets.saveGoogleApp({
    desktop: { clientId: FAKE_CLIENT_ID, clientSecret: FAKE_CLIENT_SECRET },
    android: null,
  });
  const tokens = new GoogleTokens({
    secrets,
    accounts: store.googleAccounts,
    fetch: google.fetch,
    nowMs: (): number => google.clock.nowMs(),
  });
  const link = new GoogleLink({
    secrets,
    accounts: store.googleAccounts,
    tokens,
    fetch: google.fetch,
  });
  const started = link.begin({
    profileId: ann,
    client: 'desktop',
    redirectUri: REDIRECT,
    request: { calendar: 'write', tasks: 'write' },
  });
  const consent = google.oauth.consent(started.authorizationUrl, EMAIL);
  await link.complete({
    profileId: ann,
    state: started.state,
    code: consent.code,
    redirectUri: REDIRECT,
  });
  store.googleAccounts.update(ann, { calendar_ids: [EMAIL] });
  if (withPublicUrl) {
    store.settings.setPublicUrl(PUBLIC_URL);
    store.settings.recordPublicUrlCheck(PUBLIC_URL, { verified: true });
  }
  const sim = new SimulatedClock(START);
  const calendar = new GoogleCalendarSync({
    store,
    tokens,
    fetch: google.fetch,
    now: (): Date => google.clock.now(),
  });
  const runner = new GoogleSyncRunner({
    store,
    calendar: calendarOverride ?? calendar,
    tasks: idle,
    clock: sim,
  });
  const channels = new GoogleChannels({
    store,
    tokens,
    runner,
    fetch: google.fetch,
    clock: sim,
    key: KEY,
  });
  const receiver = new GooglePushReceiver({ states: store.googleSyncState, runner, key: KEY });
  receive = (notification): void => {
    outcomes.push(
      receiver.receive({
        channelId: notification.channelId,
        token: headerOf(notification, 'X-Goog-Channel-Token'),
        resourceId: headerOf(notification, 'X-Goog-Resource-ID'),
        state: headerOf(notification, 'X-Goog-Resource-State'),
      }),
    );
  };
  return { google, test, sim, ann, calendar, runner, channels, receiver, outcomes };
}

function calendarLog(trigger?: GoogleSyncTrigger): GoogleSyncLogEntry[] {
  return rig.test.store.googleSyncLog
    .list(rig.ann)
    .filter(
      (entry) =>
        entry.product === 'calendar' && (trigger === undefined || entry.trigger === trigger),
    );
}

function channelOf(): { readonly channel_id: string; readonly expires_at: string } {
  const channel = rig.test.store.googleSyncState.forProfile(rig.ann)[0]?.channel;
  if (channel === null || channel === undefined) throw new Error('no channel');
  return channel;
}

function localEvent(title: string): PlannerItemRow {
  const collection = rig.test.store.plannerCollections.byGoogle(rig.ann, EMAIL);
  if (collection === undefined) throw new Error('not mirrored');
  const timing = {
    start_local: '2026-11-12T10:00:00',
    end_local: '2026-11-12T11:00:00',
    time_zone: 'Europe/Berlin',
    all_day: false,
    rrule: null,
  };
  return rig.test.store.plannerItems.insert({
    profile_id: rig.ann,
    collection_id: collection.id,
    kind: 'event',
    parent_id: null,
    title,
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    due_date: null,
    due_at: null,
    exdates: [],
    series_id: null,
    original_start: null,
    status: 'open',
    position: 100,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [],
    google: null,
    created_by: 'person',
    ...timing,
    ...instantsOf(timing),
  });
}

async function closeRig(): Promise<void> {
  rig.channels.stop();
  rig.runner.stop();
  await rig.test.close();
}

describe('sync runner', () => {
  afterEach(closeRig);

  it('collapses concurrent triggers into one pull', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<null>((resolve) => {
      release = (): void => {
        resolve(null);
      };
    });
    const sync = vi.fn<ProductSync['sync']>(() => gate);
    rig = await build(false, { sync });
    const first = rig.runner.sync(rig.ann, 'visible');
    const second = rig.runner.sync(rig.ann, 'manual');
    release();
    expect(await Promise.all([first, second])).toEqual(['synced', 'synced']);
    expect(sync).toHaveBeenCalledOnce();
    expect(sync).toHaveBeenCalledWith(rig.ann, 'visible');
  });

  it('records the time of a good sync on the account and skips a profile with no link', async () => {
    rig = await build(false);
    expect(await rig.runner.sync(rig.ann, 'manual')).toBe('synced');
    expect(rig.test.store.googleAccounts.byProfile(rig.ann)).toMatchObject({
      last_error: null,
    });
    expect(rig.test.store.googleAccounts.byProfile(rig.ann).last_sync_at).not.toBeNull();
    const bob = rig.test.store.profiles.create({ name: 'Bob' }).id;
    expect(await rig.runner.sync(bob, 'manual')).toBe('unlinked');
  });

  it('syncs on a local write to a Google calendar and does not loop on its own writes', async () => {
    rig = await build(false);
    rig.runner.start();
    await rig.runner.sync(rig.ann, 'manual');
    expect(calendarLog('reconcile')).toHaveLength(1);
    const item = localEvent('Dentist');
    await vi.waitFor(() => {
      expect(calendarLog('change')).toHaveLength(1);
    });
    expect(rig.test.store.plannerItems.byId(item.id, rig.ann).google?.state).toBe('synced');
  });

  it('pulls Google for a reminder before it rings', async () => {
    rig = await build(false);
    await rig.runner.sync(rig.ann, 'manual');
    await rig.runner.reminderPull(localEvent('Dentist'));
    expect(calendarLog('ring')).toHaveLength(1);
  });

  it('backs off on a Google rate limit, logs it and retries once at the end of the wait', async () => {
    rig = await build(false);
    rig.google.faults.fail({ times: 1, status: 429, pathIncludes: '/calendar/v3' });
    expect(await rig.runner.sync(rig.ann, 'manual')).toBe('failed');
    expect(calendarLog('manual')[0]?.error).not.toBeNull();
    expect(rig.sim.pending()).toEqual([
      new Date(Date.parse(START) + QUOTA_WINDOW_MS).toISOString(),
    ]);
    expect(await rig.runner.sync(rig.ann, 'visible')).toBe('backoff');
    expect(calendarLog()).toHaveLength(1);
    rig.sim.advanceTo(new Date(Date.parse(START) + QUOTA_WINDOW_MS).toISOString());
    await vi.waitFor(() => {
      expect(calendarLog('reconcile')).toHaveLength(1);
    });
    expect(calendarLog('reconcile')[0]?.error).toBeNull();
    expect(rig.sim.pending()).toEqual([]);
  });
});

describe('push channels', () => {
  afterEach(closeRig);

  it('opens one channel per calendar and queues exactly one incremental sync per notification', async () => {
    rig = await build(true);
    rig.channels.start();
    await rig.runner.sync(rig.ann, 'manual');
    await rig.google.channels.flush();
    expect(rig.google.channels.active()).toHaveLength(1);
    expect(rig.google.channels.active()[0]?.address).toBe(
      `${PUBLIC_URL}/api/google/push/${channelOf().channel_id}`,
    );
    expect(rig.outcomes).toEqual(['ignored']);
    rig.google
      .account(EMAIL)
      .calendars.events(EMAIL)
      .insert({
        summary: 'Standup',
        start: { dateTime: '2026-11-10T09:00:00+01:00', timeZone: 'Europe/Berlin' },
        end: { dateTime: '2026-11-10T10:00:00+01:00', timeZone: 'Europe/Berlin' },
      });
    await rig.google.channels.flush();
    expect(rig.outcomes).toEqual(['ignored', 'queued']);
    await vi.waitFor(() => {
      expect(calendarLog('push')).toHaveLength(1);
    });
    expect(rig.test.store.plannerItems.list(rig.ann).map((item) => item.title)).toContain(
      'Standup',
    );
  });

  it('rejects a wrong token or resource and queues nothing', async () => {
    rig = await build(true);
    rig.channels.start();
    await rig.runner.sync(rig.ann, 'manual');
    const { channel_id: channelId } = channelOf();
    const resourceId = rig.test.store.googleSyncState.byChannel(channelId)?.channel?.resource_id;
    const before = calendarLog().length;
    const attempt = (token: string | null, resource: string | null): PushOutcome =>
      rig.receiver.receive({ channelId, token, resourceId: resource, state: 'exists' });
    expect(attempt('0'.repeat(64), resourceId ?? null)).toBe('rejected');
    expect(attempt(null, resourceId ?? null)).toBe('rejected');
    expect(attempt(channelToken(KEY, channelId), 'other-resource')).toBe('rejected');
    expect(calendarLog()).toHaveLength(before);
  });

  it('renews at expiration with a new channel and one incremental sync', async () => {
    rig = await build(true);
    rig.channels.start();
    await rig.runner.sync(rig.ann, 'manual');
    const first = channelOf();
    expect(rig.sim.pending()).toEqual([first.expires_at]);
    rig.google.clock.advance(WEEK_MS + 1000);
    rig.sim.advanceTo(first.expires_at);
    await vi.waitFor(() => {
      expect(calendarLog('reconcile')).toHaveLength(1);
    });
    const second = channelOf();
    expect(second.channel_id).not.toBe(first.channel_id);
    expect(rig.sim.pending()).toEqual([second.expires_at]);
    expect(calendarLog()).toHaveLength(2);
  });

  it('opens no channel and arms no timer without a verified public URL', async () => {
    rig = await build(false);
    rig.channels.start();
    await rig.runner.sync(rig.ann, 'manual');
    expect(rig.sim.pending()).toEqual([]);
    expect(rig.google.channels.active()).toHaveLength(0);
    expect(rig.test.store.googleSyncState.forProfile(rig.ann)[0]?.channel).toBeNull();
  });

  it('stops the channels and their timers when the account is released', async () => {
    rig = await build(true);
    rig.channels.start();
    await rig.runner.sync(rig.ann, 'manual');
    await rig.channels.release(rig.ann);
    expect(rig.google.channels.active()).toHaveLength(0);
    expect(rig.sim.pending()).toEqual([]);
    expect(rig.test.store.googleSyncState.forProfile(rig.ann)[0]?.channel).toBeNull();
  });
});

describe('sync log retention', () => {
  it('drops entries older than the kept days and keeps newer ones', async () => {
    const day = 86_400_000;
    const zero = Date.parse(START);
    let clock = zero;
    const counted = await countedStore(() => new Date(clock));
    try {
      const profileId = new ProfilesRepository(counted.context).first().id;
      new GoogleAccountsRepository(counted.context).insert({
        profile_id: profileId,
        email: null,
        scopes: [],
        status: 'linking',
        problem: null,
        calendar_ids: [],
        list_ids: [],
        last_sync_at: null,
        last_error: null,
      });
      const log = new GoogleSyncLogRepository(counted.context);
      const counts = { pulled: 0, created: 0, updated: 0, deleted: 0, pushed: 0, conflicts: 0 };
      for (const offset of [0, 60, 85]) {
        clock = zero + offset * day;
        log.insert({
          profile_id: profileId,
          trigger: 'manual',
          product: 'calendar',
          counts,
          conflicts: [],
          error: null,
          choice: null,
        });
      }
      const removed = sweepRetention(counted.sql, new Date(zero + 100 * day));
      expect(removed['google_sync_log']).toBe(1);
      expect(log.list(profileId)).toHaveLength(2);
    } finally {
      await counted.close();
    }
  });
});
