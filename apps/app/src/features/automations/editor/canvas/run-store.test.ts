import { describe, expect, it, vi } from 'vitest';
import { RunStore } from './run-store';

describe('run store', () => {
  it('notifies only the nodes whose entry changed', () => {
    const store = new RunStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe('a', a);
    store.subscribe('b', b);
    store.update({ a: { state: 'running' }, b: { state: 'done', text: '1' } });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    store.update({ a: { state: 'done' }, b: { state: 'done', text: '1' } });
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
    expect(store.read('a')?.state).toBe('done');
    expect(store.read('zz')).toBeNull();
  });

  it('stops notifying after unsubscribe', () => {
    const store = new RunStore();
    const a = vi.fn();
    store.subscribe('a', a)();
    store.update({ a: { state: 'running' } });
    expect(a).not.toHaveBeenCalled();
  });
});
