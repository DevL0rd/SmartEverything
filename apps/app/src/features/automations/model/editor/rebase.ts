import { randomUUID } from 'expo-crypto';
import type { NodeKindLookup } from '@smarteverything/domain';
import type { Layout, ProgramV4 } from '@smarteverything/domain';
import type { PatchOptions } from '@smarteverything/flow/graph/ops/reducer';
import { applyPatch } from '@smarteverything/flow/graph/ops/reducer';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { pruneLayout } from './document-store';
import { draftOps } from './rebase-ops';

export { deepEqual } from './deep-equal';
export { draftOps } from './rebase-ops';

export interface DroppedOp {
  readonly op: PatchOp;
  readonly summary: string;
  readonly reason: string;
}

export interface RebaseInput {
  readonly base: ProgramV4;
  readonly draft: ProgramV4;
  readonly draftLayout: Layout;
  readonly theirs: ProgramV4;
  readonly theirsLayout: Layout;
  readonly options?: Partial<Omit<PatchOptions, 'kinds'>>;
}

export interface RebaseResult {
  readonly program: ProgramV4;
  readonly layout: Layout;
  readonly applied: readonly PatchOp[];
  readonly settled: readonly PatchOp[];
  readonly dropped: readonly DroppedOp[];
}

type WordOp = Extract<PatchOp, { op: 'wrap' | 'rename' | 'header' | 'connect' | 'disconnect' }>;

function isWordOp(op: PatchOp): op is WordOp {
  return (
    op.op === 'wrap' ||
    op.op === 'rename' ||
    op.op === 'header' ||
    op.op === 'connect' ||
    op.op === 'disconnect'
  );
}

function describeWord(op: WordOp): string {
  switch (op.op) {
    case 'wrap':
      return `Group ${op.keys.map((key) => `"${key}"`).join(', ')}`;
    case 'rename':
      return `Rename "${op.key}" to "${op.to}"`;
    case 'header':
      return 'Change the automation settings';
    case 'connect':
      return `Connect "${op.from}" to "${op.to}"`;
    case 'disconnect':
      return `Disconnect "${op.from}"`;
  }
}

export function describeOp(op: PatchOp): string {
  if (isWordOp(op)) return describeWord(op);
  switch (op.op) {
    case 'add':
      return `Add "${op.node.label ?? op.node.key ?? op.node.kind}"`;
    case 'set':
      return `Change "${op.key}"`;
    case 'unset':
      return `Clear a value on "${op.key}"`;
    case 'remove':
      return `Remove "${op.key}"`;
    case 'row':
      return `Change the rows of "${op.key}"`;
    case 'path':
      return `Change the paths of "${op.key}"`;
  }
}

export function rebaseLayout(theirs: Layout, draft: Layout, program: ProgramV4): Layout {
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

function alreadyDone(op: PatchOp, code: string): boolean {
  return (
    (op.op === 'remove' && code === 'unknown_key') ||
    (op.op === 'disconnect' && code === 'bad_target')
  );
}

export function rebaseDraft(input: RebaseInput, kinds: NodeKindLookup): RebaseResult {
  const applied: PatchOp[] = [];
  const settled: PatchOp[] = [];
  const dropped: DroppedOp[] = [];
  let program = input.theirs;
  for (const op of draftOps(input.base, input.draft, kinds)) {
    const result = applyPatch(program, [op], {
      allowProblems: true,
      newId: randomUUID,
      ...input.options,
      kinds,
    });
    if (result.ok) {
      program = result.program;
      applied.push(op);
    } else if (alreadyDone(op, result.code)) {
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
