import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiModelRoute, AiSubscriptionUsage } from '@smarteverything/domain';
import { ChangeFeed } from '../../src/store/feed';
import { StoreContext } from '../../src/store/context';
import { AI_WEEKLY_SUBSCRIPTION_HISTORY_MIGRATION } from '../../src/store/migrations/ai-weekly-subscription-history';
import {
  AiWeeklySubscriptionHistory,
  modelSubscriptionScope,
  nativeSubscriptionScope,
} from '../../src/store/repositories/ai-weekly-subscription-history';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const START = '2026-11-05T06:00:00.000Z';
const NEXT = '2026-11-05T06:10:00.000Z';
const RESET = '2026-11-06T06:00:00.000Z';
const NEW_RESET = '2026-11-13T06:00:00.000Z';
const PROFILE = '36c38444-c388-4cb3-b8bf-e9271a412fd7';
const OTHER_PROFILE = 'f3eb946c-220e-4c30-ab69-3124139801bb';
const HOST = '8fa9e57a-601c-48d2-8809-b15075dc8b91';
const OTHER_HOST = '17c61e4f-4b87-46ca-8516-d30bc050c54c';
const ROUTE = '48ce6c0d-8a35-4dd2-8573-b89e8e2ab4ec';
const GENERATION = 'd23aaaf6-226a-490d-979c-9d11a3d2c2d7';
const NEXT_GENERATION = '35a24ff0-49e3-4ddc-994c-03a2019834a4';

let database: DatabaseSync;
let context: StoreContext;
let clock: string;

function claude(
  at: string,
  resetsAt: string | null,
  percent: number,
  id = 'seven_day',
): AiSubscriptionUsage {
  return {
    runtime: 'claude',
    status: 'reported',
    reported_at: at,
    windows: [
      { id, label: id, used_percent: percent, resets_at: resetsAt, window_duration_mins: null },
    ],
  };
}

function route(generation: string): AiModelRoute {
  return {
    state: 'ready',
    id: ROUTE,
    profile_id: PROFILE,
    subscriber_id: PROFILE,
    supplier: { kind: 'device', device_id: HOST },
    auth: { provider: 'anthropic', kind: 'claude-subscription-oauth' },
    billing: 'subscription-only',
    fallback: 'none',
    background_authorized: false,
    credential_generation: generation,
    capability_revision: 'test',
    models: [],
  };
}

beforeEach(() => {
  clock = START;
  database = new DatabaseSync(':memory:');
  database.exec('create table profiles (id text primary key) strict');
  const migration = AI_WEEKLY_SUBSCRIPTION_HISTORY_MIGRATION;
  database.prepare('insert into profiles values (?)').run(PROFILE);
  for (const statement of migration.statements) database.exec(statement);
  context = new StoreContext(
    new Sql(database),
    new ChangeFeed(testLogger()),
    () => new Date(clock),
  );
});

afterEach(() => {
  database.close();
});

describe('weekly subscription history', () => {
  it('keeps distinct real reports and never draws short, model-specific or reset-unknown windows', () => {
    const scope = nativeSubscriptionScope(PROFILE, 'claude', HOST);
    const history = new AiWeeklySubscriptionHistory(context);
    history.observe(scope, claude(START, RESET, 18, 'five_hour'));
    history.observe(scope, claude(START, RESET, 36, 'seven_day_opus'));
    history.observe(scope, claude(START, null, 82));
    history.observe(scope, claude(START, RESET, 14.5));
    history.observe(scope, claude(START, RESET, 14.5));
    clock = NEXT;
    history.observe(scope, claude(NEXT, RESET, 14.5));
    const reopened = new AiWeeklySubscriptionHistory(context);
    expect(reopened.read(scope)).toStrictEqual([
      { kind: 'subscription', at: START, percent: 14.5, resets_at: RESET },
      { kind: 'subscription', at: NEXT, percent: 14.5, resets_at: RESET },
    ]);
  });

  it('separates profiles, runtimes, hosts and selected route credential generations', () => {
    const native = nativeSubscriptionScope(PROFILE, 'claude', HOST);
    const first = modelSubscriptionScope(route(GENERATION));
    const second = modelSubscriptionScope(route(NEXT_GENERATION));
    if (first === undefined || second === undefined)
      throw new Error('Expected subscription scopes.');
    const history = new AiWeeklySubscriptionHistory(context);
    history.observe(first, claude(START, RESET, 14));
    history.observe(native, claude(START, RESET, 28));
    expect(history.read(first).map(({ percent }) => percent)).toStrictEqual([14]);
    expect(history.read(native).map(({ percent }) => percent)).toStrictEqual([28]);
    expect(history.read(second)).toStrictEqual([]);
    expect(history.read(nativeSubscriptionScope(OTHER_PROFILE, 'claude', HOST))).toStrictEqual([]);
    expect(history.read(nativeSubscriptionScope(PROFILE, 'codex', HOST))).toStrictEqual([]);
    expect(history.read(nativeSubscriptionScope(PROFILE, 'claude', OTHER_HOST))).toStrictEqual([]);
  });

  it('expires at the reported reset and starts the next cycle from its first observation', () => {
    const scope = nativeSubscriptionScope(PROFILE, 'claude', HOST);
    const history = new AiWeeklySubscriptionHistory(context);
    history.observe(scope, claude(START, RESET, 92));
    clock = RESET;
    expect(history.read(scope)).toStrictEqual([]);
    history.observe(scope, claude(RESET, NEW_RESET, 4));
    history.observe(scope, claude(NEXT, RESET, 93));
    expect(history.read(scope)).toStrictEqual([
      { kind: 'subscription', at: RESET, percent: 4, resets_at: NEW_RESET },
    ]);
  });
});
