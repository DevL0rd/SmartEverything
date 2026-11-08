import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { coreNodeReadHandlers } from '../../../src/automations/world-v3/core-node-reads';
import { furnish, type Home } from './support';

const HOUR = 3_600_000;

let home: Home;

beforeEach(async () => {
  home = await furnish();
  home.test.store.events.insert([
    {
      deviceId: home.lampA.id,
      kind: 'cycle_finished',
      occurredAt: '2026-10-18T11:00:00.000Z',
      details: { program: 'cotton' },
    },
    {
      deviceId: home.lampB.id,
      kind: 'fault',
      occurredAt: '2026-10-18T10:00:00.000Z',
      details: { code: 'E3' },
    },
    {
      deviceId: home.lampC.id,
      kind: 'cycle_finished',
      occurredAt: '2026-10-18T11:30:00.000Z',
      details: {},
    },
    {
      deviceId: home.lampA.id,
      kind: 'cycle_finished',
      occurredAt: '2026-10-16T11:00:00.000Z',
      details: {},
    },
    { deviceId: null, kind: 'provider_error', occurredAt: '2026-10-18T11:45:00.000Z', details: {} },
  ]);
});

afterEach(async () => {
  await home.test.close();
});

function times(outputs: Readonly<Record<string, unknown>>): readonly unknown[] {
  const events = outputs['events'];
  return Array.isArray(events) ? events.map((event: { at: string }) => event.at) : [];
}

describe('event.count', () => {
  it('registers as a read handler of the core node reads', () => {
    expect(Object.keys(coreNodeReadHandlers(home.deps))).toContain('event.count');
  });

  it('counts every event of the home inside the window, newest first, with the latest time', () => {
    const { outputs } = home.read('event.count', { last: 3 * HOUR });
    expect(outputs['count']).toBe(4);
    expect(outputs['latest']).toBe('2026-10-18T11:45:00.000Z');
    expect(times(outputs)).toEqual([
      '2026-10-18T11:45:00.000Z',
      '2026-10-18T11:30:00.000Z',
      '2026-10-18T11:00:00.000Z',
      '2026-10-18T10:00:00.000Z',
    ]);
  });

  it('counts events older than any fixed page without a cap', () => {
    const { outputs } = home.read('event.count', { last: 7 * 24 * HOUR });
    expect(outputs['count']).toBe(5);
  });

  it('limits to the chosen kinds', () => {
    const { outputs } = home.read('event.count', {
      last: 3 * HOUR,
      kinds: ['cycle_finished', 'fault'],
    });
    expect(outputs['count']).toBe(3);
    const stored = home.test.store.events.list({ kinds: ['fault'], limit: 1 })[0];
    expect(
      home.read('event.count', { last: 3 * HOUR, kinds: ['fault'] }).outputs['events'],
    ).toEqual([
      {
        id: stored?.id,
        device: { device: home.lampB.id },
        kind: 'fault',
        at: '2026-10-18T10:00:00.000Z',
        details: { code: 'E3' },
      },
    ]);
  });

  it('limits to the devices of a target', () => {
    const room = home.read('event.count', { last: 3 * HOUR, target: { room: home.kitchen.id } });
    expect(room.outputs['count']).toBe(2);
    const devices = home.read('event.count', {
      last: 3 * HOUR,
      target: [{ device: home.lampC.id }],
    });
    expect(devices.outputs['count']).toBe(1);
  });

  it('gives zero and no latest time when nothing matches or the target holds no device', () => {
    const none = home.read('event.count', { last: 3 * HOUR, kinds: ['smoke'] });
    expect(none.outputs).toEqual({ count: 0, events: [] });
    const empty = home.test.store.rooms.create('Attic', 2);
    const attic = home.read('event.count', { last: 3 * HOUR, target: { room: empty.id } });
    expect(attic.outputs).toEqual({ count: 0, events: [] });
  });

  it('refuses a kind that is not an event kind and a window that is not positive', () => {
    expect(() => home.read('event.count', { last: HOUR, kinds: ['nope'] })).toThrow(/cannot read/);
    expect(() => home.read('event.count', { last: 0 })).toThrow(/cannot read/);
  });

  it('uses the default window when none is wired', () => {
    expect(home.read('event.count', {}).outputs['count']).toBe(4);
  });
});
