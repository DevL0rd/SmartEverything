import { ApiError, type PlannerPhoneRingSet } from '@smarteverything/domain';
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
  return { hash, rings: [] };
}

function link(overrides: Partial<PhoneRingsLink> = {}): PhoneRingsLink & {
  readonly installed: string[];
  readonly acked: string[];
} {
  const installed: string[] = [];
  const acked: string[] = [];
  return {
    installed,
    acked,
    linked: () => true,
    read: () => Promise.resolve(set('one')),
    install: (value): Promise<void> => {
      installed.push(value.hash);
      return Promise.resolve();
    },
    ack: (_client, hash): Promise<void> => {
      acked.push(hash);
      return Promise.resolve();
    },
    ...overrides,
  };
}

describe('syncPhoneRings', () => {
  it('reads, installs and acknowledges the set with its hash', async () => {
    const calls = link();
    expect(await syncPhoneRings(calls, CLIENT)).toBe(true);
    expect(calls.installed).toEqual(['one']);
    expect(calls.acked).toEqual(['one']);
  });

  it('reads again after a conflict reply', async () => {
    const hashes = ['one', 'two'];
    let refuse = true;
    const calls = link({
      read: () => Promise.resolve(set(hashes.shift() ?? 'last')),
      ack: (_client, hash) => {
        if (refuse) {
          refuse = false;
          return Promise.reject(new ApiError('conflict', 'changed'));
        }
        calls.acked.push(hash);
        return Promise.resolve();
      },
    });
    expect(await syncPhoneRings(calls, CLIENT)).toBe(true);
    expect(calls.installed).toEqual(['one', 'two']);
    expect(calls.acked).toEqual(['two']);
  });

  it('does nothing without the native module', async () => {
    const read = vi.fn();
    expect(await syncPhoneRings(link({ linked: () => false, read }), CLIENT)).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it('passes other errors on', async () => {
    const calls = link({ ack: () => Promise.reject(new ApiError('forbidden', 'no')) });
    await expect(syncPhoneRings(calls, CLIENT)).rejects.toBeInstanceOf(ApiError);
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
