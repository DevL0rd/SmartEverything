import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, HUB_GUARD_MESSAGE } from '@smarteverything/domain';

interface Calls {
  bodies: { pid: number; signal: string; confirm?: boolean }[];
  failures: Error[];
  accept: boolean;
  asked: string[];
}

const calls = vi.hoisted((): Calls => ({ bodies: [], failures: [], accept: true, asked: [] }));

vi.mock('../../../api/transport', () => ({
  api: (): { call: (endpoint: unknown, options: { body: never }) => Promise<unknown> } => ({
    call: (_endpoint, options): Promise<unknown> => {
      calls.bodies.push(options.body);
      const failure = calls.failures.shift();
      return failure === undefined ? Promise.resolve({ done: true }) : Promise.reject(failure);
    },
  }),
}));

vi.mock('../../../components/confirm-store', () => ({
  confirm: (request: { title: string }): Promise<boolean> => {
    calls.asked.push(request.title);
    return Promise.resolve(calls.accept);
  },
}));

import { signalProcess } from './computer-processes';

const REQUEST = { pid: 7, name: 'node', signal: 'end' } as const;

beforeEach(() => {
  calls.bodies = [];
  calls.failures = [];
  calls.accept = true;
  calls.asked = [];
});

describe('signalProcess', () => {
  it('sends the signal without any confirmation flag', async () => {
    expect(await signalProcess('pc', REQUEST)).toBe('sent');
    expect(calls.bodies).toEqual([{ pid: 7, signal: 'end' }]);
    expect(calls.asked).toEqual([]);
  });

  it('asks once more when the hub says it runs here and repeats with the flag', async () => {
    calls.failures = [new ApiError('conflict', HUB_GUARD_MESSAGE)];
    expect(await signalProcess('hub', REQUEST)).toBe('sent');
    expect(calls.asked).toEqual(['node runs the hub']);
    expect(calls.bodies).toEqual([
      { pid: 7, signal: 'end' },
      { pid: 7, signal: 'end', confirm: true },
    ]);
  });

  it('does nothing more when the person says no', async () => {
    calls.failures = [new ApiError('conflict', HUB_GUARD_MESSAGE)];
    calls.accept = false;
    expect(await signalProcess('hub', REQUEST)).toBe('cancelled');
    expect(calls.bodies).toHaveLength(1);
  });

  it('passes every other refusal on', async () => {
    calls.failures = [new ApiError('forbidden', 'Belongs to root')];
    await expect(signalProcess('pc', REQUEST)).rejects.toThrow('Belongs to root');
    expect(calls.asked).toEqual([]);
  });
});
