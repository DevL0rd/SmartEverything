import type {
  FlowNode,
  Layout,
  NodePolicy,
  PortValue,
  Scope,
  StructuredOutput,
  TriggerNode,
} from '@smarteverything/domain';
import type { Entry, ProgramIndex } from '@smarteverything/flow/program/lookup';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import { formatScopePath } from '@smarteverything/flow/program/paths';
import type { Program } from '@smarteverything/flow/program/walk';
import type { PatchOptions } from '@smarteverything/flow/ops/reducer';
import { applyPatch } from '@smarteverything/flow/ops/reducer';
import type { HeaderOp, NodeInput, PatchOp, SetOp } from '@smarteverything/flow/ops/schema';
import { TRIGGERS_TARGET } from '@smarteverything/flow/ops/schema';
import { pruneLayout } from './document-store';

export interface DroppedOp {
  readonly op: PatchOp;
  readonly summary: string;
  readonly reason: string;
}

export interface RebaseInput {
  readonly base: Program;
  readonly draft: Program;
  readonly draftLayout: Layout;
  readonly theirs: Program;
  readonly theirsLayout: Layout;
  readonly options?: PatchOptions;
}

export interface RebaseResult {
  readonly program: Program;
  readonly layout: Layout;
  readonly applied: readonly PatchOp[];
  readonly settled: readonly PatchOp[];
  readonly dropped: readonly DroppedOp[];
}

type Holder = FlowNode | TriggerNode;

function sameList(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((item, at) => deepEqual(item, right[at]));
}

function sameRecord(left: object, right: object): boolean {
  const mine = Object.entries(left);
  const theirs = new Map(Object.entries(right));
  return (
    mine.length === theirs.size && mine.every(([key, value]) => deepEqual(value, theirs.get(key)))
  );
}

export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && sameList(left, right);
  }
  return sameRecord(left, right);
}

function diff<T>(before: T | undefined, after: T | undefined): T | null | undefined {
  return deepEqual(before, after) ? undefined : (after ?? null);
}

function entriesOf(index: ProgramIndex): readonly Entry[] {
  return [...index.byId.values()];
}

function whereOf(entry: Entry): string {
  return entry.kind === 'trigger' ? TRIGGERS_TARGET : formatScopePath(entry.scope);
}

function stripScope(scope: Scope, kept: ReadonlySet<string>): Scope {
  return {
    nodes: scope.nodes.filter((node) => !kept.has(node.id)).map((node) => stripNode(node, kept)),
  };
}

function stripNode(node: FlowNode, kept: ReadonlySet<string>): FlowNode {
  const { branches, cases, catches, scopes, ...rest } = node;
  return {
    ...rest,
    ...(branches === undefined
      ? {}
      : { branches: branches.map((row) => ({ ...row, scope: stripScope(row.scope, kept) })) }),
    ...(cases === undefined
      ? {}
      : { cases: cases.map((row) => ({ ...row, scope: stripScope(row.scope, kept) })) }),
    ...(catches === undefined
      ? {}
      : { catches: catches.map((row) => ({ ...row, scope: stripScope(row.scope, kept) })) }),
    ...(scopes === undefined
      ? {}
      : {
          scopes: Object.fromEntries(
            Object.entries(scopes).map(([name, scope]) => [name, stripScope(scope, kept)]),
          ),
        }),
  };
}

function inputOf(entry: Entry, kept: ReadonlySet<string>): NodeInput {
  return entry.kind === 'trigger' ? entry.node : stripNode(entry.node, kept);
}

function automationHeader(base: Program, draft: Program): Omit<HeaderOp, 'op'> {
  if (base.kind !== 'automation' || draft.kind !== 'automation') return {};
  const policy = deepEqual(base.policy, draft.policy) ? undefined : draft.policy;
  return {
    ...(policy === undefined ? {} : { policy }),
    admit: diff(base.admit, draft.admit),
    budgets: diff(base.budgets, draft.budgets),
  };
}

function headerOps(base: Program, draft: Program): PatchOp[] {
  const fields: Omit<HeaderOp, 'op'> = {
    ...(deepEqual(base.variables, draft.variables) ? {} : { variables: draft.variables }),
    ...(deepEqual(base.inputs, draft.inputs) ? {} : { inputs: draft.inputs }),
    ...(deepEqual(base.outputs, draft.outputs) ? {} : { outputs: draft.outputs }),
    description: diff(base.description, draft.description),
    ...automationHeader(base, draft),
  };
  const named = Object.values(fields).filter((value) => value !== undefined);
  return named.length === 0 ? [] : [{ op: 'header', ...fields }];
}

function renameOps(before: ProgramIndex, after: readonly Entry[], kept: Set<string>): PatchOp[] {
  return after.flatMap((entry): PatchOp[] => {
    const was = before.byId.get(entry.node.id);
    return kept.has(entry.node.id) && was !== undefined && was.node.key !== entry.node.key
      ? [{ op: 'rename', key: was.node.key, to: entry.node.key }]
      : [];
  });
}

function policyOf(holder: Holder): NodePolicy | undefined {
  return 'policy' in holder ? holder.policy : undefined;
}

function outputsOf(holder: Holder): StructuredOutput[] | undefined {
  return 'outputs' in holder ? holder.outputs : undefined;
}

function changedPorts(was: Holder, now: Holder): Record<string, PortValue> | undefined {
  const before = was.ports ?? {};
  const changed = Object.entries(now.ports ?? {}).filter(
    ([name, value]) => !deepEqual(before[name], value),
  );
  return changed.length === 0 ? undefined : Object.fromEntries(changed);
}

function setOf(was: Holder, now: Holder): SetOp | null {
  const fields: Omit<SetOp, 'op' | 'key'> = {
    ports: changedPorts(was, now),
    policy: diff(policyOf(was), policyOf(now)),
    outputs: diff(outputsOf(was), outputsOf(now)),
    label: diff(was.label, now.label),
    note: diff(was.note, now.note),
    enabled: diff(was.enabled, now.enabled),
  };
  return Object.values(fields).every((value) => value === undefined)
    ? null
    : { op: 'set', key: now.key, ...fields };
}

function unsetOf(was: Holder, now: Holder): PatchOp[] {
  const gone = Object.keys(was.ports ?? {}).filter((name) => !(name in (now.ports ?? {})));
  return gone.length === 0 ? [] : [{ op: 'unset', key: now.key, ports: gone }];
}

function fieldOps(before: ProgramIndex, after: readonly Entry[], kept: Set<string>): PatchOp[] {
  return after.flatMap((entry): PatchOp[] => {
    const was = before.byId.get(entry.node.id);
    if (!kept.has(entry.node.id) || was === undefined) return [];
    const set = setOf(was.node, entry.node);
    return [...(set === null ? [] : [set]), ...unsetOf(was.node, entry.node)];
  });
}

function neighbours(
  entries: readonly Entry[],
  keptOnly: (entry: Entry) => boolean,
): ReadonlyMap<string, { readonly any: string | null; readonly kept: string | null }> {
  const last = new Map<string, { any: string | null; kept: string | null }>();
  const result = new Map<string, { readonly any: string | null; readonly kept: string | null }>();
  for (const entry of entries) {
    const where = whereOf(entry);
    const previous = last.get(where) ?? { any: null, kept: null };
    result.set(entry.node.id, { any: previous.any, kept: previous.kept });
    last.set(where, {
      any: entry.node.key,
      kept: keptOnly(entry) ? entry.node.key : previous.kept,
    });
  }
  return result;
}

function parentIsNew(entry: Entry, after: ProgramIndex, kept: ReadonlySet<string>): boolean {
  if (entry.kind === 'trigger') return false;
  const parent = after.byKey.get(entry.ancestors.at(-1) ?? '');
  return parent !== undefined && !kept.has(parent.node.id);
}

interface Placement {
  readonly after?: string;
  readonly index?: number;
}

function placementOf(anchor: string | null): Placement {
  return anchor === null ? { index: 0 } : { after: anchor };
}

function placementOps(before: ProgramIndex, after: ProgramIndex, kept: Set<string>): PatchOp[] {
  const now = entriesOf(after);
  const was = entriesOf(before);
  const isKept = (entry: Entry): boolean => kept.has(entry.node.id);
  const next = neighbours(now, isKept);
  const prior = neighbours(was, isKept);
  return now.flatMap((entry): PatchOp[] => {
    const around = next.get(entry.node.id);
    if (around === undefined) return [];
    const place = placementOf(around.any);
    if (!kept.has(entry.node.id)) {
      return parentIsNew(entry, after, kept)
        ? []
        : [{ op: 'add', node: inputOf(entry, kept), in: whereOf(entry), ...place }];
    }
    const old = before.byId.get(entry.node.id);
    const moved =
      old === undefined ||
      whereOf(old) !== whereOf(entry) ||
      prior.get(entry.node.id)?.kept !== around.kept;
    return moved ? [{ op: 'move', key: entry.node.key, in: whereOf(entry), ...place }] : [];
  });
}

function removeOps(before: ProgramIndex, kept: Set<string>): PatchOp[] {
  return entriesOf(before).flatMap((entry): PatchOp[] => {
    if (kept.has(entry.node.id)) return [];
    const parent =
      entry.kind === 'trigger' ? undefined : before.byKey.get(entry.ancestors.at(-1) ?? '');
    return parent !== undefined && !kept.has(parent.node.id)
      ? []
      : [{ op: 'remove', key: entry.node.key, cascade: true }];
  });
}

export function draftOps(base: Program, draft: Program): readonly PatchOp[] {
  const before = indexProgram(base);
  const after = indexProgram(draft);
  const kept = new Set([...after.byId.keys()].filter((id) => before.byId.has(id)));
  return [
    ...headerOps(base, draft),
    ...renameOps(before, entriesOf(after), kept),
    ...fieldOps(before, entriesOf(after), kept),
    ...placementOps(before, after, kept),
    ...removeOps(before, kept),
  ];
}

type StructureOp = Extract<PatchOp, { op: 'wrap' | 'unwrap' | 'rename' | 'header' }>;

function isStructure(op: PatchOp): op is StructureOp {
  return op.op === 'wrap' || op.op === 'unwrap' || op.op === 'rename' || op.op === 'header';
}

function describeStructure(op: StructureOp): string {
  switch (op.op) {
    case 'wrap':
      return `Group ${op.keys.map((key) => `"${key}"`).join(', ')}`;
    case 'unwrap':
      return `Ungroup "${op.key}"`;
    case 'rename':
      return `Rename "${op.key}" to "${op.to}"`;
    case 'header':
      return 'Change the automation settings';
  }
}

export function describeOp(op: PatchOp): string {
  if (isStructure(op)) return describeStructure(op);
  switch (op.op) {
    case 'add':
      return `Add "${op.node.label ?? op.node.key ?? op.node.kind}"`;
    case 'set':
      return `Change "${op.key}"`;
    case 'unset':
      return `Clear a value on "${op.key}"`;
    case 'move':
      return `Move "${op.key}"`;
    case 'remove':
      return `Remove "${op.key}"`;
    case 'row':
      return `Change the rows of "${op.key}"`;
  }
}

export function rebaseLayout(theirs: Layout, draft: Layout, program: Program): Layout {
  const framed = new Set(draft.frames.map((frame) => frame.id));
  const commented = new Set(draft.comments.map((comment) => comment.id));
  return pruneLayout(
    {
      ...theirs,
      nodes: { ...theirs.nodes, ...draft.nodes },
      frames: [...theirs.frames.filter((frame) => !framed.has(frame.id)), ...draft.frames],
      comments: [
        ...theirs.comments.filter((comment) => !commented.has(comment.id)),
        ...draft.comments,
      ],
    },
    program,
  );
}

export function rebaseDraft(input: RebaseInput): RebaseResult {
  const applied: PatchOp[] = [];
  const settled: PatchOp[] = [];
  const dropped: DroppedOp[] = [];
  let program = input.theirs;
  for (const op of draftOps(input.base, input.draft)) {
    const result = applyPatch(program, [op], input.options);
    if (result.ok) {
      program = result.program;
      applied.push(op);
    } else if (op.op === 'remove' && result.code === 'unknown_key') {
      settled.push(op);
    } else {
      dropped.push({ op, summary: describeOp(op), reason: result.reason });
    }
  }
  return {
    program,
    layout: rebaseLayout(input.theirsLayout, input.draftLayout, program),
    applied,
    settled,
    dropped,
  };
}
