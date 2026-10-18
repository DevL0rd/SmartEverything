import { describe, expect, it, vi } from 'vitest';
import { createActionRunner, type ActionOutcome, type ActionRunner } from './action-runner';

const OUTCOME: ActionOutcome = { message: 'ok', tone: 'positive' };

interface Setup {
  readonly busy: (string | null)[];
  readonly deps: {
    readonly setBusy: (value: string | null) => void;
    readonly refresh: ReturnType<typeof vi.fn>;
    readonly succeeded: ReturnType<typeof vi.fn>;
    readonly failed: ReturnType<typeof vi.fn>;
  };
  readonly run: ActionRunner<string>;
}

function setup(): Setup {
  const busy: (string | null)[] = [];
  const deps = {
    setBusy: (value: string | null): void => {
      busy.push(value);
    },
    refresh: vi.fn(),
    succeeded: vi.fn(),
    failed: vi.fn(),
  };
  return { busy, deps, run: createActionRunner<string>(deps) };
}

describe('action runner', () => {
  it('clears busy and refreshes after success', async () => {
    const { busy, deps, run } = setup();
    await run('connect', () => Promise.resolve(OUTCOME));
    expect(busy).toEqual(['connect', null]);
    expect(deps.succeeded).toHaveBeenCalledWith(OUTCOME);
    expect(deps.refresh).toHaveBeenCalledTimes(1);
  });

  it('clears busy, reports and refreshes after failure', async () => {
    const { busy, deps, run } = setup();
    const error = new Error('denied');
    await run('connect', () => Promise.reject(error));
    expect(busy).toEqual(['connect', null]);
    expect(deps.failed).toHaveBeenCalledWith(error);
    expect(deps.succeeded).not.toHaveBeenCalled();
    expect(deps.refresh).toHaveBeenCalledTimes(1);
  });

  it('clears busy when the work throws synchronously', async () => {
    const { busy, deps, run } = setup();
    await run('connect', () => {
      throw new Error('boom');
    });
    expect(busy).toEqual(['connect', null]);
    expect(deps.failed).toHaveBeenCalledTimes(1);
  });

  it('reports the early return outcome and still clears busy', async () => {
    const { busy, deps, run } = setup();
    const early: ActionOutcome = { message: 'No access', tone: 'default' };
    await run('connect', () => Promise.resolve(early));
    expect(deps.succeeded).toHaveBeenCalledWith(early);
    expect(busy).toEqual(['connect', null]);
  });

  it('ignores a second run while one is in flight and allows one after', async () => {
    const { deps, run } = setup();
    let release: (value: ActionOutcome) => void = () => undefined;
    const first = run(
      'connect',
      () => new Promise<ActionOutcome>((resolve) => (release = resolve)),
    );
    const second = vi.fn(() => Promise.resolve(OUTCOME));
    await run('sync', second);
    expect(second).not.toHaveBeenCalled();
    release(OUTCOME);
    await first;
    await run('sync', second);
    expect(second).toHaveBeenCalledTimes(1);
    expect(deps.refresh).toHaveBeenCalledTimes(2);
  });
});
