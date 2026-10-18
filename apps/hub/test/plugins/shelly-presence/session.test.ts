import { afterEach, describe, expect, it } from 'vitest';
import { closeHarnesses, harness } from './harness';
import { DEVICE_ID, until } from './fake-shelly';

afterEach(closeHarnesses);

describe('Shelly session notifications', () => {
  it('projects only the readings a status delta touches and publishes no inventory', async () => {
    const { shelly, session, sink, inventory, tracks } = await harness();
    sink.state.mockClear();
    inventory.mockClear();
    for (let lux = 10; lux < 60; lux += 1)
      shelly.notify('NotifyStatus', { ts: 1000 + lux, 'illuminance:0': { lux } });
    await until(() => session.current().light[0]?.status?.lux === 59, 'the last lux delta');
    const capabilities = new Set(sink.state.mock.calls.map(([update]) => update.capability));
    expect([...capabilities].sort()).toEqual(['illuminance', 'illumination']);
    expect(inventory).not.toHaveBeenCalled();
    expect(tracks).not.toHaveBeenCalled();
  });

  it('publishes the inventory for a status delta the overlay cannot show', async () => {
    const { shelly, session, inventory } = await harness();
    inventory.mockClear();
    shelly.notify('NotifyStatus', { ts: 4000, sys: { uptime: 120 } });
    await until(() => inventory.mock.calls.length > 0, 'the inventory publish');
    expect(inventory).toHaveBeenCalledTimes(1);
    expect(inventory).toHaveBeenCalledWith(false);
    expect(session.current().observedAt).toBe(new Date(4000 * 1000).toISOString());
    shelly.notify('NotifyStatus', { ts: 4001, 'illuminance:0': { lux: 6 } });
    await until(() => session.current().light[0]?.status?.lux === 6, 'the lux delta');
    expect(inventory).toHaveBeenCalledTimes(1);
  });

  it('delivers track frames without projecting readings or publishing inventory', async () => {
    const { shelly, session, sink, inventory, tracks } = await harness();
    sink.state.mockClear();
    inventory.mockClear();
    shelly.notify('NotifyEvent', {
      events: [
        {
          component: 'presence',
          event: 'track',
          ts: 2000,
          object: [{ id: 1, x: 1, y: 2, z: 0.5 }],
        },
      ],
    });
    await until(() => session.current().tracks.length === 1, 'the track frame');
    expect(sink.state).not.toHaveBeenCalled();
    expect(inventory).not.toHaveBeenCalled();
    expect(tracks).toHaveBeenCalledTimes(1);
  });

  it('clears the tracked objects when the last holder stops tracking', async () => {
    const { shelly, session, tracks } = await harness({
      handler: (method) =>
        method === 'Presence.GetStatus'
          ? {
              live_track: {
                timer_started_at: Date.now() / 1000,
                timer_duration: 300,
                interval: 1,
              },
            }
          : undefined,
    });
    await session.startTracking('viewers');
    await session.startTracking('automation');
    shelly.notify('NotifyEvent', {
      events: [
        {
          component: 'presence',
          event: 'track',
          ts: 2000,
          object: [{ id: 1, x: 1, y: 2, z: 0.5 }],
        },
      ],
    });
    await until(() => session.current().tracks.length === 1, 'the track frame');
    await session.stopTracking('viewers');
    expect(session.current().tracks).toHaveLength(1);
    tracks.mockClear();
    await session.stopTracking('automation');
    expect(session.current()).toMatchObject({ tracks: [], tracksAt: null });
    expect(tracks).toHaveBeenCalledTimes(1);
  });

  it('skips an unexpected notification and keeps the connection', async () => {
    const { shelly, session, failures } = await harness();
    shelly.notify('NotifyStatus', { ts: 3000, 'presencezone:200': { value: 'maybe' } });
    shelly.notify('NotifyEvent', {
      events: [
        { component: 7, event: 'x' },
        { component: 'future', event: 'new_event', ts: 1 },
      ],
    });
    shelly.notify('NotifyStatus', { ts: 3001, 'illuminance:0': { lux: 77 } });
    await until(() => session.current().light[0]?.status?.lux === 77, 'the following delta');
    expect(session.current().connection.state).toBe('online');
    expect(failures).toHaveLength(1);
  });

  it('saves a re-pointed address only after the inventory read succeeded', async () => {
    const stale = 'http://192.0.2.1:80';
    const failed = await harness({
      recordedAddress: stale,
      handler: (method) =>
        method === 'Shelly.GetConfig' ? { error: { code: -1, message: 'no' } } : undefined,
      settled: (ready) => ready.current().connection.state === 'offline',
    });
    expect(failed.enrollments.get(DEVICE_ID)).toMatchObject({ address: stale });
    const succeeded = await harness({ recordedAddress: stale });
    expect(succeeded.enrollments.get(DEVICE_ID)).toMatchObject({
      address: succeeded.shelly.address,
    });
  });

  it('rewrites the enrollment only when its zone identities changed', async () => {
    const { enrollments, session } = await harness();
    const settled = enrollments.puts();
    await session.refresh();
    expect(enrollments.puts()).toBe(settled);
  });

  it('falls back to the parameterless live track call when the device refuses enable', async () => {
    const { session, shelly } = await harness({
      handler: (method, params) =>
        method === 'Presence.LiveTrack' && JSON.stringify(params) === '{"enable":true}'
          ? { error: { code: -103, message: 'Invalid argument enable' } }
          : undefined,
    });
    const outcome = await session.execute({ action: 'live_track', params: {} });
    expect(outcome.state).toBe('accepted');
    const live = shelly.calls.filter((call) => call.method === 'Presence.LiveTrack');
    expect(live.map((call) => call.params)).toEqual([{ enable: true }, {}]);
  });

  it('reports the reason the device gave when it refuses a call', async () => {
    const { session } = await harness({
      handler: (method) =>
        method === 'Presence.LiveTrack'
          ? { error: { code: -105, message: 'Live tracking is busy' } }
          : undefined,
    });
    await expect(session.execute({ action: 'live_track', params: {} })).rejects.toThrow(
      'Live tracking is busy',
    );
  });

  it('reconnects after the connection drops', async () => {
    const { session, shelly } = await harness();
    shelly.dropClients();
    await until(() => session.current().connection.state === 'offline', 'the drop');
    await until(() => session.current().connection.state === 'online', 'the reconnect');
  });

  it('starts and stops live tracking without re-reading the inventory', async () => {
    const { session, shelly, inventory } = await harness({
      handler: (method) =>
        method === 'Presence.GetStatus'
          ? {
              live_track: {
                timer_started_at: Date.now() / 1000,
                timer_duration: 300,
                interval: 1,
              },
            }
          : undefined,
    });
    inventory.mockClear();
    const before = shelly.calls.length;
    await session.startTracking('viewer');
    await session.stopTracking('viewer');
    const methods = shelly.calls.slice(before).map((call) => call.method);
    expect(methods).toEqual(['Presence.LiveTrack', 'Presence.GetStatus', 'Presence.LiveTrack']);
    expect(inventory).not.toHaveBeenCalled();
  });

  it('keeps its tracking holders across a reconnect and starts tracking again', async () => {
    const { session, shelly } = await harness({
      handler: (method) =>
        method === 'Presence.GetStatus'
          ? {
              live_track: {
                timer_started_at: Date.now() / 1000,
                timer_duration: 300,
                interval: 1,
              },
            }
          : undefined,
    });
    const starts = (): number =>
      shelly.calls.filter(
        (call) =>
          call.method === 'Presence.LiveTrack' && JSON.stringify(call.params) === '{"enable":true}',
      ).length;
    await session.startTracking('viewer');
    expect(starts()).toBe(1);
    shelly.dropClients();
    await until(() => session.current().connection.state === 'offline', 'the drop');
    await until(() => starts() === 2, 'tracking to start again after the reconnect');
    expect(await session.stopTracking('viewer')).toEqual({ enabled: false });
    expect(shelly.calls.at(-1)).toMatchObject({
      method: 'Presence.LiveTrack',
      params: { enable: false },
    });
  });

  it('remembers a tracking holder while the sensor is offline and starts it on connect', async () => {
    const { session, shelly } = await harness({
      handler: (method) =>
        method === 'Presence.GetStatus'
          ? {
              live_track: {
                timer_started_at: Date.now() / 1000,
                timer_duration: 300,
                interval: 1,
              },
            }
          : undefined,
    });
    shelly.dropClients();
    await until(() => session.current().connection.state === 'offline', 'the drop');
    await session.startTracking('viewer');
    await until(
      () =>
        shelly.calls.some(
          (call) =>
            call.method === 'Presence.LiveTrack' &&
            JSON.stringify(call.params) === '{"enable":true}',
        ),
      'tracking to start when the sensor is back',
    );
  });
});
