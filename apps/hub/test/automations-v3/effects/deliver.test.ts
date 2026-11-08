import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliver } from '../../../src/automations/effects/deliver';
import { AutomationRunCancelledError } from '../../../src/automations/effects/run-abort';
import { lateActivation } from '../../../src/automations/engine-v3-children';
import { testRun } from './support';

function gate(): {
  readonly promise: Promise<string>;
  readonly open: (value: string) => void;
  readonly fail: (cause: Error) => void;
} {
  let open: (value: string) => void = () => undefined;
  let fail: (cause: Error) => void = () => undefined;
  const promise = new Promise<string>((resolve, reject) => {
    open = resolve;
    fail = reject;
  });
  return { promise, open, fail };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('deliver', () => {
  it('send returns at once while the work is still out and logs a late failure', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const held = gate();
    const run = testRun();
    let started = 0;
    const result = await deliver({
      kind: 'computer.power',
      mode: 'fire_and_forget',
      run,
      work: () => {
        started += 1;
        return held.promise;
      },
    });
    expect(result).toBeUndefined();
    expect(started).toBe(1);
    held.fail(new Error('the computer went away'));
    await vi.waitFor(() => {
      expect(errors).toHaveBeenCalled();
    });
    expect(String(errors.mock.calls[0]?.[0])).toContain('automation.late_failure');
    expect(run.lateCauses).toEqual([new Error('the computer went away')]);
  });

  it('send writes nothing late when the work succeeds', async () => {
    const run = testRun();
    await deliver({
      kind: 'computer.power',
      mode: 'fire_and_forget',
      run,
      work: () => Promise.resolve('done'),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(run.lateCauses).toEqual([]);
  });

  it('turns a late failure into a failed late trace row of the node', () => {
    const request = {
      kind: 'computer.power',
      node: { id: '00000000-0000-4000-8000-000000000001', key: 'power' },
      path: 'body/ops/0',
      activation: 'f0:0',
      key: 'k',
      params: {},
      retry: 'external',
      budget: 'none',
    } as const;
    const now = new Date('2026-10-25T10:00:00.000Z');
    const row = lateActivation(request, new Error('the computer went away'), now);
    expect(row).toMatchObject({
      path: 'f0:0',
      nodeId: request.node.id,
      status: 'failed',
      late: true,
      finishedAt: now.toISOString(),
      error: { class: 'Failed', message: 'Error: the computer went away', path: 'body/ops/0' },
    });
    expect(lateActivation(request, new AutomationRunCancelledError('run'), now)).toBeUndefined();
  });

  it('wait finishes on the result and passes a failure on to the node', async () => {
    const held = gate();
    const run = testRun();
    let finished = false;
    const waiting = deliver({
      kind: 'phone.action',
      mode: 'wait_for_result',
      run,
      work: () => held.promise,
    }).then((value) => {
      finished = true;
      return value;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    held.open('done');
    expect(await waiting).toBe('done');

    const failing = deliver({
      kind: 'phone.action',
      mode: 'wait_for_result',
      run,
      work: () => Promise.reject(new Error('refused')),
    });
    await expect(failing).rejects.toThrow('refused');
  });

  it('wait stops with the run when it is cancelled', async () => {
    const held = gate();
    const run = testRun();
    const waiting = deliver({
      kind: 'device.ir_send',
      mode: 'wait_for_result',
      run,
      work: () => held.promise,
    });
    run.controller.abort();
    await expect(waiting).rejects.toBeInstanceOf(AutomationRunCancelledError);
  });
});
