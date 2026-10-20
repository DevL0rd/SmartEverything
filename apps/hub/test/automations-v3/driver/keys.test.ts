import { describe, expect, it } from 'vitest';
import type { Submission } from '../../../src/automations/driver/admission';
import type { ModePolicy } from '../../../src/automations/driver/modes';
import { Harness, effect, occurrence, pause, runIdOf, seq } from './support';

const A = '00000000-0000-4000-8000-00000000a001';
const B = '00000000-0000-4000-8000-00000000a002';
const C = '00000000-0000-4000-8000-00000000a003';
const long = seq(pause('p', 600_000));
const idle = seq(effect('a'));

function submit(h: Harness, automationId: string, policy: ModePolicy): Submission {
  return h.driver.submit(occurrence({ body: long, automationId, policy }));
}

describe('run policy key', () => {
  it('single: automations sharing a key exclude each other, another key does not', () => {
    const h = new Harness();
    expect(submit(h, A, { mode: 'single', key: 'k1' }).kind).toBe('started');
    expect(submit(h, B, { mode: 'single', key: 'k1' }).kind).toBe('refused');
    expect(submit(h, C, { mode: 'single', key: 'k2' }).kind).toBe('started');
    expect(submit(h, A, { mode: 'single', key: 'k1' }).kind).toBe('refused');
  });

  it('single: without a key each automation is its own scope', () => {
    const h = new Harness();
    expect(submit(h, A, { mode: 'single' }).kind).toBe('started');
    expect(submit(h, B, { mode: 'single' }).kind).toBe('started');
    expect(submit(h, A, { mode: 'single' }).kind).toBe('refused');
  });

  it('queue: runs wait only behind their own key and start in order', async () => {
    const h = new Harness();
    const policy1 = { mode: 'queue', key: 'k1' } as const;
    const first = runIdOf(
      h.driver.submit(occurrence({ body: idle, automationId: A, policy: policy1 })),
    );
    const second = submit(h, B, policy1);
    const other = submit(h, C, { mode: 'queue', key: 'k2' });
    expect(second.kind).toBe('queued');
    expect(other.kind).toBe('started');
    await h.settle();
    expect(h.started).toContain(first);
    expect(h.started).toContain(runIdOf(second));
    expect(h.started.indexOf(first)).toBeLessThan(h.started.indexOf(runIdOf(second)));
  });

  it('restart: a new run cancels the running one of the same key only', async () => {
    const h = new Harness();
    const policy1 = { mode: 'restart', key: 'k1' } as const;
    const running = runIdOf(submit(h, A, policy1));
    const bystander = runIdOf(submit(h, C, { mode: 'restart', key: 'k2' }));
    await h.settle();
    const next = submit(h, B, policy1);
    expect(next.kind).toBe('queued');
    await h.settle();
    const ended = h.finished.map((entry) => entry.runId);
    expect(ended).toContain(running);
    expect(ended).not.toContain(bystander);
    expect(h.started).toContain(runIdOf(next));
  });

  it('parallel: the max counts the runs of one key across automations', () => {
    const h = new Harness();
    const policy1 = { mode: 'parallel', max: 2, key: 'k1' } as const;
    expect(submit(h, A, policy1).kind).toBe('started');
    expect(submit(h, B, policy1).kind).toBe('started');
    expect(submit(h, A, policy1).kind).toBe('refused');
    expect(submit(h, C, { mode: 'parallel', max: 2, key: 'k2' }).kind).toBe('started');
  });

  it('stop by key cancels only that key and leaves other automations of the key alone', async () => {
    const h = new Harness();
    const kept = runIdOf(submit(h, A, { mode: 'parallel', key: 'k1' }));
    const other = runIdOf(submit(h, B, { mode: 'parallel', key: 'k1' }));
    await h.settle();
    expect(h.driver.cancelAutomation(A, 'user_stop', 'k2')).toBe(0);
    expect(h.driver.cancelAutomation(A, 'user_stop', 'k1')).toBe(1);
    await h.settle();
    const ended = h.finished.map((entry) => entry.runId);
    expect(ended).toContain(kept);
    expect(ended).not.toContain(other);
    expect(h.driver.cancelAutomation(B, 'user_stop')).toBe(1);
  });

  it('stop by key drops queued runs of that key and keeps the others queued', async () => {
    const h = new Harness();
    const policy1 = { mode: 'queue', key: 'k1' } as const;
    submit(h, A, policy1);
    const mine = submit(h, A, policy1);
    const theirs = submit(h, B, policy1);
    await h.settle();
    expect(h.driver.cancelAutomation(A, 'user_stop', 'k1')).toBe(1);
    await h.settle();
    expect(h.dropped).toContain(`${runIdOf(mine)}:user_stop`);
    expect(h.dropped.join()).not.toContain(runIdOf(theirs));
    expect(h.started).toContain(runIdOf(theirs));
  });
});
