import type { DeviceRow, PhoneActionResult, ProcessWindow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceTarget, Viewers } from '../../src/metrics/viewers';
import { PhoneLive, LIVE_RENEW_MS } from '../../src/phones/phone-live';
import type { PhoneTarget } from '../../src/phones/phone-nodes';
import { captureLogs, testLogger } from '../support/logs';
import { addPhoneDevice, idlePhoneNodes } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

interface Pushed {
  readonly clientId: string;
  readonly on: boolean;
}

let test: TestStore;
let viewers: Viewers<ProcessWindow>;
let pushed: Pushed[];
let answer: { ok: boolean; detail: string };
let live: PhoneLive;
let phone: DeviceRow;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  captureLogs();
  test = await testStore();
  viewers = new Viewers<ProcessWindow>();
  pushed = [];
  answer = { ok: true, detail: 'Live.' };
  phone = addPhoneDevice(test, {
    clientId: 'client-1',
    profileId: test.store.profiles.first().id,
    name: 'Pixel',
  }).device;
  const nodes = idlePhoneNodes(test);
  live = new PhoneLive({
    store: test.store,
    viewers,
    actions: {
      live: (target, on): Promise<PhoneActionResult> => {
        pushed.push({ clientId: target.clientId, on });
        return Promise.resolve(answer);
      },
    },
    target: (device): PhoneTarget => nodes.target(device),
    log: testLogger('phone'),
  });
  live.start();
});

afterEach(async () => {
  live.stop();
  vi.useRealTimers();
  await test.close();
});

function watch(holder: string, deviceId = phone.id, topics = ['live']): void {
  viewers.hold(
    holder,
    topics.map((topic) => ({ target: deviceTarget(deviceId), topic })),
  );
}

describe('phone live mode', () => {
  it('turns live on for the first watcher and off after the last one leaves', () => {
    watch('a');
    watch('b');
    expect(pushed).toEqual([{ clientId: 'client-1', on: true }]);
    viewers.release('a');
    expect(pushed).toHaveLength(1);
    viewers.release('b');
    expect(pushed).toEqual([
      { clientId: 'client-1', on: true },
      { clientId: 'client-1', on: false },
    ]);
  });

  it('ignores a watch of the phone that does not ask for live', () => {
    watch('a', phone.id, ['summary']);
    expect(pushed).toEqual([]);
  });

  it('asks again every nine minutes while someone still watches, and stops when they leave', async () => {
    watch('a');
    await vi.advanceTimersByTimeAsync(LIVE_RENEW_MS);
    expect(pushed.filter((push) => push.on)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(LIVE_RENEW_MS);
    expect(pushed.filter((push) => push.on)).toHaveLength(3);
    viewers.release('a');
    await vi.advanceTimersByTimeAsync(LIVE_RENEW_MS * 3);
    expect(pushed.filter((push) => push.on)).toHaveLength(3);
    expect(pushed.at(-1)?.on).toBe(false);
  });

  it('asks again when the phone next reports after it could not be reached, once it answers', async () => {
    answer = { ok: false, detail: 'Pixel could not be reached' };
    watch('a');
    await vi.advanceTimersByTimeAsync(0);
    answer = { ok: true, detail: 'Live.' };
    live.reported(phone.id);
    await vi.advanceTimersByTimeAsync(0);
    live.reported(phone.id);
    expect(pushed.filter((push) => push.on)).toHaveLength(2);
  });

  it('does not ask again on a report while nobody watches', async () => {
    answer = { ok: false, detail: 'Pixel could not be reached' };
    watch('a');
    await vi.advanceTimersByTimeAsync(0);
    viewers.release('a');
    live.reported(phone.id);
    expect(pushed.filter((push) => push.on)).toHaveLength(1);
  });

  it('follows a phone that is added after it started and forgets one that is removed', () => {
    const later = addPhoneDevice(test, {
      clientId: 'client-2',
      profileId: test.store.profiles.first().id,
      name: 'Tablet',
    }).device;
    watch('a', later.id);
    expect(pushed).toEqual([{ clientId: 'client-2', on: true }]);
    test.store.devices.remove([later.id]);
    viewers.release('a');
    expect(pushed).toHaveLength(1);
  });

  it('leaves devices that are not phones alone', () => {
    const [light] = test.store.devices.upsert([
      {
        provider: 'local',
        externalId: 'light:1',
        parentId: null,
        kind: 'light',
        name: 'Lamp',
        model: 'm',
        manufacturer: 'v',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    watch('a', light?.id);
    expect(pushed).toEqual([]);
  });
});
