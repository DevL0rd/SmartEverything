import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, HUB_GUARD_MESSAGE } from '@smarteverything/domain';

interface Calls {
  bodies: { unit: string; operation: string; confirm?: boolean }[];
  failures: Error[];
  accept: boolean;
  asked: string[];
}

const calls = vi.hoisted((): Calls => ({ bodies: [], failures: [], accept: true, asked: [] }));

const SERVICES = {
  services: [
    {
      unit: 'backup.service',
      description: 'Backup',
      state: 'inactive',
      startsAtLogin: true,
      system: false,
    },
  ],
  timers: [],
};

vi.mock('../../../api/transport', () => ({
  api: (): { call: (endpoint: unknown, options: { body: never }) => Promise<unknown> } => ({
    call: (_endpoint, options): Promise<unknown> => {
      calls.bodies.push(options.body);
      const failure = calls.failures.shift();
      return failure === undefined ? Promise.resolve(SERVICES) : Promise.reject(failure);
    },
  }),
}));

vi.mock('../../../components/confirm-store', () => ({
  confirm: (request: { title: string }): Promise<boolean> => {
    calls.asked.push(request.title);
    return Promise.resolve(calls.accept);
  },
}));

import { ServerUnreachableError } from '../../../api/connection/client';
import { computerLive } from '../../../store/computer-live';
import { changeService } from './computer-system';

const DEVICE = '0b9f3c2e-3c38-4a4f-9d55-6a1f6d4b2a10';
const OWN = {
  unit: 'smarteverything.service',
  name: 'Hub',
  operation: 'stop',
  hubOwn: true,
} as const;
const OTHER = { unit: 'backup.service', name: 'Backup', operation: 'stop', hubOwn: false } as const;

beforeEach(() => {
  calls.bodies = [];
  calls.failures = [];
  calls.accept = true;
  calls.asked = [];
});

afterEach(() => {
  computerLive.store(DEVICE).set({ at: null, parts: {} });
});

describe('changeService', () => {
  it('sends without a confirmation flag and shows the answer', async () => {
    expect(await changeService(DEVICE, OTHER, 'Home hub')).toBe('sent');
    expect(calls.bodies).toEqual([
      { action: 'service', unit: 'backup.service', operation: 'stop' },
    ]);
    expect(calls.asked).toEqual([]);
    expect(computerLive.store(DEVICE).get().parts.services).toEqual(SERVICES);
  });

  it('asks once more when the hub says it runs here and repeats with the flag', async () => {
    calls.failures = [new ApiError('conflict', HUB_GUARD_MESSAGE)];
    expect(await changeService(DEVICE, OWN, 'Home hub')).toBe('sent');
    expect(calls.asked).toEqual(['Stop Hub?']);
    expect(calls.bodies.map((body) => body.confirm)).toEqual([undefined, true]);
  });

  it('does nothing more when the person says no', async () => {
    calls.failures = [new ApiError('conflict', HUB_GUARD_MESSAGE)];
    calls.accept = false;
    expect(await changeService(DEVICE, OWN, 'Home hub')).toBe('cancelled');
    expect(calls.bodies).toHaveLength(1);
  });

  it('expects the connection to drop when the hub stops its own service', async () => {
    const dropped = new ServerUnreachableError('https://hub', 'closed');
    calls.failures = [new ApiError('conflict', HUB_GUARD_MESSAGE), dropped];
    expect(await changeService(DEVICE, OWN, 'Home hub')).toBe('sent');
  });

  it('reports a dropped connection for any other service', async () => {
    calls.failures = [new ServerUnreachableError('https://hub', 'closed')];
    await expect(changeService(DEVICE, OTHER, 'Home hub')).rejects.toThrow('could not be reached');
  });
});
