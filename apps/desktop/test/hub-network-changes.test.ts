import { EventEmitter } from 'node:events';
import { Message, MessageType } from '@jellybrick/dbus-next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeHubNetworkChange } from '@smarteverything/domain';
import { HubNetworkChanges, type NetworkBus } from '../src/hub-network/network.js';

const MANAGER = 'org.freedesktop.NetworkManager';
const PROPERTIES = 'org.freedesktop.DBus.Properties';
const COALESCE_MS = 500;

class FakeBus extends EventEmitter implements NetworkBus {
  readonly calls: string[] = [];
  disconnected = false;
  failure: Error | null = null;
  call(message: Message): Promise<Message | null> {
    if (this.failure !== null) return Promise.reject(this.failure);
    this.calls.push(`${message.member}:${String(message.body[0])}`);
    return Promise.resolve(null);
  }
  disconnect(): void {
    this.disconnected = true;
  }
  signal(path: string, iface: string, member: string, body: unknown[] = []): void {
    this.emit(
      'message',
      new Message({ type: MessageType.SIGNAL, path, interface: iface, member, body }),
    );
  }
}

let bus: FakeBus;
let events: NativeHubNetworkChange[];
let changes: HubNetworkChanges;

beforeEach(() => {
  vi.useFakeTimers();
  bus = new FakeBus();
  events = [];
  changes = new HubNetworkChanges(
    (state) => events.push(state),
    () => bus,
  );
});

afterEach(() => {
  changes.stop();
  vi.useRealTimers();
});

describe.runIf(process.platform === 'linux')('HubNetworkChanges', () => {
  it('watches only the NetworkManager state signal and the properties that decide the route', async () => {
    expect(await changes.start()).toMatchObject({ state: 'watching' });
    expect(bus.calls[0]).toBe(`GetNameOwner:${MANAGER}`);
    expect(bus.calls.slice(1).join(' ')).toContain("member='StateChanged'");
    expect(bus.calls.slice(1).join(' ')).toContain("member='PropertiesChanged'");
    expect(bus.calls.slice(1).join(' ')).toContain(`arg0='${MANAGER}'`);
  });

  it('ignores signal strength and traffic counters that change every few seconds', async () => {
    await changes.start();
    bus.signal('/org/freedesktop/NetworkManager/AccessPoint/7', PROPERTIES, 'PropertiesChanged', [
      'org.freedesktop.NetworkManager.AccessPoint',
      { Strength: { signature: 'y', value: 60 } },
      [],
    ]);
    bus.signal('/org/freedesktop/NetworkManager/Devices/2', PROPERTIES, 'PropertiesChanged', [
      'org.freedesktop.NetworkManager.Device.Statistics',
      { RxBytes: { signature: 't', value: 10n } },
      [],
    ]);
    bus.signal('/org/freedesktop/NetworkManager', PROPERTIES, 'PropertiesChanged', [
      MANAGER,
      { Metered: { signature: 'u', value: 1 } },
      [],
    ]);
    await vi.advanceTimersByTimeAsync(COALESCE_MS * 2);
    expect(events).toStrictEqual([]);
  });

  it('reports a real switch once, however many signals announce it', async () => {
    await changes.start();
    bus.signal('/org/freedesktop/NetworkManager', MANAGER, 'StateChanged', [70]);
    bus.signal('/org/freedesktop/NetworkManager', PROPERTIES, 'PropertiesChanged', [
      MANAGER,
      {
        PrimaryConnection: {
          signature: 'o',
          value: '/org/freedesktop/NetworkManager/ActiveConnection/3',
        },
      },
      [],
    ]);
    bus.signal('/org/freedesktop/NetworkManager', PROPERTIES, 'PropertiesChanged', [
      MANAGER,
      { Connectivity: { signature: 'u', value: 4 } },
      [],
    ]);
    expect(events).toStrictEqual([]);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ state: 'watching', detail: 'Network changed' });
    bus.signal('/org/freedesktop/NetworkManager', MANAGER, 'StateChanged', [20]);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(events).toHaveLength(2);
  });

  it('keeps one connection when asked to start twice and lets go when stopped', async () => {
    await changes.start();
    await changes.start();
    expect(bus.calls.filter((call) => call.startsWith('GetNameOwner'))).toHaveLength(1);
    bus.signal('/org/freedesktop/NetworkManager', MANAGER, 'StateChanged', [70]);
    changes.stop();
    await vi.advanceTimersByTimeAsync(COALESCE_MS * 2);
    expect(events).toStrictEqual([]);
    expect(bus.disconnected).toBe(true);
    expect(changes.watching).toBe(false);
  });

  it('does not claim to be watching when it was stopped while still starting', async () => {
    const started = changes.start();
    changes.stop();
    expect(await started).toMatchObject({ state: 'unavailable' });
    expect(changes.watching).toBe(false);
  });

  it('says NetworkManager is unavailable when it is not running', async () => {
    bus.failure = new Error('The name is not owned');
    expect(await changes.start()).toMatchObject({
      state: 'unavailable',
      detail: 'The name is not owned',
    });
    expect(changes.watching).toBe(false);
  });
});
