import {
  revisionFinished,
  type PipelineComponent,
  type UpdateRevision,
  type UpdateRevisionFailure,
  type UpdateRevisionStep,
} from '@smarteverything/domain';
import type { RevisionRecord } from './revision-record';

export class PipelineRefusal extends Error {
  override readonly name = 'PipelineRefusal';

  constructor(
    readonly kind: 'refused' | 'superseded',
    message: string,
  ) {
    super(message);
  }
}

export interface Prepared {
  readonly base: string | null;
  readonly components: readonly PipelineComponent[];
  readonly notes: string | null;
}

export type StepOutcome =
  | { readonly status: 'done'; readonly offered: boolean }
  | {
      readonly status: 'failed';
      readonly message: string;
      readonly rollback: UpdateRevisionFailure['rollback'];
    };

export interface QueuePorts {
  readonly record: Pick<RevisionRecord, 'list' | 'save'>;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly prepare: (revision: UpdateRevision) => Promise<Prepared>;
  readonly execute: (revision: UpdateRevision, step: UpdateRevisionStep) => Promise<StepOutcome>;
  readonly changed: (revision: UpdateRevision) => void;
  readonly crashed: (cause: unknown) => void;
}

export interface PushedRevision {
  readonly tip: string;
  readonly pushedFrom: string | null;
}

const LIVE_STATUSES: ReadonlySet<string> = new Set(['queued', 'running', 'done']);

const MESSAGE_LIMIT = 2000;

function bounded(message: string): string {
  return message.length === 0
    ? 'The update stopped without a message.'
    : message.slice(0, MESSAGE_LIMIT);
}

function messageOf(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause);
  return text.length === 0 ? 'The update stopped without a message.' : text;
}

export class ReleaseQueue {
  private active: Promise<void> | undefined;
  private pending = false;

  constructor(private readonly ports: QueuePorts) {}

  async submit(push: PushedRevision): Promise<UpdateRevision> {
    const known = (await this.ports.record.list()).find(
      (entry) => entry.tip === push.tip && LIVE_STATUSES.has(entry.status),
    );
    if (known !== undefined) return known;
    const at = this.ports.now().toISOString();
    const revision: UpdateRevision = {
      id: this.ports.newId(),
      tip: push.tip,
      pushedFrom: push.pushedFrom,
      base: null,
      status: 'queued',
      steps: [],
      notes: null,
      failure: null,
      receivedAt: at,
      updatedAt: at,
      finishedAt: null,
    };
    await this.persist(revision);
    this.kick();
    return revision;
  }

  resume(): void {
    this.kick();
  }

  async settled(): Promise<void> {
    while (this.active !== undefined) await this.active;
  }

  private kick(): void {
    if (this.active !== undefined) {
      this.pending = true;
      return;
    }
    this.active = this.drain().catch((cause: unknown) => {
      this.active = undefined;
      this.ports.crashed(cause);
    });
  }

  private async drain(): Promise<void> {
    for (;;) {
      const next = await this.pickNext();
      if (next !== undefined) {
        await this.run(next);
        continue;
      }
      if (!this.takePending()) {
        this.active = undefined;
        return;
      }
    }
  }

  private takePending(): boolean {
    const was = this.pending;
    this.pending = false;
    return was;
  }

  private async persist(revision: UpdateRevision): Promise<UpdateRevision> {
    await this.ports.record.save(revision);
    this.ports.changed(revision);
    return revision;
  }

  private change(
    revision: UpdateRevision,
    change: Partial<UpdateRevision>,
  ): Promise<UpdateRevision> {
    const at = this.ports.now().toISOString();
    const status = change.status ?? revision.status;
    return this.persist({
      ...revision,
      ...change,
      updatedAt: at,
      finishedAt: revisionFinished({ status }) ? at : null,
    });
  }

  private async pickNext(): Promise<UpdateRevision | undefined> {
    const all = await this.ports.record.list();
    const running = all.find((entry) => entry.status === 'running');
    if (running !== undefined) return running;
    const queued = all.filter((entry) => entry.status === 'queued');
    const newest = queued.at(-1);
    for (const older of queued.slice(0, -1)) await this.change(older, { status: 'superseded' });
    return newest;
  }

  private async run(revision: UpdateRevision): Promise<void> {
    let current = revision;
    try {
      if (current.steps.length === 0) current = await this.plan(current);
      if (current.status === 'running') await this.walk(current);
    } catch (cause) {
      await this.fail(current, null, messageOf(cause), 'none');
    }
  }

  private async plan(revision: UpdateRevision): Promise<UpdateRevision> {
    const running = await this.change(revision, { status: 'running' });
    try {
      const prepared = await this.ports.prepare(running);
      const steps = prepared.components.map((component): UpdateRevisionStep => ({
        component,
        status: 'pending',
        runId: null,
        offered: false,
        detail: null,
      }));
      return await this.change(running, {
        base: prepared.base,
        notes: prepared.notes,
        steps,
        status: steps.length === 0 ? 'done' : 'running',
      });
    } catch (cause) {
      if (!(cause instanceof PipelineRefusal)) throw cause;
      const failure = { component: null, message: cause.message, rollback: 'none' } as const;
      return this.change(running, { status: cause.kind, failure });
    }
  }

  private async walk(revision: UpdateRevision): Promise<void> {
    let current = revision;
    for (const planned of revision.steps) {
      const step = current.steps.find((entry) => entry.component === planned.component);
      if (step === undefined || step.status === 'done') continue;
      current = await this.stepped(current, step);
      if (current.status !== 'running') return;
    }
    await this.change(current, { status: 'done' });
  }

  private async stepped(
    revision: UpdateRevision,
    step: UpdateRevisionStep,
  ): Promise<UpdateRevision> {
    const started = {
      ...step,
      status: 'running' as const,
      runId: step.runId ?? this.ports.newId(),
    };
    const running = await this.change(revision, { steps: replaced(revision.steps, started) });
    const outcome = await this.outcomeOf(running, started);
    if (outcome.status === 'done') {
      const done = { ...started, status: 'done' as const, offered: outcome.offered, detail: null };
      return this.change(running, { steps: replaced(running.steps, done) });
    }
    return this.fail(running, started, outcome.message, outcome.rollback);
  }

  private async outcomeOf(
    revision: UpdateRevision,
    step: UpdateRevisionStep,
  ): Promise<StepOutcome> {
    try {
      return await this.ports.execute(revision, step);
    } catch (cause) {
      return { status: 'failed', message: messageOf(cause), rollback: 'none' };
    }
  }

  private fail(
    revision: UpdateRevision,
    step: UpdateRevisionStep | null,
    message: string,
    rollback: UpdateRevisionFailure['rollback'],
  ): Promise<UpdateRevision> {
    const steps = revision.steps.map((entry): UpdateRevisionStep => {
      if (entry.component === step?.component)
        return { ...entry, status: 'failed', detail: bounded(message) };
      return entry.status === 'pending' ? { ...entry, status: 'skipped' } : entry;
    });
    const failure = {
      component: step?.component ?? null,
      message: bounded(message),
      rollback,
    };
    return this.change(revision, { status: 'failed', steps, failure });
  }
}

function replaced(
  steps: readonly UpdateRevisionStep[],
  next: UpdateRevisionStep,
): readonly UpdateRevisionStep[] {
  return steps.map((entry) => (entry.component === next.component ? next : entry));
}
