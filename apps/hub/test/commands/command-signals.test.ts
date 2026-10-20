import type { SignalInput } from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureLogs, type CapturedLogs } from '../support/logs';
import { deviceIdOf, startedHub, type StartedHub } from '../support/started-hub';
import { testStore, type TestStore } from '../support/store';

const FEED_DATA = z.object({ status: z.string() });

let logs: CapturedLogs;
let opened: TestStore;
let started: StartedHub;
let heard: SignalInput[];

beforeEach(async () => {
  logs = captureLogs();
  opened = await testStore();
  started = await startedHub(opened);
  heard = [];
  started.hub.signals.subscribe((signal) => {
    if (signal.source === 'device' && signal.kind === 'command') heard.push(signal);
  });
});

afterEach(async () => {
  await started.hub.stop();
  await opened.close();
});

function statusesOf(): unknown[] {
  return heard.map((signal) => signal.data['status']);
}

describe('device command signals', () => {
  it('announces a command when it is sent and again when it is done, once each', async () => {
    const lamp = deviceIdOf(started.store, 'lamp-1');
    started.hub.submit([
      { deviceId: lamp, capability: 'brightness', value: 40, source: 'app', requestedBy: null },
    ]);
    await started.hub.settled();
    expect(statusesOf()).toStrictEqual(['sent', 'done']);
    expect(heard[0]).toMatchObject({
      subject: lamp,
      field: 'brightness',
      value: 40,
      data: { capability: 'brightness', cause: 'app', error: null },
    });
    expect(logs.events()).not.toContain('signals.unregistered');
  });

  it('says who sent the command', async () => {
    const lamp = deviceIdOf(started.store, 'lamp-1');
    started.hub.submit([
      { deviceId: lamp, capability: 'power', value: true, source: 'assistant', requestedBy: null },
      { deviceId: lamp, capability: 'power', value: false, source: 'scene', requestedBy: null },
    ]);
    await started.hub.settled();
    expect(heard.filter((signal) => signal.data['status'] === 'sent')).toHaveLength(2);
    expect(heard.map((signal) => signal.data['cause'])).toStrictEqual(
      expect.arrayContaining(['assistant', 'scene']),
    );
  });

  it('announces a failure with the reason it gives', async () => {
    const lamp = deviceIdOf(started.store, 'lamp-1');
    started.hub.submit([
      { deviceId: lamp, capability: 'brightness', value: 400, source: 'app', requestedBy: null },
    ]);
    await started.hub.settled();
    expect(statusesOf()).toStrictEqual(['sent', 'failed']);
    expect(heard[1]?.data['error']).toBe(
      'InvalidValueError: Expected a number value: outside 1 to 100. Received 400.',
    );
  });

  it('announces a device that fails to carry out the command', async () => {
    started.fake.adapter.failure = new Error('lamp unreachable');
    const lamp = deviceIdOf(started.store, 'lamp-1');
    started.hub.submit([
      { deviceId: lamp, capability: 'power', value: true, source: 'automation', requestedBy: null },
    ]);
    await started.hub.settled();
    expect(statusesOf()).toStrictEqual(['sent', 'failed']);
    expect(heard[1]?.data).toMatchObject({ cause: 'automation' });
    expect(heard[1]?.data['error']).toEqual(expect.stringContaining('lamp unreachable'));
  });

  it('announces a command that waited past its lifetime as timed out', () => {
    const lamp = deviceIdOf(started.store, 'lamp-1');
    const [row] = started.store.commands.insert([
      { deviceId: lamp, capability: 'power', value: true, source: 'app', requestedBy: null },
    ]);
    started.store.commands.finish(row?.id ?? '', { status: 'expired' });
    expect(statusesOf()).toStrictEqual(['sent', 'timed_out']);
  });

  it('stays silent for the running step and for commands the hub runs on itself', () => {
    const lamp = deviceIdOf(started.store, 'lamp-1');
    const [row] = started.store.commands.insert([
      { deviceId: lamp, capability: 'power', value: true, source: 'app', requestedBy: null },
    ]);
    started.store.commands.claim(row?.id ?? '', 'pending');
    started.store.commands.insert([
      {
        deviceId: null,
        capability: 'hub:discover',
        value: { provider: 'xiaomi' },
        source: 'app',
        requestedBy: null,
      },
    ]);
    expect(statusesOf()).toStrictEqual(['sent']);
  });

  it('writes only failed and timed out commands into the activity feed', async () => {
    const lamp = deviceIdOf(started.store, 'lamp-1');
    started.hub.submit([
      { deviceId: lamp, capability: 'power', value: true, source: 'app', requestedBy: null },
      { deviceId: lamp, capability: 'brightness', value: 400, source: 'app', requestedBy: null },
    ]);
    await started.hub.settled();
    const [expired] = started.store.commands.insert([
      { deviceId: lamp, capability: 'power', value: false, source: 'app', requestedBy: null },
    ]);
    started.store.commands.finish(expired?.id ?? '', { status: 'expired' });
    await started.hub.settled();
    const rows = started.store.events
      .list({ limit: 20 })
      .filter((event) => event.kind === 'signal' && event.details['kind'] === 'command');
    expect(rows.map((row) => FEED_DATA.parse(row.details['data']).status).sort()).toStrictEqual([
      'failed',
      'timed_out',
    ]);
    expect(rows.every((row) => row.device_id === lamp)).toBe(true);
  });
});
