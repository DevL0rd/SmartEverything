import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { DesktopComputerIdentity, DesktopServiceStatus } from '@smarteverything/domain';

vi.mock('expo-router', () => ({ usePathname: (): string => '' }));
vi.mock('../../../api/transport', () => ({ api: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn().mockResolvedValue(undefined) },
}));

const { DESKTOP_IDENTITY_KEY, desktopTarget, followDesktopIdentity } =
  await import('./desktop-harness');

const OLD_DEVICE = '00000000-0000-4000-8000-000000000001';
const DEVICE = '00000000-0000-4000-8000-000000000002';
const MACHINE = '484e39c215d14bd68cd5f8679d8febbb';
const RUNNING: DesktopServiceStatus = {
  manager: 'systemd',
  health: 'running',
  installed: true,
  active: true,
  url: null,
  dataDirectory: '/computer',
  detail: '',
  linger: 'unsupported',
};

function serviceEvents(): {
  readonly onServiceStatus: (listener: (status: DesktopServiceStatus) => void) => () => void;
  readonly emit: () => void;
  readonly listenerCount: () => number;
} {
  const listeners = new Set<(status: DesktopServiceStatus) => void>();
  return {
    onServiceStatus: (listener) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    emit: (): void => {
      for (const listener of listeners) listener(RUNNING);
    },
    listenerCount: (): number => listeners.size,
  };
}

describe('desktop execution identity', () => {
  it('shares one service listener and one identity read across consumers until the last detaches', async () => {
    const client = new QueryClient();
    const current: DesktopComputerIdentity = { device_id: DEVICE, machine_id: MACHINE };
    client.setQueryData(DESKTOP_IDENTITY_KEY, current);
    const read = vi.fn((): Promise<DesktopComputerIdentity> => Promise.resolve(current));
    const observer = new QueryObserver(client, {
      queryKey: DESKTOP_IDENTITY_KEY,
      queryFn: read,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    const bridge = serviceEvents();
    const stops = [0, 1, 2].map(() => followDesktopIdentity(bridge, client));
    expect(bridge.listenerCount()).toBe(1);
    bridge.emit();
    await vi.waitFor(() => {
      expect(read).toHaveBeenCalledTimes(1);
    });
    stops[0]?.();
    stops[0]?.();
    expect(bridge.listenerCount()).toBe(1);
    stops[1]?.();
    expect(bridge.listenerCount()).toBe(1);
    stops[2]?.();
    expect(bridge.listenerCount()).toBe(0);
    const stopAgain = followDesktopIdentity(bridge, client);
    expect(bridge.listenerCount()).toBe(1);
    stopAgain();
    unsubscribe();
    client.clear();
  });

  it.each([false, true])(
    'discards a pre-event identity response with cached data %s',
    async (cached) => {
      const client = new QueryClient();
      const initial: DesktopComputerIdentity = { device_id: OLD_DEVICE, machine_id: MACHINE };
      const current: DesktopComputerIdentity = { device_id: DEVICE, machine_id: MACHINE };
      if (cached) client.setQueryData(DESKTOP_IDENTITY_KEY, initial);
      const pending: ((identity: DesktopComputerIdentity) => void)[] = [];
      const read = vi.fn(
        () => new Promise<DesktopComputerIdentity>((resolve) => pending.push(resolve)),
      );
      const observer = new QueryObserver(client, {
        queryKey: DESKTOP_IDENTITY_KEY,
        queryFn: read,
      });
      const unsubscribe = observer.subscribe(() => undefined);
      expect(read).toHaveBeenCalledTimes(1);
      const bridge = serviceEvents();
      const stop = followDesktopIdentity(bridge, client);
      bridge.emit();
      await vi.waitFor(() => {
        expect(read).toHaveBeenCalledTimes(2);
      });
      pending[1]?.(current);
      await vi.waitFor(() => {
        expect(client.getQueryData(DESKTOP_IDENTITY_KEY)).toEqual(current);
      });
      pending[0]?.(initial);
      await Promise.resolve();
      expect(client.getQueryData(DESKTOP_IDENTITY_KEY)).toEqual(current);
      stop();
      unsubscribe();
      client.clear();
    },
  );

  it('rereads a cached identity after the computer service changes and stops when detached', async () => {
    const client = new QueryClient();
    const initial: DesktopComputerIdentity = { device_id: OLD_DEVICE, machine_id: MACHINE };
    const current: DesktopComputerIdentity = { device_id: DEVICE, machine_id: MACHINE };
    client.setQueryData(DESKTOP_IDENTITY_KEY, initial);
    const read = vi.fn((): Promise<DesktopComputerIdentity> => Promise.resolve(current));
    const observer = new QueryObserver(client, {
      queryKey: DESKTOP_IDENTITY_KEY,
      queryFn: read,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    const listeners = new Set<(status: DesktopServiceStatus) => void>();
    const stop = followDesktopIdentity(
      {
        onServiceStatus: (listener) => {
          listeners.add(listener);
          return (): void => {
            listeners.delete(listener);
          };
        },
      },
      client,
    );
    expect(client.getQueryData(DESKTOP_IDENTITY_KEY)).toEqual(initial);
    for (const listener of listeners) listener(RUNNING);
    await vi.waitFor(() => {
      expect(client.getQueryData(DESKTOP_IDENTITY_KEY)).toEqual(current);
    });
    expect(read).toHaveBeenCalledTimes(1);
    stop();
    expect(listeners.size).toBe(0);
    unsubscribe();
    client.clear();
  });

  it('preserves an explicit paired device even when another host has the same machine identity', () => {
    expect(
      desktopTarget(
        { device_id: DEVICE, machine_id: MACHINE },
        {
          hosts: [{ target: { kind: 'device', device_id: OLD_DEVICE }, machine_id: MACHINE }],
        },
      ),
    ).toEqual({ kind: 'device', device_id: DEVICE });
  });

  it('leaves a hub desktop unresolved when its machine identity names multiple hosts', () => {
    expect(
      desktopTarget(
        { device_id: null, machine_id: MACHINE },
        {
          hosts: [OLD_DEVICE, DEVICE].map((device_id) => ({
            target: { kind: 'device' as const, device_id },
            machine_id: MACHINE,
          })),
        },
      ),
    ).toBeNull();
  });
});
