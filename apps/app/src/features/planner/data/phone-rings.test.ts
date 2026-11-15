import { type PlannerPhoneRingSet } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../modules/health-connect', () => ({
  installPhoneRings: vi.fn(),
  plannerLinked: (): boolean => true,
}));
vi.mock('../../../api/transport', () => ({ api: vi.fn() }));
vi.mock('../../../store/selectors', () => ({ useSession: vi.fn(), useSyncStatus: vi.fn() }));

import { PhoneRingsSync, syncPhoneRings, type PhoneRingsLink } from './phone-rings';

const CLIENT = '5d7b1d8e-6a43-4c1c-8d1f-2a9b3c4d5e6f';

function set(hash: string): PlannerPhoneRingSet {
  return { hash, rings: [], bedtimeWindows: [] };
}

function link(overrides: Partial<PhoneRingsLink> = {}): PhoneRingsLink & {
  readonly installed: string[];
} {
  const installed: string[] = [];
  return {
    installed,
    linked: () => true,
    read: () => Promise.resolve(set('one')),
    install: (value): Promise<void> => {
      installed.push(value.hash);
      return Promise.resolve();
    },
    ...overrides,
  };
}

describe('syncPhoneRings', () => {
  it('reads the set once and installs it once', async () => {
    const read = vi.fn(() => Promise.resolve(set('one')));
    const calls = link({ read });
    expect(await syncPhoneRings(calls, CLIENT)).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    expect(calls.installed).toEqual(['one']);
  });

  it('does nothing without the native module', async () => {
    const read = vi.fn();
    expect(await syncPhoneRings(link({ linked: () => false, read }), CLIENT)).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it('passes an install failure on', async () => {
    const failure = new Error('native refused');
    const calls = link({ install: () => Promise.reject(failure) });
    await expect(syncPhoneRings(calls, CLIENT)).rejects.toBe(failure);
  });
});

describe('PhoneRingsSync', () => {
  it('runs once more when asked during a run, never in parallel', async () => {
    let release: () => void = () => undefined;
    let active = 0;
    let peak = 0;
    let reads = 0;
    const calls = link({
      read: async () => {
        reads += 1;
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        active -= 1;
        return set('one');
      },
    });
    const sync = new PhoneRingsSync(calls, () => CLIENT);
    const first = sync.request();
    await sync.request();
    release();
    await vi.waitFor(() => {
      expect(reads).toBe(2);
    });
    release();
    await first;
    expect(peak).toBe(1);
  });

  it('skips when the client is not known and survives a failed sync', async () => {
    const read = vi.fn();
    await new PhoneRingsSync(link({ read }), () => null).request();
    expect(read).not.toHaveBeenCalled();
    const failing = link({ read: () => Promise.reject(new Error('offline')) });
    await expect(new PhoneRingsSync(failing, () => CLIENT).request()).resolves.toBeUndefined();
  });
});
