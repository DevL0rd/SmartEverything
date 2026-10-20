import { describe, expect, it } from 'vitest';
import { ModeBook } from '../../../src/automations/driver/modes';
import type { ModePolicy } from '../../../src/automations/driver/modes';

const ticket = (runId: string): { runId: string; payload: string } => ({ runId, payload: runId });

function book(): ModeBook<string> {
  return new ModeBook<string>();
}

describe('ModeBook', () => {
  it('single refuses while any run is active, parked runs included', () => {
    const modes = book();
    const policy: ModePolicy = { mode: 'single' };
    expect(modes.request('a', ticket('r1'), policy, 0)).toEqual({ kind: 'start' });
    expect(modes.request('a', ticket('r2'), policy, 1)).toEqual({
      kind: 'refused',
      reason: 'single_busy',
    });
    modes.release('a', 'r1', 2);
    expect(modes.request('a', ticket('r3'), policy, 3)).toEqual({ kind: 'start' });
  });

  it('keeps automations apart', () => {
    const modes = book();
    expect(modes.request('a', ticket('r1'), { mode: 'single' }, 0).kind).toBe('start');
    expect(modes.request('b', ticket('r2'), { mode: 'single' }, 0).kind).toBe('start');
  });

  it('parallel with an absent max is unlimited', () => {
    const modes = book();
    for (let index = 0; index < 500; index += 1) {
      expect(modes.request('a', ticket(`r${String(index)}`), { mode: 'parallel' }, 0).kind).toBe(
        'start',
      );
    }
    expect(modes.active('a')).toHaveLength(500);
  });

  it('parallel refuses at max', () => {
    const modes = book();
    const policy: ModePolicy = { mode: 'parallel', max: 2 };
    modes.request('a', ticket('r1'), policy, 0);
    modes.request('a', ticket('r2'), policy, 0);
    expect(modes.request('a', ticket('r3'), policy, 0)).toEqual({
      kind: 'refused',
      reason: 'parallel_full',
    });
  });

  it('queue starts later runs in order as earlier ones release', () => {
    const modes = book();
    const policy: ModePolicy = { mode: 'queue' };
    expect(modes.request('a', ticket('r1'), policy, 0).kind).toBe('start');
    expect(modes.request('a', ticket('r2'), policy, 1).kind).toBe('queued');
    expect(modes.request('a', ticket('r3'), policy, 2).kind).toBe('queued');
    expect(modes.release('a', 'r1', 3).start.map((held) => held.runId)).toEqual(['r2']);
    expect(modes.release('a', 'r2', 4).start.map((held) => held.runId)).toEqual(['r3']);
  });

  it('queue with an absent max is unlimited and with a max refuses when full', () => {
    const open = book();
    open.request('a', ticket('r0'), { mode: 'queue' }, 0);
    for (let index = 1; index <= 200; index += 1) {
      expect(open.request('a', ticket(`r${String(index)}`), { mode: 'queue' }, 0).kind).toBe(
        'queued',
      );
    }
    const capped = book();
    const policy: ModePolicy = { mode: 'queue', max: 2 };
    capped.request('a', ticket('r0'), policy, 0);
    capped.request('a', ticket('r1'), policy, 0);
    capped.request('a', ticket('r2'), policy, 0);
    expect(capped.request('a', ticket('r3'), policy, 0)).toEqual({
      kind: 'refused',
      reason: 'queue_full',
    });
  });

  it('queue drops a run that waited longer than maxWait as stale when the next one is pumped', () => {
    const modes = book();
    const policy: ModePolicy = { mode: 'queue', maxWait: 1000 };
    modes.request('a', ticket('r1'), policy, 0);
    modes.request('a', ticket('r2'), policy, 100);
    modes.request('a', ticket('r3'), policy, 5000);
    const released = modes.release('a', 'r1', 6000);
    expect(released.stale.map((held) => held.runId)).toEqual(['r2']);
    expect(released.start.map((held) => held.runId)).toEqual(['r3']);
  });

  it('restart cancels the active runs and starts the new one only after they release', () => {
    const modes = book();
    const policy: ModePolicy = { mode: 'restart' };
    modes.request('a', ticket('r1'), policy, 0);
    const verdict = modes.request('a', ticket('r2'), policy, 1);
    expect(verdict).toEqual({ kind: 'queued', cancel: ['r1'], superseded: [] });
    expect(modes.active('a')).toEqual(['r1']);
    expect(modes.release('a', 'r1', 2).start.map((held) => held.runId)).toEqual(['r2']);
    expect(modes.active('a')).toEqual(['r2']);
  });

  it('restart keeps only the newest waiting run and reports the superseded one', () => {
    const modes = book();
    const policy: ModePolicy = { mode: 'restart' };
    modes.request('a', ticket('r1'), policy, 0);
    modes.request('a', ticket('r2'), policy, 1);
    const verdict = modes.request('a', ticket('r3'), policy, 2);
    expect(verdict.kind === 'queued' && verdict.superseded.map((held) => held.runId)).toEqual([
      'r2',
    ]);
    expect(modes.release('a', 'r1', 3).start.map((held) => held.runId)).toEqual(['r3']);
  });

  it('adopt counts a resumed parked run so single still refuses', () => {
    const modes = book();
    modes.adopt('a', 'r1');
    expect(modes.request('a', ticket('r2'), { mode: 'single' }, 0).kind).toBe('refused');
  });

  it('clearQueue empties the waiting runs and withdraw removes one', () => {
    const modes = book();
    const policy: ModePolicy = { mode: 'queue' };
    modes.request('a', ticket('r1'), policy, 0);
    modes.request('a', ticket('r2'), policy, 0);
    modes.request('a', ticket('r3'), policy, 0);
    modes.withdraw('a', 'r2');
    expect(modes.waiting('a')).toBe(1);
    expect(modes.clearQueue('a', () => true).map((held) => held.runId)).toEqual(['r3']);
    expect(modes.waiting('a')).toBe(0);
  });
});
