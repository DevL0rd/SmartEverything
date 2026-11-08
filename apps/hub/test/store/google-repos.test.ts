import { DatabaseSync } from 'node:sqlite';
import type { GoogleAccountRow, GoogleSyncState, LiveChange } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { GoogleAccountsRepository } from '../../src/store/repositories/google-accounts';
import {
  GoogleSyncLogRepository,
  type GoogleSyncLogInput,
} from '../../src/store/repositories/google-sync-log';
import { GoogleSyncStateRepository } from '../../src/store/repositories/google-sync-state';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql, StoreConflictError } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const START = '2026-11-07T08:00:00.000Z';
const LATER = '2026-11-07T09:30:00.000Z';

let now: string;
let accounts: GoogleAccountsRepository;
let states: GoogleSyncStateRepository;
let log: GoogleSyncLogRepository;
let changes: LiveChange[];
let ann: string;
let bob: string;

const account = (profileId: string): GoogleAccountRow => ({
  profile_id: profileId,
  email: 'ann@example.com',
  scopes: ['https://www.googleapis.com/auth/calendar.events'],
  status: 'linked',
  problem: null,
  calendar_ids: ['primary'],
  list_ids: ['@default'],
  last_sync_at: null,
  last_error: null,
});

const state = (
  profileId: string,
  resourceId: string,
  channelId: string | null,
): GoogleSyncState => ({
  profile_id: profileId,
  product: 'calendar',
  resource_id: resourceId,
  sync_token: 'token-1',
  channel:
    channelId === null
      ? null
      : { channel_id: channelId, resource_id: 'goog-res', expires_at: '2026-11-14T08:00:00.000Z' },
  last_pull_at: START,
});

const entry = (profileId: string): GoogleSyncLogInput => ({
  profile_id: profileId,
  trigger: 'manual',
  product: 'tasks',
  counts: { pulled: 3, created: 1, updated: 1, deleted: 0, pushed: 2, conflicts: 1 },
  conflicts: [
    {
      item_id: 'a3f2b8c1-5a4d-4b7e-9c6f-1a2b3c4d5e6f',
      field: 'title',
      winner: 'google',
      losing_value: 'Old',
    },
  ],
  error: null,
  choice: null,
});

beforeEach(() => {
  captureLogs();
  now = START;
  changes = [];
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, START, testLogger());
  const feed = new ChangeFeed(testLogger('store'));
  feed.subscribe((change) => changes.push(change));
  const context = new StoreContext(sql, feed, () => new Date(now));
  const profiles = new ProfilesRepository(context);
  ann = profiles.create({ name: 'Ann' }).id;
  bob = profiles.create({ name: 'Bob' }).id;
  accounts = new GoogleAccountsRepository(context);
  states = new GoogleSyncStateRepository(context);
  log = new GoogleSyncLogRepository(context);
  changes = [];
});

describe('google accounts', () => {
  it('stores one status row per person with no token and announces every change', () => {
    const row = accounts.insert(account(ann));
    expect(accounts.byProfile(ann)).toEqual(row);
    expect(Object.keys(row)).not.toContain('refresh_token');
    const needs = accounts.update(ann, { status: 'needs_attention', problem: 'invalid_grant' });
    expect(needs).toMatchObject({ status: 'needs_attention', problem: 'invalid_grant' });
    accounts.remove(ann);
    expect(accounts.find(ann)).toBeUndefined();
    expect(changes.map((change) => [change.table, change.operation])).toEqual([
      ['google_accounts', 'INSERT'],
      ['google_accounts', 'UPDATE'],
      ['google_accounts', 'DELETE'],
    ]);
  });

  it('lists every account and refuses a second row for one person', () => {
    accounts.insert(account(ann));
    accounts.insert({ ...account(bob), email: null });
    expect(
      accounts
        .list()
        .map((row) => row.profile_id)
        .sort(),
    ).toEqual([ann, bob].sort());
    expect(() => accounts.insert(account(ann))).toThrow(StoreConflictError);
  });

  it('refuses an address that is not an email', () => {
    expect(() => accounts.insert({ ...account(ann), email: 'not-an-address' })).toThrow();
  });
});

describe('google sync state', () => {
  beforeEach(() => {
    accounts.insert(account(ann));
    accounts.insert(account(bob));
  });

  it('replaces the stored token and channel of a resource and finds it by channel', () => {
    states.put(state(ann, 'primary', 'chan-1'));
    const next = states.put({ ...state(ann, 'primary', 'chan-2'), sync_token: 'token-2' });
    expect(states.find({ profileId: ann, product: 'calendar', resourceId: 'primary' })).toEqual(
      next,
    );
    expect(states.byChannel('chan-2')).toEqual(next);
    expect(states.byChannel('chan-1')).toBeUndefined();
    expect(states.forProfile(ann)).toHaveLength(1);
  });

  it('keeps each person resources apart and drops them with the account', () => {
    states.put(state(ann, 'primary', null));
    states.put(state(bob, 'primary', null));
    expect(states.forProfile(bob)).toHaveLength(1);
    accounts.remove(ann);
    expect(states.forProfile(ann)).toEqual([]);
    expect(states.forProfile(bob)).toHaveLength(1);
  });

  it('refuses one push channel on two resources and forgets a resource', () => {
    states.put(state(ann, 'primary', 'chan-1'));
    expect(() => states.put(state(ann, 'work', 'chan-1'))).toThrow();
    const resource = { profileId: ann, product: 'calendar', resourceId: 'primary' } as const;
    states.remove(resource);
    expect(states.find(resource)).toBeUndefined();
  });
});

describe('google sync log', () => {
  beforeEach(() => {
    accounts.insert(account(ann));
    accounts.insert(account(bob));
  });

  it('records a run with its conflict and lists a person newest first', () => {
    const first = log.insert(entry(ann));
    now = LATER;
    const second = log.insert({ ...entry(ann), trigger: 'push', conflicts: [] });
    log.insert(entry(bob));
    expect(first.at).toBe(START);
    expect(first.conflicts[0]?.losing_value).toBe('Old');
    expect(log.list(ann).map((row) => row.id)).toEqual([second.id, first.id]);
    expect(log.list(bob)).toHaveLength(1);
  });

  it('keeps one person from reading another person entry', () => {
    const row = log.insert(entry(ann));
    expect(log.find(row.id, bob)).toBeUndefined();
    expect(() => log.byId(row.id, bob)).toThrow();
  });

  it('records the task the person chose from an uncertain insert', () => {
    const row = log.insert({
      ...entry(ann),
      choice: {
        item_id: 'a3f2b8c1-5a4d-4b7e-9c6f-1a2b3c4d5e6f',
        list_id: '@default',
        candidates: [
          { google_id: 'g1', title: 'Milk', created_at: START },
          { google_id: 'g2', title: 'Milk', created_at: START },
        ],
        resolved_google_id: null,
        resolved_at: null,
      },
    });
    if (row.choice === null) throw new Error('the choice was stored');
    const resolved = log.replaceChoice(row.id, ann, {
      ...row.choice,
      resolved_google_id: 'g2',
      resolved_at: LATER,
    });
    expect(log.byId(row.id, ann).choice).toEqual(resolved.choice);
    expect(resolved.choice?.resolved_google_id).toBe('g2');
  });

  it('refuses a choice that names a task that was not a candidate', () => {
    const row = log.insert(entry(ann));
    expect(() =>
      log.replaceChoice(row.id, ann, {
        item_id: 'a3f2b8c1-5a4d-4b7e-9c6f-1a2b3c4d5e6f',
        list_id: '@default',
        candidates: [
          { google_id: 'g1', title: 'Milk', created_at: START },
          { google_id: 'g2', title: 'Milk', created_at: START },
        ],
        resolved_google_id: 'g9',
        resolved_at: LATER,
      }),
    ).toThrow();
  });
});
