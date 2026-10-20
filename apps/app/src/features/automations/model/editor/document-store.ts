import type { Layout } from '@smarteverything/domain';
import { EMPTY_LAYOUT } from '@smarteverything/domain';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import type { PatchOptions, PatchResult } from '@smarteverything/flow/ops/reducer';
import { applyPatch } from '@smarteverything/flow/ops/reducer';
import type { PatchOp } from '@smarteverything/flow/ops/schema';
import { ValueStore } from '../../../../design/external-store';
import type { Selection } from './selection';
import {
  EMPTY_SELECTION,
  clearSelection,
  extendTo,
  programOrder,
  pruneSelection,
  selectAll,
  selectOnly,
  toggle,
} from './selection';

export const HISTORY_LIMIT = 200;

export interface Refusal {
  readonly code: string;
  readonly reason: string;
  readonly opIndex: number | undefined;
}

export interface Snapshot {
  readonly program: Program;
  readonly layout: Layout;
  readonly version: number;
}

export interface DocumentState {
  readonly program: Program;
  readonly layout: Layout;
  readonly selection: Selection;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly version: number;
  readonly refusal: Refusal | null;
}

interface HistoryEntry {
  readonly inverse: readonly PatchOp[];
  readonly layout: Layout;
}

export function pruneLayout(layout: Layout, program: Program): Layout {
  const present = new Set(indexProgram(program).byId.keys());
  const nodes = Object.entries(layout.nodes).filter(([id]) => present.has(id));
  const framed = layout.frames.some((frame) => frame.nodeIds.some((id) => !present.has(id)));
  if (nodes.length === Object.keys(layout.nodes).length && !framed) return layout;
  return {
    ...layout,
    nodes: Object.fromEntries(nodes),
    frames: layout.frames.map((frame) => ({
      ...frame,
      nodeIds: frame.nodeIds.filter((id) => present.has(id)),
    })),
  };
}

export class DocumentStore {
  readonly state: ValueStore<DocumentState>;

  private program: Program;
  private layout: Layout;
  private selection: Selection = EMPTY_SELECTION;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private pending: HistoryEntry | null = null;
  private depth = 0;
  private version = 0;
  private savedVersion = 0;
  private saving = false;
  private refusal: Refusal | null = null;

  constructor(
    program: Program,
    layout: Layout = EMPTY_LAYOUT,
    private readonly options: PatchOptions = {},
  ) {
    this.program = program;
    this.layout = layout;
    this.state = new ValueStore<DocumentState>(this.build());
  }

  readonly apply = (ops: readonly PatchOp[]): PatchResult => {
    const result = applyPatch(this.program, ops, this.options);
    if (!result.ok) {
      this.refusal = { code: result.code, reason: result.reason, opIndex: result.opIndex };
      this.emit();
      return result;
    }
    const before = this.layout;
    this.program = result.program;
    this.layout = pruneLayout(before, result.program);
    this.record({ inverse: result.inverse, layout: before });
    return result;
  };

  readonly editLayout = (edit: (layout: Layout) => Layout): void => {
    const before = this.layout;
    const next = edit(before);
    if (next === before) return;
    this.layout = next;
    this.record({ inverse: [], layout: before });
  };

  readonly beginGesture = (): void => {
    this.depth += 1;
  };

  readonly endGesture = (): void => {
    if (this.depth === 0) return;
    this.depth -= 1;
    if (this.depth > 0) return;
    this.commit();
    this.emit();
  };

  readonly undo = (): void => {
    this.step(this.undoStack, this.redoStack);
  };

  readonly redo = (): void => {
    this.step(this.redoStack, this.undoStack);
  };

  readonly replace = (program: Program, layout: Layout): void => {
    this.program = program;
    this.layout = layout;
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
    this.depth = 0;
    this.refusal = null;
    this.version += 1;
    this.savedVersion = this.version;
    this.afterChange();
  };

  readonly beginSave = (): Snapshot => {
    this.saving = true;
    this.emit();
    return { program: this.program, layout: this.layout, version: this.version };
  };

  readonly finishSave = (version: number, saved: boolean): void => {
    this.saving = false;
    if (saved) this.savedVersion = version;
    this.emit();
  };

  readonly clearRefusal = (): void => {
    if (this.refusal === null) return;
    this.refusal = null;
    this.emit();
  };

  readonly select = (id: string): void => {
    this.setSelection(selectOnly(this.selection, id));
  };

  readonly toggleSelect = (id: string): void => {
    this.setSelection(toggle(this.selection, id));
  };

  readonly extendSelect = (id: string): void => {
    this.setSelection(extendTo(this.selection, programOrder(this.program), id));
  };

  readonly selectEverything = (): void => {
    this.setSelection(selectAll(this.selection, programOrder(this.program)));
  };

  readonly clearSelected = (): void => {
    this.setSelection(clearSelection(this.selection));
  };

  private setSelection(next: Selection): void {
    if (next === this.selection) return;
    this.selection = next;
    this.emit();
  }

  private record(entry: HistoryEntry): void {
    this.pending =
      this.pending === null
        ? entry
        : { inverse: [...entry.inverse, ...this.pending.inverse], layout: this.pending.layout };
    this.redoStack = [];
    this.refusal = null;
    this.version += 1;
    if (this.depth === 0) this.commit();
    this.afterChange();
  }

  private commit(): void {
    if (this.pending === null) return;
    this.undoStack.push(this.pending);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.pending = null;
  }

  private step(from: HistoryEntry[], to: HistoryEntry[]): void {
    this.depth = 0;
    this.commit();
    const entry = from.pop();
    if (entry === undefined) return;
    const result = applyPatch(this.program, entry.inverse, this.options);
    if (!result.ok) {
      this.undoStack = [];
      this.redoStack = [];
      this.refusal = { code: result.code, reason: result.reason, opIndex: result.opIndex };
      this.emit();
      return;
    }
    to.push({ inverse: result.inverse, layout: this.layout });
    this.program = result.program;
    this.layout = entry.layout;
    this.refusal = null;
    this.version += 1;
    this.afterChange();
  }

  private afterChange(): void {
    this.selection = pruneSelection(this.selection, new Set(programOrder(this.program)));
    this.emit();
  }

  private build(): DocumentState {
    return {
      program: this.program,
      layout: this.layout,
      selection: this.selection,
      canUndo: this.undoStack.length > 0 || this.pending !== null,
      canRedo: this.redoStack.length > 0,
      dirty: this.version !== this.savedVersion,
      saving: this.saving,
      version: this.version,
      refusal: this.refusal,
    };
  }

  private emit(): void {
    this.state.set(this.build());
  }
}
