import {
  applyHomeMapEdits,
  type HomeMap,
  type HomeMapActor,
  type HomeMapEditBatch,
  type HomeMapEditConflict,
  type HomeMapEditResultAnswer,
  type HomeMapOp,
  type HomeMapRevisionEntry,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { sameJson } from '../../../store/same-json';

const log = new Logger('app.home-map');

export type HomeMapSaveStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'conflicts'; readonly messages: readonly string[] }
  | { readonly kind: 'not_saved' }
  | { readonly kind: 'unconfirmed' };

export interface HomeMapEditorState {
  readonly status: HomeMapSaveStatus;
  readonly connected: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface HomeMapEditorApi {
  readonly edit: (batch: HomeMapEditBatch) => Promise<HomeMapEditResultAnswer>;
  readonly undo: () => Promise<HomeMapEditResultAnswer>;
  readonly redo: () => Promise<HomeMapEditResultAnswer>;
  readonly revisions: (
    actor: HomeMapActor,
    after: number,
  ) => Promise<readonly HomeMapRevisionEntry[]>;
}

export interface HomeMapEditorDeps {
  readonly actor: HomeMapActor;
  readonly api: HomeMapEditorApi;
  readonly now: () => string;
  readonly read: () => HomeMap | undefined;
  readonly write: (map: HomeMap) => void;
  readonly refetch: () => Promise<HomeMap>;
}

type Direction = 'edit' | 'undo' | 'redo';

interface Attempt {
  readonly direction: Direction;
  readonly actor: HomeMapActor;
  readonly baseRevision: number;
  readonly matches: (entry: HomeMapRevisionEntry) => boolean;
}

const NOUNS: Readonly<Record<string, string>> = {
  room: 'room',
  wall: 'wall',
  opening: 'door or window',
  object: 'item',
  placement: 'device',
  annotation: 'note',
  source: 'robot map',
  notice: 'notice',
  floor: 'floor',
  map: 'map',
};

export const OFFLINE_TEXT = 'Offline: editing is paused';

function labelOf(map: HomeMap, kind: string, id: string): string | null {
  for (const floor of map.floors) {
    const name =
      kind === 'room'
        ? floor.rooms.find((room) => room.id === id)?.name
        : floor.objects.find((object) => object.id === id)?.label;
    if (name !== undefined && name !== null && name !== '') return name;
  }
  return null;
}

function nameOfElement(map: HomeMap | undefined, kind: string | null, id: string | null): string {
  const noun = NOUNS[kind ?? 'map'] ?? 'item';
  const named = kind === 'room' || kind === 'object';
  if (map === undefined || id === null || !named) return noun;
  return labelOf(map, kind, id) ?? noun;
}

export function conflictText(conflict: HomeMapEditConflict, before: HomeMap | undefined): string {
  const name = nameOfElement(before, conflict.kind, conflict.id);
  switch (conflict.reason) {
    case 'missing_element':
    case 'missing_floor':
      return `Someone removed this ${name}`;
    case 'missing_parent':
      return `The wall of this ${name} was removed, so the change was dropped`;
    case 'exists':
      return `This ${name} already exists`;
    case 'locked':
      return `This ${name} is locked`;
    case 'order_mismatch':
      return 'The floors changed while you were reordering them';
    case 'invalid':
      return `This change to the ${name} is not valid`;
  }
}

export function saveText(status: HomeMapSaveStatus): string | null {
  switch (status.kind) {
    case 'idle':
      return null;
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Your last change was saved';
    case 'not_saved':
      return 'Your last change did not save: try again';
    case 'unconfirmed':
      return 'Checking whether your last change was saved';
    case 'conflicts':
      return status.messages[0] ?? null;
  }
}

export function editorNotice(state: HomeMapEditorState): string | null {
  return state.connected ? saveText(state.status) : OFFLINE_TEXT;
}

function isSubsequence(recorded: readonly HomeMapOp[], sent: readonly HomeMapOp[]): boolean {
  let at = 0;
  for (const op of recorded) {
    while (at < sent.length && !sameJson(sent[at], op)) at += 1;
    if (at === sent.length) return false;
    at += 1;
  }
  return recorded.length > 0;
}

function sameSlots(
  answer: readonly HomeMapEditConflict[],
  local: readonly HomeMapEditConflict[],
): boolean {
  return sameJson(
    answer.map((conflict) => conflict.index),
    local.map((conflict) => conflict.index),
  );
}

const NOT_SENT: HomeMapEditorState = {
  status: { kind: 'idle' },
  connected: false,
  canUndo: false,
  canRedo: false,
};

export class HomeMapEditor {
  private current: HomeMapEditorState;
  private readonly listeners = new Set<() => void>();
  private tail: Promise<unknown> = Promise.resolve();
  private unconfirmed: Attempt | null = null;
  private undoSteps = 0;
  private redoSteps = 0;

  constructor(private readonly deps: HomeMapEditorDeps) {
    this.current = NOT_SENT;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  };

  readonly read = (): HomeMapEditorState => this.current;

  readonly setConnected = (connected: boolean): void => {
    if (this.current.connected === connected) return;
    this.set({ connected });
    if (connected && this.unconfirmed !== null) {
      background(
        this.enqueue(() => this.verify()),
        'home_map.verify_failed',
      );
    }
  };

  readonly dismiss = (): void => {
    if (this.current.status.kind !== 'saving') this.set({ status: { kind: 'idle' } });
  };

  readonly edit = (ops: readonly HomeMapOp[]): Promise<HomeMapSaveStatus> =>
    this.whileConnected(() => this.runEdit(ops));

  readonly undo = (): Promise<HomeMapSaveStatus> => this.whileConnected(() => this.runStep('undo'));

  readonly redo = (): Promise<HomeMapSaveStatus> => this.whileConnected(() => this.runStep('redo'));

  private set(patch: Partial<HomeMapEditorState>): void {
    this.current = {
      ...this.current,
      ...patch,
      canUndo: this.undoSteps > 0,
      canRedo: this.redoSteps > 0,
    };
    for (const listener of [...this.listeners]) listener();
  }

  private settle(status: HomeMapSaveStatus): HomeMapSaveStatus {
    this.set({ status });
    return status;
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = this.tail.then(job);
    this.tail = result.then(
      () => undefined,
      (error: unknown) => {
        log.error('home_map.job_failed', error);
      },
    );
    return result;
  }

  private whileConnected(job: () => Promise<HomeMapSaveStatus>): Promise<HomeMapSaveStatus> {
    if (!this.current.connected) return Promise.resolve(this.current.status);
    return this.enqueue(() =>
      this.current.connected ? job() : Promise.resolve(this.current.status),
    );
  }

  private count(direction: Direction): void {
    if (direction === 'edit') {
      this.undoSteps += 1;
      this.redoSteps = 0;
    } else if (direction === 'undo') {
      this.undoSteps = Math.max(0, this.undoSteps - 1);
      this.redoSteps += 1;
    } else {
      this.redoSteps = Math.max(0, this.redoSteps - 1);
      this.undoSteps += 1;
    }
  }

  private async runEdit(ops: readonly HomeMapOp[]): Promise<HomeMapSaveStatus> {
    const before = this.deps.read();
    if (before === undefined) {
      log.warn('home_map.edit_without_map');
      return this.settle({ kind: 'not_saved' });
    }
    const local = applyHomeMapEdits(before, ops, { actor: this.deps.actor, at: this.deps.now() });
    if (local.applied.length === 0) return this.settle(this.conflictsOf(local.conflicts, before));
    this.deps.write(local.map);
    this.settle({ kind: 'saving' });
    const attempt: Attempt = {
      direction: 'edit',
      actor: this.deps.actor,
      baseRevision: before.revision,
      matches: (entry) => isSubsequence(entry.ops, ops),
    };
    try {
      const answer = await this.deps.api.edit({ baseRevision: before.revision, ops: [...ops] });
      return await this.accepted(answer, local, before);
    } catch (error) {
      log.error('home_map.answer_lost', error, { baseRevision: before.revision, ops: ops.length });
      return this.lose(attempt);
    }
  }

  private conflictsOf(
    conflicts: readonly HomeMapEditConflict[],
    before: HomeMap | undefined,
  ): HomeMapSaveStatus {
    return conflicts.length === 0
      ? { kind: 'saved' }
      : { kind: 'conflicts', messages: conflicts.map((item) => conflictText(item, before)) };
  }

  private async accepted(
    answer: HomeMapEditResultAnswer,
    local: ReturnType<typeof applyHomeMapEdits>,
    before: HomeMap,
  ): Promise<HomeMapSaveStatus> {
    const cached = this.deps.read();
    const agrees =
      answer.revision === local.map.revision && sameSlots(answer.conflicts, local.conflicts);
    const truthHeld =
      cached !== undefined && cached !== local.map && cached.revision >= answer.revision;
    if (answer.revision > before.revision) this.count('edit');
    if (!agrees && !truthHeld) await this.catchUp();
    return this.settle(this.conflictsOf(answer.conflicts, before));
  }

  private async catchUp(): Promise<void> {
    try {
      await this.deps.refetch();
    } catch (error) {
      log.error('home_map.refetch_failed', error);
    }
  }

  private async runStep(direction: 'undo' | 'redo'): Promise<HomeMapSaveStatus> {
    const before = this.deps.read();
    const baseRevision = before?.revision ?? 0;
    this.settle({ kind: 'saving' });
    const attempt: Attempt = {
      direction,
      actor: this.deps.actor,
      baseRevision,
      matches: () => true,
    };
    try {
      const answer = await (direction === 'undo' ? this.deps.api.undo() : this.deps.api.redo());
      const cached = this.deps.read();
      if (cached === undefined || cached.revision < answer.revision) await this.catchUp();
      if (answer.revision > baseRevision) this.count(direction);
      const advanced = answer.revision > baseRevision || answer.conflicts.length > 0;
      return this.settle(advanced ? this.conflictsOf(answer.conflicts, before) : { kind: 'idle' });
    } catch (error) {
      log.error('home_map.answer_lost', error, { baseRevision, direction });
      return this.lose(attempt);
    }
  }

  private lose(attempt: Attempt): Promise<HomeMapSaveStatus> {
    this.unconfirmed = attempt;
    return this.verify();
  }

  private async verify(): Promise<HomeMapSaveStatus> {
    const attempt = this.unconfirmed;
    if (attempt === null) return this.current.status;
    try {
      const entries = await this.deps.api.revisions(attempt.actor, attempt.baseRevision);
      await this.deps.refetch();
      this.unconfirmed = null;
      const landed = entries.some(attempt.matches);
      if (landed) this.count(attempt.direction);
      log.info('home_map.answer_checked', { baseRevision: attempt.baseRevision, landed });
      return this.settle({ kind: landed ? 'saved' : 'not_saved' });
    } catch (error) {
      log.error('home_map.unconfirmed', error, { baseRevision: attempt.baseRevision });
      return this.settle({ kind: 'unconfirmed' });
    }
  }
}
