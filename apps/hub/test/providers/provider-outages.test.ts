import type { SignalInput } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureLogs } from '../support/logs';
import { until } from '../support/wait';
import { deviceIdOf, startedHub, type StartedHub } from '../support/started-hub';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let started: StartedHub;
let statuses: SignalInput[];
let online: SignalInput[];

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  started = await startedHub(opened);
  statuses = [];
  online = [];
  started.hub.signals.subscribe((signal) => {
    if (signal.source === 'provider') statuses.push(signal);
    if (signal.source === 'event' && signal.kind.startsWith('device_o')) online.push(signal);
  });
});

afterEach(async () => {
  await started.hub.stop();
  await opened.close();
});

const NETWORK_FAILURE = Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED' });

async function lose(): Promise<void> {
  const context = started.fake.started[0]?.context;
  await context?.needsAttention(NETWORK_FAILURE);
}

function recover(): void {
  started.store.providers.change('xiaomi', {
    status: 'linked',
    problem: null,
    lastError: null,
  });
}

function isOnline(externalId: string): boolean {
  return started.store.devices.byId(deviceIdOf(started.store, externalId)).online;
}

function eventKinds(): string[] {
  return started.store.events.list({ limit: 50 }).map((event) => event.kind);
}

function statesOf(): unknown[] {
  return statuses.map((signal) => signal.value);
}

describe('provider outages', () => {
  it('says a service is down once, however many times its link row changes', async () => {
    await lose();
    await lose();
    started.store.providers.change('xiaomi', { phase: 'discovering' });
    await started.hub.settled();
    expect(statesOf()).toStrictEqual(['down']);
    expect(statuses[0]).toMatchObject({
      subject: 'xiaomi',
      previous: 'linked',
      data: { state: 'down', provider: 'xiaomi', problem: 'network' },
    });
    expect(eventKinds().filter((kind) => kind === 'provider_error')).toHaveLength(1);
  });

  it('tells a service that needs signing in again from one that cannot be reached', async () => {
    const context = started.fake.started[0]?.context;
    await context?.needsAttention(
      Object.assign(new Error('expired'), { problem: 'session_expired' }),
    );
    await started.hub.settled();
    expect(statuses.at(-1)).toMatchObject({
      value: 'attention',
      data: { problem: 'session_expired' },
    });
  });

  it('says when the service is back and opens a new outage the next time it is lost', async () => {
    await lose();
    recover();
    await lose();
    await started.hub.settled();
    expect(statesOf().slice(0, 2)).toStrictEqual(['down', 'linked']);
    expect(eventKinds().filter((kind) => kind === 'provider_error')).toHaveLength(2);
  });

  it('keeps device offline and back online rows out of the feed while its service is down', async () => {
    const sink = started.fake.adapter.sink;
    await started.hub.settled();
    const before = eventKinds().filter((kind) => kind === 'device_online').length;
    await lose();
    sink?.online('lamp-1', false);
    sink?.online('lamp-2', false);
    await until(() => !isOnline('lamp-1') && !isOnline('lamp-2'), 'both lamps offline');
    await started.hub.settled();
    expect(eventKinds()).not.toContain('device_offline');
    expect(online).toStrictEqual([]);
    sink?.online('lamp-1', true);
    sink?.online('lamp-2', true);
    await until(() => isOnline('lamp-1') && isOnline('lamp-2'), 'both lamps back online');
    recover();
    await started.hub.settled();
    expect(eventKinds().filter((kind) => kind === 'device_online')).toHaveLength(before);
  });

  it('records device offline rows again once the service has recovered', async () => {
    const sink = started.fake.adapter.sink;
    await lose();
    recover();
    sink?.online('lamp-1', false);
    await until(() => !isOnline('lamp-1'), 'the lamp offline');
    await started.hub.settled();
    expect(eventKinds()).toContain('device_offline');
    expect(online.map((signal) => signal.subject)).toStrictEqual([
      deviceIdOf(started.store, 'lamp-1'),
    ]);
  });

  it('still flips the devices themselves while the service is down', async () => {
    await lose();
    started.fake.adapter.sink?.online('lamp-1', false);
    await until(() => !isOnline('lamp-1'), 'the lamp offline');
    expect(isOnline('lamp-2')).toBe(true);
  });
});

describe('adapter failures', () => {
  function fail(operation: string, message: string): void {
    started.fake.adapter.sink?.failure({
      provider: 'xiaomi',
      externalId: null,
      operation,
      cause: new Error(message),
    });
  }

  it('writes no connection problem row for single failures, however they take turns', async () => {
    fail('poll', 'timeout');
    fail('resync', 'timeout');
    fail('poll', 'forbidden');
    fail('resync', 'forbidden');
    fail('poll', 'timeout');
    await started.hub.settled();
    expect(eventKinds().filter((kind) => kind === 'provider_error')).toHaveLength(0);
    expect(statuses).toStrictEqual([]);
  });

  it('keeps the last failure on the link so an outage row can name it', async () => {
    fail('poll', 'timeout');
    await until(
      () => started.store.providers.find('xiaomi')?.last_error === 'poll: Error: timeout',
      'the failure kept on the link',
    );
  });
});
