import type { SignalInput, TelevisionSettingsRow } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TelevisionDidNotWakeError,
  TelevisionWake,
  WAKE_DEADLINE_MS,
  WAKE_REPORT_MS,
  WakePacketsFailedError,
} from '../src/commands/television-wake';
import { WAKE_BOOT_MS, WAKE_BURSTS, WAKE_RESENDS_MS } from '../src/network/wake-budget';
import type { SignalListener } from '../src/signals/bus';
import { captureLogs, testLogger } from './support/logs';

const TV = 'tv-1';

const START = Date.parse('2026-10-18T12:00:00.000Z');

const SETTINGS: TelevisionSettingsRow = {
  device_id: TV,
  direct_host: null,
  direct_mac: null,
  input_names: {},
  wake_macs: ['a1:b2:c3:d4:e5:f6'],
  wake_worked_at: null,
};

interface Timer {
  readonly at: number;
  readonly action: () => void;
  cancelled: boolean;
}

interface Rig {
  readonly wake: TelevisionWake;
  readonly packets: string[];
  readonly woke: string[];
  readonly timers: Timer[];
  readonly listeners: Set<SignalListener>;
  online: boolean;
  settings: TelevisionSettingsRow | undefined;
  failWith: Error | null;
}

function signal(subject: string, value: boolean): SignalInput {
  return {
    source: 'device',
    kind: 'online',
    subject,
    field: null,
    value,
    previous: null,
    at: new Date(START).toISOString(),
    profileId: null,
    data: {},
  };
}

function heard(value: SignalInput): void {
  for (const listener of rig.listeners) {
    listener(value);
  }
}

function fire(after: number): void {
  for (const timer of rig.timers.filter((entry) => entry.at === START + after)) {
    if (!timer.cancelled) {
      timer.action();
    }
  }
}

let rig: Rig;

beforeEach(() => {
  captureLogs();
  const current: Rig = {
    packets: [],
    woke: [],
    timers: [],
    listeners: new Set(),
    online: false,
    settings: SETTINGS,
    failWith: null,
    wake: new TelevisionWake({
      wake: (mac): Promise<void> => {
        if (current.failWith !== null) {
          return Promise.reject(current.failWith);
        }
        current.packets.push(mac);
        return Promise.resolve();
      },
      settingsOf: () => current.settings,
      woke: (deviceId): void => {
        current.woke.push(deviceId);
      },
      online: () => current.online,
      subscribe: (listener) => {
        current.listeners.add(listener);
        return () => {
          current.listeners.delete(listener);
        };
      },
      clock: {
        now: () => new Date(START),
        at: (moment, action) => {
          const timer: Timer = { at: moment.getTime(), action, cancelled: false };
          current.timers.push(timer);
          return () => {
            timer.cancelled = true;
          };
        },
        sleep: () => Promise.resolve(),
      },
      log: testLogger('television'),
    }),
  };
  rig = current;
});

describe('turning on a screen', () => {
  it('asks SmartThings straight away when the screen is online', async () => {
    rig.online = true;
    const switchOn = vi.fn(() => Promise.resolve('on'));
    await expect(rig.wake.powerOn(TV, switchOn)).resolves.toBe('on');
    expect(rig.packets).toStrictEqual([]);
  });

  it('wakes an offline screen at its address and switches it on once it is online', async () => {
    const switchOn = vi.fn(() => Promise.resolve('on'));
    const result = rig.wake.powerOn(TV, switchOn);
    expect(rig.packets).toStrictEqual(['a1:b2:c3:d4:e5:f6']);
    heard(signal('tv-2', true));
    heard(signal(TV, false));
    expect(switchOn).not.toHaveBeenCalled();
    heard(signal(TV, true));
    await expect(result).resolves.toBe('on');
    expect(switchOn).toHaveBeenCalledTimes(1);
    expect(rig.listeners.size).toBe(0);
    expect(rig.timers.every((timer) => timer.cancelled)).toBe(true);
    expect(rig.woke).toStrictEqual([TV]);
  });

  it('derives the resend times and the deadline from the wake budget', () => {
    expect(WAKE_DEADLINE_MS).toBe(WAKE_BOOT_MS + WAKE_REPORT_MS);
    expect(WAKE_RESENDS_MS).toHaveLength(WAKE_BURSTS - 1);
    expect(WAKE_RESENDS_MS.every((after) => after > 0 && after < WAKE_BOOT_MS)).toBe(true);
    expect(WAKE_RESENDS_MS).toStrictEqual([...WAKE_RESENDS_MS].sort((left, right) => left - right));
  });

  it('sends the packets again while it waits', async () => {
    const result = rig.wake.powerOn(TV, () => Promise.resolve(null));
    for (const after of WAKE_RESENDS_MS) {
      fire(after);
    }
    expect(rig.packets).toHaveLength(1 + WAKE_RESENDS_MS.length);
    heard(signal(TV, true));
    await expect(result).resolves.toBeNull();
  });

  it('fails without claiming success when the screen never comes online', async () => {
    const switchOn = vi.fn(() => Promise.resolve(null));
    const result = rig.wake.powerOn(TV, switchOn);
    fire(WAKE_DEADLINE_MS);
    await expect(result).rejects.toThrow(new TelevisionDidNotWakeError(TV));
    await expect(result).rejects.toThrow(/Power On with Mobile/);
    expect(switchOn).not.toHaveBeenCalled();
    expect(rig.woke).toStrictEqual([]);
    expect(rig.listeners.size).toBe(0);
  });

  it('refuses with what to do when the screen has no wake address', async () => {
    rig.settings = { ...SETTINGS, wake_macs: [] };
    await expect(rig.wake.powerOn(TV, () => Promise.resolve(null))).rejects.toThrow(
      /choose Link directly and allow it on the screen/,
    );
    rig.settings = undefined;
    await expect(rig.wake.powerOn(TV, () => Promise.resolve(null))).rejects.toThrow(
      /enter its Wake-on-LAN address/,
    );
    expect(rig.packets).toStrictEqual([]);
  });

  it('reports packets that could not be sent', async () => {
    rig.failWith = new Error('network unreachable');
    await expect(rig.wake.powerOn(TV, () => Promise.resolve(null))).rejects.toThrow(
      new WakePacketsFailedError(TV, new Error('network unreachable')),
    );
    expect(rig.listeners.size).toBe(0);
  });
});
