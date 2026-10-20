import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Logger, type LogRecord } from '@smarteverything/logging';

vi.mock('../components/toast-store', () => ({ notify: vi.fn() }));

const { useMutationState } = await import('./mutation');
const { notify } = await import('../components/toast-store');

type Mutation = ReturnType<typeof useMutationState>;

function rendered(): Mutation {
  const captured: Mutation[] = [];
  function Probe(): ReactNode {
    captured.push(useMutationState());
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  const [mutation] = captured;
  if (mutation === undefined) {
    throw new Error('the hook did not render');
  }
  return mutation;
}

describe('useMutationState', () => {
  it('runs the work once when it is triggered twice in the same frame', () => {
    const { run } = rendered();
    const work = vi.fn(() => new Promise<void>(() => undefined));
    run(work, { failure: 'Could not save' });
    run(work, { failure: 'Could not save' });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('accepts a new run once the previous one has settled', async () => {
    const { run } = rendered();
    const done = vi.fn();
    run(() => Promise.resolve(1), { failure: 'Could not save', onDone: done });
    await vi.waitFor(() => {
      expect(done).toHaveBeenCalledWith(1);
    });
    await Promise.resolve();
    run(() => Promise.resolve(2), { failure: 'Could not save', onDone: done });
    await vi.waitFor(() => {
      expect(done).toHaveBeenCalledWith(2);
    });
  });

  it('reports a failure through a toast and then accepts another run', async () => {
    const { run } = rendered();
    run(() => Promise.reject(new Error('nope')), { failure: 'Could not save' });
    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'Could not save' }));
    });
    const work = vi.fn(() => Promise.resolve());
    await Promise.resolve();
    run(work, { failure: 'Could not save' });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('logs a success under its own label and never under the failure text', async () => {
    const records: LogRecord[] = [];
    Logger.configure({ level: 'debug', sink: (record) => records.push(record) });
    const { run } = rendered();
    const done = vi.fn();
    run(() => Promise.resolve(1), {
      failure: 'The treadmill could not be added',
      label: 'Add treadmill',
      onDone: done,
    });
    await vi.waitFor(() => {
      expect(done).toHaveBeenCalled();
    });
    Logger.reset();
    const succeeded = records.find((record) => record.event === 'mutation.succeeded');
    expect(succeeded?.payload).toMatchObject({ label: 'Add treadmill' });
    expect(JSON.stringify(succeeded?.payload)).not.toContain('could not be added');
  });
});
