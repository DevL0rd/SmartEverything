import type { CheckContext } from '@smarteverything/flow/check/shapes';
import { Logger } from '@smarteverything/logging';
import type {
  GraphNode,
  Layout,
  NodeKindLookup,
  ProgramV4,
  TriggerNode,
} from '@smarteverything/domain';
import type { Density, Direction, Size } from '@smarteverything/flow/graph/metrics';
import { applyPatch, type PatchResult } from '@smarteverything/flow/graph/ops/reducer';
import type { Created } from '@smarteverything/flow/graph/ops/result';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { shownLayout } from '@smarteverything/flow/graph/layout-fit';
import { completeLayout, type PlaceOptions } from '@smarteverything/flow/graph/place-new';
import { pruneLayout } from '../../model/editor/document-store';
import type { ClipboardPort } from './clipboard-port';

export { pruneLayout };

export type Holder = GraphNode | TriggerNode;

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface GraphDocument {
  readonly program: ProgramV4;
  readonly layout: Layout;
}

export interface GraphSelection {
  readonly ids: readonly string[];
  readonly anchor: string | null;
}

export interface GraphEditState extends GraphDocument {
  readonly selection: GraphSelection;
}

export interface GraphStore {
  readonly state: { readonly get: () => GraphEditState };
  readonly apply: (ops: readonly PatchOp[]) => PatchResult;
  readonly editLayout: (edit: (layout: Layout) => Layout) => void;
  readonly beginGesture: () => void;
  readonly endGesture: () => void;
  readonly select: (id: string) => void;
  readonly toggleSelect: (id: string) => void;
  readonly clearSelected: () => void;
}

export interface EditableStore extends GraphStore {
  readonly selectEverything: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
}

export interface IntentRuntime {
  readonly newId: () => string;
  readonly density: Density;
  readonly direction: Direction;
  readonly check: CheckContext;
  readonly kinds: NodeKindLookup;
  readonly sizes: ReadonlyMap<string, Size>;
}

export interface IntentEnv {
  readonly store: GraphStore;
  readonly clipboard: ClipboardPort;
  readonly runtime: IntentRuntime;
}

export interface EditorEnv extends IntentEnv {
  readonly store: EditableStore;
}

export interface Applied {
  readonly program: ProgramV4;
  readonly created: readonly Created[];
}

export interface Message {
  readonly announcement: string;
  readonly toast?: string;
}

export interface PasteOptions {
  readonly at?: CanvasPoint | undefined;
  readonly verb: 'Pasted' | 'Duplicated' | 'Added';
  readonly attach?: (
    nodes: readonly GraphNode[],
    keyOf: (key: string) => string,
  ) => readonly PatchOp[];
}

export interface IntentPlan {
  readonly ok: true;
  readonly ops: readonly PatchOp[];
  readonly layout?: (applied: Applied, layout: Layout) => Layout;
  readonly select?: (applied: Applied) => readonly string[];
  readonly message: (applied: Applied) => Message;
  readonly unchanged?: string;
}

export interface Refusal {
  readonly ok: false;
  readonly reason: string;
}

export type Planned = IntentPlan | Refusal;

export interface IntentSuccess {
  readonly ok: true;
  readonly changed: boolean;
  readonly program: ProgramV4;
  readonly layout: Layout;
  readonly selection: readonly string[] | undefined;
  readonly announcement: string;
  readonly toast?: string;
}

export interface IntentFailure {
  readonly ok: false;
  readonly reason: string;
  readonly announcement: string;
  readonly toast: string;
}

export type IntentOutcome = IntentSuccess | IntentFailure;

export const NOTHING_CHANGED = 'Nothing changed.';

export function refuse(reason: string): Refusal {
  return { ok: false, reason };
}

export function failed(reason: string): IntentFailure {
  return { ok: false, reason, announcement: reason, toast: reason };
}

export const BROKEN_EDIT = 'That change would leave the automation broken, so nothing changed.';

const log = new Logger('app.automations');

function patchFailed(result: Extract<PatchResult, { readonly ok: false }>): IntentFailure {
  if (result.code !== 'invalid_result') return failed(result.reason);
  log.warn('automations.edit_rejected', { reason: result.reason });
  return failed(BROKEN_EDIT);
}

export function triggersOf(program: ProgramV4): readonly TriggerNode[] {
  return program.kind === 'automation' ? program.triggers : [];
}

export function holderById(program: ProgramV4, id: string): Holder | undefined {
  return (
    program.nodes.find((node) => node.id === id) ?? triggersOf(program).find((t) => t.id === id)
  );
}

export function nodeById(program: ProgramV4, id: string): GraphNode | undefined {
  return program.nodes.find((node) => node.id === id);
}

export function nodeByKey(program: ProgramV4, key: string): GraphNode | undefined {
  return program.nodes.find((node) => node.key === key);
}

export function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

function layoutOptions(runtime: IntentRuntime): PlaceOptions {
  return {
    kinds: runtime.kinds,
    direction: runtime.direction,
    density: runtime.density,
    sizes: runtime.sizes,
  };
}

export function shownDocument(document: GraphDocument, runtime: IntentRuntime): GraphDocument {
  const layout = shownLayout(document.program, document.layout, layoutOptions(runtime));
  return layout === document.layout ? document : { program: document.program, layout };
}

function finishLayout(
  before: GraphDocument,
  applied: Applied,
  plan: IntentPlan,
  runtime: IntentRuntime,
): Layout {
  const shown = shownDocument(before, runtime).layout;
  const pruned = pruneLayout(shown, applied.program);
  const edited = plan.layout === undefined ? pruned : plan.layout(applied, pruned);
  const done = completeLayout(applied.program, edited, layoutOptions(runtime));
  const untouched = applied.program === before.program && done === shown;
  return untouched ? before.layout : done;
}

function success(
  plan: IntentPlan,
  applied: Applied,
  after: { readonly layout: Layout; readonly changed: boolean },
): IntentSuccess {
  const message = after.changed
    ? plan.message(applied)
    : { announcement: plan.unchanged ?? NOTHING_CHANGED };
  return {
    ok: true,
    changed: after.changed,
    program: applied.program,
    layout: after.layout,
    selection: plan.select?.(applied),
    announcement: message.announcement,
    ...(message.toast === undefined ? {} : { toast: message.toast }),
  };
}

function appliedFrom(program: ProgramV4, patched: PatchResult | undefined): Applied {
  return patched?.ok === true
    ? { program: patched.program, created: patched.created }
    : { program, created: [] };
}

export function evaluate(
  document: GraphDocument,
  planned: Planned,
  runtime: IntentRuntime,
): IntentOutcome {
  if (!planned.ok) return failed(planned.reason);
  const patched =
    planned.ops.length === 0
      ? undefined
      : applyPatch(document.program, planned.ops, {
          newId: runtime.newId,
          allowProblems: true,
          kinds: runtime.kinds,
        });
  if (patched?.ok === false) return patchFailed(patched);
  const applied = appliedFrom(document.program, patched);
  const layout = finishLayout(document, applied, planned, runtime);
  const changed = applied.program !== document.program || layout !== document.layout;
  return success(planned, applied, { layout, changed });
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

export function selectIds(store: GraphStore, ids: readonly string[]): void {
  const state = store.state.get();
  const known = new Set(
    [...triggersOf(state.program), ...state.program.nodes].map((item) => item.id),
  );
  const wanted = [...new Set(ids.filter((id) => known.has(id)))];
  if (sameMembers(wanted, state.selection.ids)) return;
  const [first, ...rest] = wanted;
  if (first === undefined) {
    store.clearSelected();
    return;
  }
  store.select(first);
  for (const id of rest) store.toggleSelect(id);
}

function inGesture<T>(store: GraphStore, run: () => T): T {
  store.beginGesture();
  try {
    return run();
  } finally {
    store.endGesture();
  }
}

export function commit(store: GraphStore, planned: Planned, runtime: IntentRuntime): IntentOutcome {
  if (!planned.ok) return failed(planned.reason);
  const before = store.state.get();
  const patched = inGesture(store, (): PatchResult | undefined => {
    const result = planned.ops.length === 0 ? undefined : store.apply(planned.ops);
    if (result?.ok === false) return result;
    const applied = appliedFrom(before.program, result);
    store.editLayout(() => finishLayout(before, applied, planned, runtime));
    return result;
  });
  if (patched?.ok === false) return patchFailed(patched);
  const after = store.state.get();
  const changed = after.program !== before.program || after.layout !== before.layout;
  const outcome = success(planned, appliedFrom(after.program, patched), {
    layout: after.layout,
    changed,
  });
  if (outcome.selection !== undefined) selectIds(store, outcome.selection);
  return outcome;
}
