import type {
  AutomationAuthor,
  AutomationProgramProblem,
  AutomationProgramReply,
  AutomationV3,
  Layout,
} from '@smarteverything/domain';
import { ApiError } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { ValueStore } from '../../../../design/external-store';
import type { DraftSaveBody, RevisionRow } from '../../data/api';
import type { DocumentStore } from '../../model/editor/document-store';
import { rebaseDraft, type DroppedOp } from '../../model/editor/rebase';

const log = new Logger('app.automations');

export type SyncStatus = 'saved' | 'saving' | 'unsaved' | 'offline' | 'conflict' | 'failed';

export interface DraftBase {
  readonly program: AutomationV3;
  readonly layout: Layout;
  readonly revision: number;
}

export interface TheirRevision {
  readonly revision: number;
  readonly program: AutomationV3;
  readonly layout: Layout;
  readonly author: AutomationAuthor | null;
  readonly savedAt: string;
}

export interface RebaseNotice {
  readonly kept: number;
  readonly dropped: readonly DroppedOp[];
}

export interface SyncState {
  readonly status: SyncStatus;
  readonly revision: number;
  readonly problems: readonly AutomationProgramProblem[];
  readonly conflict: TheirRevision | null;
  readonly notice: RebaseNotice | null;
  readonly failure: string | null;
}

export interface SyncPorts {
  readonly save: (body: DraftSaveBody) => Promise<AutomationProgramReply>;
  readonly discard: (expectedRevision: number) => Promise<AutomationProgramReply>;
  readonly publish: (expectedRevision: number) => Promise<AutomationProgramReply>;
  readonly revision: (revision: number) => Promise<RevisionRow>;
  readonly latest: () => Promise<RevisionRow>;
}

export type PublishPlan =
  | {
      readonly kind: 'ready';
      readonly current: number;
      readonly next: number;
      readonly notes: readonly AutomationProgramProblem[];
    }
  | { readonly kind: 'blocked'; readonly errors: readonly AutomationProgramProblem[] }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'unsaved'; readonly reason: string };

export type PublishOutcome =
  | { readonly kind: 'published'; readonly revision: number; readonly previous: number }
  | { readonly kind: 'refused'; readonly reply: AutomationProgramReply }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'unavailable'; readonly reason: string };

export function theirRevisionOf(row: RevisionRow): TheirRevision {
  return {
    revision: row.revision,
    program: row.definition,
    layout: row.layout,
    author: row.author,
    savedAt: row.saved_at,
  };
}

function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'conflict';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The draft could not be saved.';
}

export class DraftSyncModel {
  readonly state: ValueStore<SyncState>;

  private base: DraftBase;
  private lastSaved: { readonly program: AutomationV3; readonly layout: Layout };
  private online: boolean;
  private depth = 0;
  private forced = false;
  private running: Promise<void> | null = null;
  private seen: number;
  private problems: readonly AutomationProgramProblem[] = [];
  private conflict: TheirRevision | null = null;
  private notice: RebaseNotice | null = null;
  private failure: string | null = null;

  constructor(
    private readonly store: DocumentStore,
    private readonly ports: SyncPorts,
    base: DraftBase,
    online = true,
  ) {
    this.base = base;
    this.lastSaved = { program: base.program, layout: base.layout };
    this.online = online;
    this.seen = store.state.get().version;
    this.state = new ValueStore<SyncState>(this.build());
  }

  readonly attach = (): (() => void) => {
    return this.store.state.subscribe(this.onStore);
  };

  readonly beginGesture = (): void => {
    this.depth += 1;
  };

  readonly endGesture = (): void => {
    if (this.depth === 0) return;
    this.depth -= 1;
    if (this.depth === 0) this.start();
  };

  readonly setOnline = (online: boolean): void => {
    if (online === this.online) return;
    this.online = online;
    if (online) this.failure = null;
    this.start();
  };

  readonly retry = (): void => {
    this.failure = null;
    this.start();
  };

  readonly settle = async (): Promise<void> => {
    this.start();
    while (this.running !== null) await this.running;
  };

  readonly noteRemote = async (revision: number): Promise<void> => {
    if (revision <= this.base.revision || this.conflict !== null) return;
    const theirs = theirRevisionOf(await this.ports.latest());
    if (this.store.state.get().dirty || this.forced) {
      this.conflict = theirs;
      this.refresh();
      return;
    }
    this.adopt(theirs);
  };

  readonly keepMine = (): void => {
    const theirs = this.conflict;
    if (theirs === null) return;
    const mine = this.store.state.get();
    const result = rebaseDraft({
      base: this.base.program,
      draft: mine.program,
      draftLayout: mine.layout,
      theirs: theirs.program,
      theirsLayout: theirs.layout,
    });
    this.store.replace(result.program, result.layout);
    this.base = { program: theirs.program, layout: theirs.layout, revision: theirs.revision };
    this.conflict = null;
    this.notice = { kept: result.applied.length, dropped: result.dropped };
    this.forced = true;
    log.info('draft.rebased', {
      applied: result.applied.length,
      settled: result.settled.length,
      dropped: result.dropped.length,
    });
    this.start();
  };

  readonly useTheirs = async (): Promise<void> => {
    const theirs = this.conflict;
    if (theirs === null) return;
    this.adopt(theirs);
    try {
      await this.ports.discard(theirs.revision);
    } catch (error) {
      this.fail(error);
    }
  };

  readonly dismissNotice = (): void => {
    this.notice = null;
    this.refresh();
  };

  readonly restoreAsDraft = async (revision: number): Promise<void> => {
    const row = await this.ports.revision(revision);
    this.store.replace(row.definition, row.layout);
    this.forced = true;
    await this.settle();
  };

  readonly prepare = async (): Promise<PublishPlan> => {
    await this.settle();
    if (this.conflict !== null) return { kind: 'conflict' };
    if (this.failure !== null) return { kind: 'unsaved', reason: this.failure };
    if (!this.online) return { kind: 'unsaved', reason: 'The Home Hub can’t be reached.' };
    const errors = this.problems.filter((problem) => problem.severity === 'error');
    if (errors.length > 0) return { kind: 'blocked', errors };
    const notes = this.problems.filter((problem) => problem.severity !== 'error');
    return { kind: 'ready', current: this.base.revision, next: this.base.revision + 1, notes };
  };

  readonly publish = async (): Promise<PublishOutcome> => {
    const previous = this.base.revision;
    try {
      const reply = await this.ports.publish(previous);
      if (!reply.ok || reply.revision === null) return { kind: 'refused', reply };
      this.base = { ...this.lastSaved, revision: reply.revision };
      this.problems = [];
      this.refresh();
      return { kind: 'published', revision: reply.revision, previous };
    } catch (error) {
      if (!isConflict(error)) throw error;
      await this.openConflict();
      return { kind: 'conflict' };
    }
  };

  readonly undoPublish = async (previous: number): Promise<PublishOutcome> => {
    await this.restoreAsDraft(previous);
    const plan = await this.prepare();
    if (plan.kind === 'conflict') return { kind: 'conflict' };
    if (plan.kind === 'unsaved') return { kind: 'unavailable', reason: plan.reason };
    if (plan.kind === 'blocked') {
      return {
        kind: 'unavailable',
        reason: 'The earlier version has problems and can’t be published.',
      };
    }
    return this.publish();
  };

  private readonly onStore = (): void => {
    const version = this.store.state.get().version;
    if (version === this.seen) return;
    this.seen = version;
    this.failure = null;
    this.start();
  };

  private adopt(theirs: TheirRevision): void {
    this.store.replace(theirs.program, theirs.layout);
    this.base = { program: theirs.program, layout: theirs.layout, revision: theirs.revision };
    this.lastSaved = { program: theirs.program, layout: theirs.layout };
    this.conflict = null;
    this.problems = [];
    this.forced = false;
    this.refresh();
  }

  private pending(): boolean {
    return this.store.state.get().dirty || this.forced;
  }

  private canSave(): boolean {
    return this.online && this.conflict === null && this.failure === null && this.pending();
  }

  private start(): void {
    if (this.depth > 0 || this.running !== null || !this.canSave()) {
      this.refresh();
      return;
    }
    this.running = this.pump().finally(() => {
      this.running = null;
      this.refresh();
    });
    this.refresh();
  }

  private async pump(): Promise<void> {
    while (this.canSave()) await this.saveOnce();
  }

  private async saveOnce(): Promise<void> {
    const forced = this.forced;
    this.forced = false;
    const snapshot = this.store.beginSave();
    const { program, layout } = snapshot;
    let saved = false;
    try {
      if (program.kind !== 'automation') throw new Error('Only an automation has a draft.');
      const reply = await this.ports.save({
        program,
        layout,
        expectedRevision: this.base.revision,
      });
      if (!reply.ok) throw new Error(reply.summary);
      this.problems = reply.problems;
      this.lastSaved = { program, layout };
      saved = true;
    } catch (error) {
      this.forced = forced;
      await this.onSaveError(error);
    } finally {
      this.store.finishSave(snapshot.version, saved);
    }
  }

  private async onSaveError(error: unknown): Promise<void> {
    if (isConflict(error)) {
      await this.openConflict();
      return;
    }
    this.fail(error);
  }

  private async openConflict(): Promise<void> {
    try {
      this.conflict = theirRevisionOf(await this.ports.latest());
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    log.error('draft.save_failed', error);
    this.failure = messageOf(error);
  }

  private statusOf(): SyncStatus {
    if (this.conflict !== null) return 'conflict';
    if (this.store.state.get().saving) return 'saving';
    if (this.failure !== null) return 'failed';
    if (!this.pending()) return 'saved';
    return this.online ? 'unsaved' : 'offline';
  }

  private build(): SyncState {
    return {
      status: this.statusOf(),
      revision: this.base.revision,
      problems: this.problems,
      conflict: this.conflict,
      notice: this.notice,
      failure: this.failure,
    };
  }

  private refresh(): void {
    this.state.set(this.build());
  }
}
