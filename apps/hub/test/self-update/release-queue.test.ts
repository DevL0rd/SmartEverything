import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PipelineComponent, UpdateRevision } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PipelineRefusal,
  ReleaseQueue,
  type Prepared,
  type QueuePorts,
  type StepOutcome,
} from '../../src/self-update/release-queue';
import { RevisionRecord } from '../../src/self-update/revision-record';

const NOTES = 'Faster Hub startup';
const commit = (digit: string): string => digit.repeat(40);

let scratch: string;
let record: RevisionRecord;
let counter: number;
let executed: string[];
let announced: UpdateRevision[];

function id(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

function planned(...components: PipelineComponent[]): Prepared {
  return { base: commit('0'), components, notes: components.length === 0 ? null : NOTES };
}

interface Behaviour {
  prepare?: (revision: UpdateRevision) => Promise<Prepared>;
  execute?: (revision: UpdateRevision, component: PipelineComponent) => Promise<StepOutcome>;
}

function queueOf(behaviour: Behaviour): { queue: ReleaseQueue; crashes: unknown[] } {
  const crashes: unknown[] = [];
  const ports: QueuePorts = {
    record,
    now: (): Date => new Date('2026-11-14T10:00:00.000Z'),
    newId: id,
    prepare: behaviour.prepare ?? ((): Promise<Prepared> => Promise.resolve(planned('hub', 'ui'))),
    execute: async (revision, step): Promise<StepOutcome> => {
      executed.push(`${revision.tip.slice(0, 1)}:${step.component}:${String(step.runId)}`);
      return (
        (await behaviour.execute?.(revision, step.component)) ?? { status: 'done', offered: false }
      );
    },
    changed: (revision): void => {
      announced.push(revision);
    },
    crashed: (cause): void => {
      crashes.push(cause);
    },
  };
  return { queue: new ReleaseQueue(ports), crashes };
}

async function onlyRevision(): Promise<UpdateRevision> {
  const [revision] = await record.list();
  if (revision === undefined) throw new Error('No revision was recorded.');
  return revision;
}

async function statuses(): Promise<string[]> {
  return (await record.list()).map((entry) => `${entry.tip.slice(0, 1)}=${entry.status}`);
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'release-queue-'));
  record = new RevisionRecord(join(scratch, 'revisions.json'));
  counter = 0;
  executed = [];
  announced = [];
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('release queue', () => {
  it('runs the planned components in order, one at a time, and records each step', async () => {
    let running = 0;
    let overlap = 0;
    const { queue } = queueOf({
      prepare: () => Promise.resolve(planned('hub', 'app', 'desktop', 'ui')),
      execute: async () => {
        running += 1;
        overlap = Math.max(overlap, running);
        await Promise.resolve();
        running -= 1;
        return { status: 'done', offered: true };
      },
    });
    await queue.submit({ tip: commit('a'), pushedFrom: commit('9') });
    await queue.settled();
    const [revision] = await record.list();
    expect(overlap).toBe(1);
    expect(executed.map((entry) => entry.split(':')[1])).toEqual(['hub', 'app', 'desktop', 'ui']);
    expect(revision?.status).toBe('done');
    expect(revision?.base).toBe(commit('0'));
    expect(revision?.notes).toBe(NOTES);
    expect(revision?.steps.map((step) => [step.component, step.status, step.offered])).toEqual([
      ['hub', 'done', true],
      ['app', 'done', true],
      ['desktop', 'done', true],
      ['ui', 'done', true],
    ]);
    expect(revision?.finishedAt).not.toBeNull();
  });

  it('announces every change so the app can follow progress', async () => {
    const { queue } = queueOf({ prepare: () => Promise.resolve(planned('ui')) });
    await queue.submit({ tip: commit('a'), pushedFrom: null });
    await queue.settled();
    expect(announced.map((entry) => entry.status)).toEqual([
      'queued',
      'running',
      'running',
      'running',
      'running',
      'done',
    ]);
  });

  it('finishes a revision that needs no release without running anything', async () => {
    const { queue } = queueOf({ prepare: () => Promise.resolve(planned()) });
    await queue.submit({ tip: commit('a'), pushedFrom: null });
    await queue.settled();
    expect(executed).toEqual([]);
    expect(await statuses()).toEqual(['a=done']);
  });

  it('stops at the first failure, skips the rest and keeps the rollback outcome', async () => {
    const { queue } = queueOf({
      prepare: () => Promise.resolve(planned('hub', 'app', 'ui')),
      execute: (_revision, component) =>
        Promise.resolve(
          component === 'hub'
            ? {
                status: 'failed',
                message: 'Health check failed after restart.',
                rollback: 'reverted',
              }
            : { status: 'done', offered: true },
        ),
    });
    await queue.submit({ tip: commit('a'), pushedFrom: null });
    await queue.settled();
    const [revision] = await record.list();
    expect(executed).toHaveLength(1);
    expect(revision?.status).toBe('failed');
    expect(revision?.failure).toEqual({
      component: 'hub',
      message: 'Health check failed after restart.',
      rollback: 'reverted',
    });
    expect(revision?.steps.map((step) => step.status)).toEqual(['failed', 'skipped', 'skipped']);
    expect(revision?.steps[0]?.detail).toBe('Health check failed after restart.');
  });

  it('records a thrown step error as a failure without a rollback', async () => {
    const { queue } = queueOf({
      prepare: () => Promise.resolve(planned('ui')),
      execute: () => Promise.reject(new Error('Metro bundle failed')),
    });
    await queue.submit({ tip: commit('a'), pushedFrom: null });
    await queue.settled();
    const [revision] = await record.list();
    expect(revision?.failure).toEqual({
      component: 'ui',
      message: 'Metro bundle failed',
      rollback: 'none',
    });
  });

  it('records a refused plan with its plain message and runs nothing', async () => {
    const { queue } = queueOf({
      prepare: () =>
        Promise.reject(new PipelineRefusal('refused', 'The update checkout has uncommitted work.')),
    });
    await queue.submit({ tip: commit('a'), pushedFrom: null });
    await queue.settled();
    const [revision] = await record.list();
    expect(executed).toEqual([]);
    expect(revision?.status).toBe('refused');
    expect(revision?.failure?.message).toBe('The update checkout has uncommitted work.');
    expect(revision?.steps).toEqual([]);
  });

  it('records a planning error as a failed revision', async () => {
    const { queue } = queueOf({ prepare: () => Promise.reject(new Error('git fetch failed')) });
    await queue.submit({ tip: commit('a'), pushedFrom: null });
    await queue.settled();
    const [revision] = await record.list();
    expect(revision?.status).toBe('failed');
    expect(revision?.failure).toEqual({
      component: null,
      message: 'git fetch failed',
      rollback: 'none',
    });
  });

  it('coalesces pushes that arrive during a release and releases only the newest afterwards', async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { queue } = queueOf({
      prepare: () => Promise.resolve(planned('ui')),
      execute: async (revision) => {
        if (revision.tip === commit('a')) await held;
        return { status: 'done', offered: true };
      },
    });
    await queue.submit({ tip: commit('a'), pushedFrom: null });
    await nextTick();
    await queue.submit({ tip: commit('b'), pushedFrom: commit('a') });
    await queue.submit({ tip: commit('c'), pushedFrom: commit('b') });
    await queue.submit({ tip: commit('d'), pushedFrom: commit('c') });
    expect(await statuses()).toEqual(['a=running', 'b=queued', 'c=queued', 'd=queued']);
    release?.();
    await queue.settled();
    expect(await statuses()).toEqual(['a=done', 'b=superseded', 'c=superseded', 'd=done']);
    expect(executed.map((entry) => entry.split(':')[0])).toEqual(['a', 'd']);
  });

  it('ignores a repeated push of a tip that is queued, running or released and retries a failed one', async () => {
    let fail = true;
    const { queue } = queueOf({
      prepare: () => Promise.resolve(planned('ui')),
      execute: () =>
        Promise.resolve(
          fail
            ? { status: 'failed', message: 'offline', rollback: 'none' }
            : { status: 'done', offered: true },
        ),
    });
    const first = await queue.submit({ tip: commit('a'), pushedFrom: null });
    await queue.settled();
    fail = false;
    const retry = await queue.submit({ tip: commit('a'), pushedFrom: null });
    await queue.settled();
    const again = await queue.submit({ tip: commit('a'), pushedFrom: null });
    expect(retry.id).not.toBe(first.id);
    expect(again.id).toBe(retry.id);
    expect(await statuses()).toEqual(['a=failed', 'a=done']);
  });

  it('resumes an interrupted release with the same request ID instead of starting it again', async () => {
    const { queue } = queueOf({ prepare: () => Promise.resolve(planned('hub', 'ui')) });
    await queue.submit({ tip: commit('a'), pushedFrom: null });
    await queue.settled();
    const done = await onlyRevision();
    const interrupted: UpdateRevision = {
      ...done,
      status: 'running',
      finishedAt: null,
      steps: [
        { component: 'hub', status: 'running', runId: id(), offered: false, detail: null },
        { component: 'ui', status: 'pending', runId: null, offered: false, detail: null },
      ],
    };
    await record.save(interrupted);
    executed = [];
    const resumed = queueOf({ prepare: () => Promise.reject(new Error('must not plan again')) });
    resumed.queue.resume();
    await resumed.queue.settled();
    const [after] = await record.list();
    expect(after?.status).toBe('done');
    expect(executed[0]).toBe(`a:hub:${String(interrupted.steps[0]?.runId)}`);
    expect(executed).toHaveLength(2);
    expect(after?.steps.map((step) => step.status)).toEqual(['done', 'done']);
  });

  it('does not run a step that already finished before the restart', async () => {
    const { queue } = queueOf({ prepare: () => Promise.resolve(planned('hub', 'ui')) });
    await queue.submit({ tip: commit('a'), pushedFrom: null });
    await queue.settled();
    const done = await onlyRevision();
    await record.save({
      ...done,
      status: 'running',
      finishedAt: null,
      steps: [
        { component: 'hub', status: 'done', runId: id(), offered: false, detail: null },
        { component: 'ui', status: 'running', runId: id(), offered: false, detail: null },
      ],
    });
    executed = [];
    const resumed = queueOf({});
    resumed.queue.resume();
    await resumed.queue.settled();
    expect(executed.map((entry) => entry.split(':')[1])).toEqual(['ui']);
  });

  it('reports a storage failure through the crash port instead of rejecting unhandled', async () => {
    let reads = 0;
    const crashes: unknown[] = [];
    const queue = new ReleaseQueue({
      record: {
        list: (): Promise<readonly UpdateRevision[]> => {
          reads += 1;
          return reads === 1 ? Promise.resolve([]) : Promise.reject(new Error('disk full'));
        },
        save: (): Promise<void> => Promise.resolve(),
      },
      now: (): Date => new Date('2026-11-14T10:00:00.000Z'),
      newId: id,
      prepare: (): Promise<Prepared> => Promise.resolve(planned('ui')),
      execute: (): Promise<StepOutcome> => Promise.resolve({ status: 'done', offered: false }),
      changed: (): void => undefined,
      crashed: (cause): void => {
        crashes.push(cause);
      },
    });
    await queue.submit({ tip: commit('a'), pushedFrom: null });
    await queue.settled();
    expect(crashes).toHaveLength(1);
    expect(String(crashes[0])).toContain('disk full');
  });
});

function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
