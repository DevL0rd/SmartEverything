import fc from 'fast-check';
import { PROGRAM_V3 } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { automationV3, functionV3 } from '../../../domain/test/support/automation-v3-arbitraries';
import { applyPatch } from '../../src/ops/reducer';
import type { PatchOp } from '../../src/ops/schema';
import type { Entry } from '../../src/program/lookup';
import { indexProgram } from '../../src/program/lookup';
import { formatScopePath } from '../../src/program/paths';
import type { Program } from '../../src/program/walk';
import { childScopeRefs, rootScopes, walkProgram } from '../../src/program/walk';
import { newId } from './support';

interface Seed {
  readonly kind: number;
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

const seeds = fc.array(
  fc.record({
    kind: fc.integer({ min: 0, max: 9 }),
    a: fc.nat(1000),
    b: fc.nat(1000),
    c: fc.nat(1000),
  }),
  { minLength: 1, maxLength: 8 },
);

function pick<T>(items: readonly T[], at: number): T | undefined {
  return items.length === 0 ? undefined : items[at % items.length];
}

function scopePaths(program: Program): readonly { path: string; length: number }[] {
  const roots = rootScopes(program).map((ref) => ({
    path: formatScopePath(ref.path),
    length: ref.scope.nodes.length,
  }));
  const children = walkProgram(program).flatMap(({ node, storage }) =>
    childScopeRefs(node, storage).map((ref) => ({
      path: formatScopePath(ref.path),
      length: ref.scope.nodes.length,
    })),
  );
  return [...roots, ...children];
}

interface Pick {
  readonly program: Program;
  readonly entry: Entry;
  readonly scope: { path: string; length: number };
  readonly seed: Seed;
}

type Maker = (pick: Pick) => PatchOp | undefined;

function keyOf(pick: Pick): string {
  return pick.entry.node.key;
}

function slot(pick: Pick): number {
  return pick.seed.c % (pick.scope.length + 1);
}

function setOrUnset(pick: Pick): PatchOp {
  const key = keyOf(pick);
  const port = Object.keys(pick.entry.node.ports ?? {})[0];
  return port === undefined
    ? { op: 'set', key, enabled: null }
    : { op: 'unset', key, ports: [port] };
}

function wrapRun(pick: Pick): PatchOp | undefined {
  const { entry } = pick;
  if (entry.kind === 'trigger') return undefined;
  const here = formatScopePath(entry.scope);
  const list = indexProgram(pick.program).nodes.filter(
    (other) => formatScopePath(other.scope) === here,
  );
  const run = list
    .slice(entry.index, entry.index + 1 + (pick.seed.c % 3))
    .map((other) => other.node.key);
  const [head, ...rest] = run;
  if (head === undefined) return undefined;
  return { op: 'wrap', keys: [head, ...rest], kind: 'flow.repeat', ports: { times: { lit: 2 } } };
}

const MAKERS: readonly Maker[] = [
  (pick): PatchOp => ({
    op: 'add',
    node: { kind: 'notify.feed', ports: { p: { wire: { from: keyOf(pick), port: 'ok' } } } },
    in: pick.scope.path,
    index: slot(pick),
  }),
  (pick): PatchOp => ({
    op: 'set',
    key: keyOf(pick),
    label: `label ${String(pick.seed.c)}`,
    ports: { extra: { lit: pick.seed.c } },
  }),
  setOrUnset,
  (pick): PatchOp => ({
    op: 'move',
    key: keyOf(pick),
    in: pick.entry.kind === 'trigger' ? 'triggers' : pick.scope.path,
    index: slot(pick),
  }),
  (pick): PatchOp => ({ op: 'remove', key: keyOf(pick), cascade: pick.seed.c % 2 === 0 }),
  wrapRun,
  (pick): PatchOp => ({ op: 'unwrap', key: keyOf(pick) }),
  (pick): PatchOp => ({ op: 'rename', key: keyOf(pick), to: `renamed${String(pick.seed.c)}` }),
  (pick): PatchOp => ({
    op: 'header',
    description: pick.seed.c % 2 === 0 ? `d${String(pick.seed.c)}` : null,
  }),
  (): PatchOp => ({ op: 'add', node: { kind: 'notify.feed' }, in: 'triggers' }),
];

function opFor(program: Program, seed: Seed): PatchOp | undefined {
  const entry = pick([...indexProgram(program).byKey.values()], seed.a);
  const scope = pick(scopePaths(program), seed.b);
  const maker = MAKERS[seed.kind];
  if (entry === undefined || scope === undefined || maker === undefined) return undefined;
  return maker({ program, entry, scope, seed });
}

describe('patch operations', () => {
  it('keep a program valid or are refused whole, and the inverses undo every step', () => {
    fc.assert(
      fc.property(fc.oneof(automationV3, functionV3), seeds, (original, steps) => {
        let current: Program = original;
        const undo: PatchOp[] = [];
        for (const seed of steps) {
          const op = opFor(current, seed);
          if (op === undefined) continue;
          const snapshot = structuredClone(current);
          const result = applyPatch(current, [op], { newId });
          expect(current).toEqual(snapshot);
          if (!result.ok) continue;
          expect(PROGRAM_V3.safeParse(result.program).success).toBe(true);
          const single = applyPatch(result.program, result.inverse, { newId });
          expect(single.ok && single.program).toEqual(current);
          undo.unshift(...result.inverse);
          current = result.program;
        }
        const back = applyPatch(current, undo, { newId });
        expect(back.ok && back.program).toEqual(original);
      }),
      { numRuns: 300 },
    );
  });

  it('batches of several operations are atomic and undone with one inverse', () => {
    fc.assert(
      fc.property(automationV3, seeds, (original, steps) => {
        const ops: PatchOp[] = [];
        let preview: Program = original;
        for (const seed of steps) {
          const op = opFor(preview, seed);
          if (op === undefined) continue;
          const step = applyPatch(preview, [op], { newId });
          if (!step.ok) continue;
          ops.push(op);
          preview = step.program;
        }
        if (ops.length === 0) return;
        const batch = applyPatch(original, ops, { newId });
        if (!batch.ok) return;
        const back = applyPatch(batch.program, batch.inverse, { newId });
        expect(back.ok && back.program).toEqual(original);
      }),
      { numRuns: 100 },
    );
  });
});
