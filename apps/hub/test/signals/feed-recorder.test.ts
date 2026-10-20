import {
  PLUGIN_MANIFEST,
  pluginSignalSource,
  type SignalInput,
  type SignalSourceSpec,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { eventsOf } from '../../src/extensions/mcp/tools/history';
import { contributionsOf } from '../../src/plugins/contributions';
import { SignalBus } from '../../src/signals/bus';
import { recordFeedSignals } from '../../src/signals/feed-recorder';
import { EventRouter, type RecordedEvent } from '../../src/state/event-router';
import { captureLogs, testLogger } from '../support/logs';
import { testDatabase, type TestDatabase } from '../support/database';

const AT = '2026-10-18T10:00:00.000Z';
const KID = '22222222-2222-4222-8222-222222222222';
const PARENT = '33333333-3333-4333-8333-333333333333';
const OWNER = { role: 'owner', profileId: null } as const;

const GARAGE: SignalSourceSpec = {
  source: 'plugin_garage',
  label: 'Garage',
  kinds: [
    {
      kind: 'door_moved',
      label: 'Garage door moved',
      subject: 'none',
      fields: [],
      match: [],
      pulse: true,
      feed: true,
    },
    {
      kind: 'door_idle',
      label: 'Garage door idle',
      subject: 'none',
      fields: [],
      match: [],
      pulse: true,
    },
  ],
};

const LISTED = z.object({ details: z.record(z.string(), z.unknown()) });

function detail(event: Record<string, unknown>, key: string): unknown {
  return LISTED.parse(event).details[key];
}

let db: TestDatabase;
let bus: SignalBus;
let router: EventRouter;
let recorded: RecordedEvent[];
let pulses: SignalInput[];

beforeEach(async () => {
  captureLogs();
  db = await testDatabase();
  recorded = [];
  pulses = [];
  bus = new SignalBus({ log: testLogger(), now: (): Date => new Date(AT) });
  bus.register(GARAGE);
  router = new EventRouter({
    store: db.database,
    inventory: { deviceOf: (): undefined => undefined },
    log: testLogger(),
    recorded: (event): void => {
      recorded.push(event);
    },
  });
  recordFeedSignals({ signals: bus, events: router });
  bus.subscribe((signal): void => {
    if (signal.source === 'event') pulses.push(signal);
  });
});

afterEach(async () => {
  await router.close();
  await db.close();
});

function garage(kind: string, profileId: string | null = null): SignalInput {
  return {
    source: 'plugin_garage',
    kind,
    subject: null,
    field: null,
    value: true,
    previous: null,
    at: AT,
    profileId,
    data: { side: 'left' },
  };
}

describe('the activity feed for any signal', () => {
  it('records a feed signal once as a signal event with its source, kind, label and facts', async () => {
    bus.emit(garage('door_moved'));
    await router.settled();
    const rows = db.store.events.list({ limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'signal',
      device_id: null,
      occurred_at: AT,
      details: {
        source: 'plugin_garage',
        kind: 'door_moved',
        field: null,
        label: 'Garage door moved',
        subject: null,
        value: true,
        data: { side: 'left' },
      },
    });
  });

  it('leaves out signals whose kind is not marked for the feed', async () => {
    bus.emit(garage('door_idle'));
    await router.settled();
    expect(db.store.events.list({ limit: 10 })).toStrictEqual([]);
  });

  it('does not fire a second event pulse for the row it records', async () => {
    bus.emit(garage('door_moved'));
    await router.settled();
    await Promise.resolve();
    expect(recorded).toStrictEqual([]);
    expect(pulses).toStrictEqual([]);
    expect(db.store.events.list({ limit: 10 })).toHaveLength(1);
  });

  it('puts a plugin event in the feed by default and keeps one declared feed false out', async () => {
    const manifest = PLUGIN_MANIFEST.parse({
      id: 'door-bell',
      name: 'Door bell',
      version: '1.0.0',
      description: 'Rings',
      publisher: 'Home',
      contributes: {
        events: [
          { kind: 'pressed', title: 'Pressed', fields: { floor: 'number' } },
          { kind: 'idle', title: 'Idle', feed: false },
        ],
      },
    });
    const { sinks } = contributionsOf(
      { store: db.store, signals: bus, inbound: (): void => undefined, now: () => new Date(AT) },
      manifest,
      (): void => undefined,
    );
    sinks.event({ kind: 'pressed', subject: null, data: { floor: 2 } });
    sinks.event({ kind: 'idle', subject: null, data: {} });
    await router.settled();
    const source = pluginSignalSource(manifest.id);
    const listed = eventsOf(db.store, null, OWNER, { source, limit: 10 });
    expect(listed).toMatchObject([
      { kind: 'signal', details: { source, kind: 'pressed', label: 'Pressed' } },
    ]);
    expect(eventsOf(db.store, null, OWNER, { limit: 10 })).toHaveLength(1);
  });
});

describe('list_events with signal rows', () => {
  beforeEach(async () => {
    bus.emit(garage('door_moved'));
    bus.emit({
      source: 'hub',
      kind: 'storm',
      subject: null,
      field: null,
      value: true,
      previous: null,
      at: AT,
      profileId: null,
      data: { source: 'device', kind: 'state', reason: 'cap' },
    });
    await router.settled();
  });

  it('filters by signal source and by signal kind', () => {
    const sourceOf = (input: Parameters<typeof eventsOf>[3]): readonly unknown[] =>
      eventsOf(db.store, null, OWNER, input).map((event) => detail(event, 'source'));
    expect(sourceOf({ source: 'hub', limit: 10 })).toStrictEqual(['hub']);
    expect(sourceOf({ source: 'plugin_garage', limit: 10 })).toStrictEqual(['plugin_garage']);
    expect(sourceOf({ signalKind: 'storm', limit: 10 })).toStrictEqual(['hub']);
    expect(sourceOf({ source: 'hub', signalKind: 'door_moved', limit: 10 })).toStrictEqual([]);
    expect(sourceOf({ kinds: ['signal'], limit: 10 })).toHaveLength(2);
  });

  it('shows a person only the signal rows that are theirs or the home’s', async () => {
    bus.emit(garage('door_moved', KID));
    bus.emit({ ...garage('door_moved', PARENT), at: '2026-10-18T10:00:01.000Z' });
    await router.settled();
    const own = eventsOf(db.store, null, { role: 'member', profileId: KID }, { limit: 50 });
    const profiles = own.map((event) => detail(event, 'profileId'));
    expect(profiles).toHaveLength(3);
    expect(profiles).toContain(KID);
    expect(profiles).not.toContain(PARENT);
    expect(eventsOf(db.store, null, OWNER, { limit: 50 })).toHaveLength(4);
  });
});
