import { describe, expect, it } from 'vitest';
import type { NodeKind } from '@smarteverything/domain';
import { NODE_REGISTRY, modesOf } from '@smarteverything/domain';
import { hasRunMode, runModeOwnsTimeout, runModeView, withRunMode } from './run-mode-model';

function kindOf(id: string): NodeKind {
  const kind = NODE_REGISTRY.get(id);
  if (kind === undefined) throw new Error(`no kind ${id}`);
  return kind;
}

function alwaysWaiting(): NodeKind {
  const kind = NODE_REGISTRY.shipped().find(
    (entry) => entry.class === 'effect' && modesOf(entry).allowed.length === 1,
  );
  if (kind === undefined) throw new Error('no action kind with one run mode');
  return kind;
}

describe('run mode choice', () => {
  it('offers both plain choices on a device command and starts on Continue right away', () => {
    const view = runModeView(kindOf('device.set'), undefined);
    expect(view.choices.map((choice) => choice.title)).toEqual([
      'Continue right away',
      'Wait for the result',
    ]);
    expect(view.mode).toBe('fire_and_forget');
    expect(view.fixed).toBeUndefined();
    expect(view.showsTimeout).toBe(false);
  });

  it('shows the wait time limit only in Wait for the result', () => {
    const view = runModeView(kindOf('device.set'), { mode: 'wait_for_result', timeout: 5000 });
    expect(view.showsTimeout).toBe(true);
    expect(view.timeout).toBe(5000);
  });

  it('shows a kind with one allowed mode as fixed text with the reason', () => {
    const view = runModeView(alwaysWaiting(), { mode: 'fire_and_forget' });
    expect(view.fixed?.title).toBe('Wait for the result');
    expect(view.reason).toContain('always waits');
    expect(view.showsTimeout).toBe(true);
  });

  it('is offered on action steps only', () => {
    expect(hasRunMode(kindOf('device.set'))).toBe(true);
    expect(hasRunMode(kindOf('math.add'))).toBe(false);
    expect(hasRunMode(kindOf('flow.try'))).toBe(false);
  });
});

describe('stored mode', () => {
  const kind = kindOf('device.set');

  it('stores the mode only when it differs from the kind default and keeps the other policy', () => {
    expect(withRunMode(kind, { retry: undefined, timeout: 1000 }, 'wait_for_result')).toEqual({
      timeout: 1000,
      mode: 'wait_for_result',
    });
    expect(withRunMode(kind, { mode: 'wait_for_result' }, 'fire_and_forget')).toBeNull();
    expect(
      withRunMode(kind, { mode: 'wait_for_result', onError: 'continue' }, 'fire_and_forget'),
    ).toEqual({ onError: 'continue' });
  });

  it('never stores a mode the kind does not allow', () => {
    expect(withRunMode(alwaysWaiting(), undefined, 'fire_and_forget')).toBeNull();
  });

  it('owns the time limit only while the step waits', () => {
    expect(runModeOwnsTimeout(kind, { timeout: 1000 })).toBe(false);
    expect(runModeOwnsTimeout(kind, { mode: 'wait_for_result' })).toBe(true);
    expect(runModeOwnsTimeout(alwaysWaiting(), undefined)).toBe(true);
    expect(runModeOwnsTimeout(kindOf('flow.wait'), { timeout: 1000 })).toBe(false);
  });
});
