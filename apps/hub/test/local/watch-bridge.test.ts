import { ApiError, type JsonValue } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { WatchBridges, type BridgedDevice } from '../../src/local/watch-bridge';
import { FakeClock } from '../support/fake-clock';
import { captureLogs, testLogger } from '../support/logs';

const START = '2026-10-08T10:00:00.000Z';
const PHONE = { id: crypto.randomUUID(), name: 'Pixel' };
const TABLET = { id: crypto.randomUUID(), name: 'Tablet' };
const IDLE_LIMIT = '2026-10-08T12:00:00.000Z';

let clock: FakeClock;
let observed: { externalId: string; values: Readonly<Record<string, JsonValue>> }[];
let bridges: WatchBridges;
let device: BridgedDevice;

function stored(clientId: string, clientName: string, since: string): BridgedDevice {
  return { ...device, details: { bridge: { clientId, clientName, since } } };
}

beforeEach(() => {
  captureLogs();
  clock = new FakeClock(START);
  observed = [];
  bridges = new WatchBridges({
    observe: (externalId, values): Promise<void> => {
      observed.push({ externalId, values });
      return Promise.resolve();
    },
    now: clock.now,
    log: testLogger('watch'),
  });
  device = { id: crypto.randomUUID(), external_id: 'xiaomi_watch:AA', details: {} };
});

describe('watch bridge', () => {
  it('has no holder until an app asks, then names the first app and records it on the device', async () => {
    expect(bridges.holderOf(device)).toBeNull();
    expect(await bridges.acquire(device, PHONE)).toBeNull();
    expect(bridges.holderOf(device)).toEqual({
      clientId: PHONE.id,
      clientName: 'Pixel',
      since: START,
    });
    expect(observed).toHaveLength(1);
    expect(observed[0]?.externalId).toBe('xiaomi_watch:AA');
    expect(observed[0]?.values['bridge']).toMatchObject({ clientId: PHONE.id });
  });

  it('lets the holder keep asking without writing again', async () => {
    await bridges.acquire(device, PHONE);
    expect(await bridges.acquire(device, PHONE)).toBeNull();
    expect(observed).toHaveLength(1);
  });

  it('tells a second app who holds the watch while the holder is active', async () => {
    await bridges.acquire(device, PHONE);
    clock.advanceTo('2026-10-08T11:59:00.000Z');
    const blocking = await bridges.acquire(device, TABLET);
    expect(blocking).toMatchObject({ clientId: PHONE.id, clientName: 'Pixel' });
    expect(bridges.holderOf(device)?.clientId).toBe(PHONE.id);
    expect(observed).toHaveLength(1);
  });

  it('hands the watch to a second app once the holder has been idle for two hours', async () => {
    await bridges.acquire(device, PHONE);
    clock.advanceTo(IDLE_LIMIT);
    expect(await bridges.acquire(device, TABLET)).toBeNull();
    expect(bridges.holderOf(device)?.clientId).toBe(TABLET.id);
    expect(observed).toHaveLength(2);
  });

  it('counts the holder asking again as activity', async () => {
    await bridges.acquire(device, PHONE);
    clock.advanceTo('2026-10-08T11:30:00.000Z');
    await bridges.acquire(device, PHONE);
    clock.advanceTo('2026-10-08T13:00:00.000Z');
    expect(await bridges.acquire(device, TABLET)).toMatchObject({ clientId: PHONE.id });
  });

  it('counts a report from the holder stored on the device as activity, but not one from another app', async () => {
    const held = {
      ...stored(PHONE.id, 'Pixel', START),
      details: {
        bridge: { clientId: PHONE.id, clientName: 'Pixel', since: START },
        reportedBy: PHONE.id,
        reportedAt: '2026-10-08T11:30:00.000Z',
      },
    };
    clock.advanceTo('2026-10-08T13:00:00.000Z');
    expect(await bridges.acquire(held, TABLET)).toMatchObject({ clientId: PHONE.id });
    const other = {
      ...held,
      details: { ...held.details, reportedBy: TABLET.id },
    };
    expect(await bridges.acquire(other, TABLET)).toBeNull();
  });

  it('lets another app take the watch from a holder whose last report was a failed connection', async () => {
    const held = {
      ...device,
      details: {
        bridge: { clientId: TABLET.id, clientName: 'Tablet', since: START },
        reportedBy: TABLET.id,
        reportedAt: START,
        phase: 'failed',
      },
    };
    clock.advanceTo('2026-10-08T10:05:00.000Z');
    expect(await bridges.acquire(held, PHONE)).toBeNull();
    expect(bridges.holderOf(held)?.clientId).toBe(PHONE.id);
    const connecting = { ...held, details: { ...held.details, phase: 'connecting' } };
    const other = new WatchBridges({
      observe: (): Promise<void> => Promise.resolve(),
      now: clock.now,
      log: testLogger('watch'),
    });
    expect(await other.acquire(connecting, PHONE)).toMatchObject({ clientId: TABLET.id });
  });

  it('never gives the watch to an app that has not connected once another app has, even when the holder is gone', async () => {
    await bridges.acquire(device, PHONE);
    await bridges.pair(device, PHONE);
    expect(observed.at(-1)?.values['pairedBy']).toEqual([
      { clientId: PHONE.id, clientName: 'Pixel' },
    ]);
    clock.advanceTo('2026-10-09T10:00:00.000Z');
    expect(await bridges.acquire(device, TABLET)).toMatchObject({
      clientId: PHONE.id,
      clientName: 'Pixel',
    });
    expect(bridges.heldElsewhere(device, TABLET)).toMatchObject({ clientId: PHONE.id });
    expect(bridges.holderOf(device)?.clientId).toBe(PHONE.id);
  });

  it('lets the app that has connected take the watch back from an app that never has', async () => {
    const connected = {
      ...device,
      details: { pairedBy: [{ clientId: PHONE.id, clientName: 'Pixel' }] },
    };
    await bridges.takeOver(connected, TABLET);
    expect(bridges.holderOf(connected)?.clientId).toBe(TABLET.id);
    expect(await bridges.acquire(connected, PHONE)).toBeNull();
    expect(bridges.holderOf(connected)?.clientId).toBe(PHONE.id);
  });

  it('keeps an app that took the watch over on purpose, and records a connection once', async () => {
    await bridges.pair(device, PHONE);
    await bridges.takeOver(device, TABLET);
    expect(await bridges.acquire(device, TABLET)).toBeNull();
    await bridges.pair(device, TABLET);
    await bridges.pair(device, TABLET);
    expect(observed.filter((entry) => 'pairedBy' in entry.values)).toHaveLength(2);
  });

  it('reads a holder saved on the device from an earlier run', async () => {
    const saved = stored(PHONE.id, 'Pixel', START);
    expect(bridges.holderOf(saved)).toMatchObject({ clientId: PHONE.id });
    clock.advanceTo('2026-10-08T10:30:00.000Z');
    expect(await bridges.acquire(saved, TABLET)).toMatchObject({ clientId: PHONE.id });
  });

  it('rejects a stored holder that is not a valid bridge', () => {
    expect(() => bridges.holderOf({ ...device, details: { bridge: { clientId: 1 } } })).toThrow();
  });

  it('require passes for the holder and refuses another app with a conflict naming the holder', async () => {
    await bridges.require(device, PHONE);
    const refusal = await bridges.require(device, TABLET).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(refusal).toBeInstanceOf(ApiError);
    expect(refusal instanceof Error ? refusal.message : '').toContain('Pixel');
  });

  it('take over moves the watch to the asking app at once, even from an active holder', async () => {
    await bridges.acquire(device, PHONE);
    const taken = await bridges.takeOver(device, TABLET);
    expect(taken).toMatchObject({ clientId: TABLET.id, clientName: 'Tablet' });
    expect(bridges.holderOf(device)?.clientId).toBe(TABLET.id);
    expect(await bridges.acquire(device, PHONE)).toMatchObject({ clientId: TABLET.id });
    expect(await bridges.takeOver(device, TABLET)).toEqual(taken);
    expect(observed).toHaveLength(2);
  });
});
