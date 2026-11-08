import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { GraphNode, ProgramV4 } from '@smarteverything/domain';
import { expect } from 'vitest';
import { applyPatch, type PatchOptions, type PatchResult } from '../../../src/graph/ops/reducer';
import type { PatchOp } from '../../../src/graph/ops/schema';
import { structureProgram } from '../../../src/graph/structure';
import { automation, idOf, start, step } from '../graph-fixtures';

let counter = 0;

export function newId(): string {
  counter += 1;
  return `22222222-2222-4222-8222-${counter.toString(16).padStart(12, '0')}`;
}

export function chain(): ProgramV4 {
  return automation([start('a'), step('a', 'b'), step('b', 'c'), step('c')]);
}

export function ok(
  program: ProgramV4,
  ops: readonly PatchOp[],
  options: Partial<PatchOptions> = {},
): Extract<PatchResult, { ok: true }> {
  const result = applyPatch(program, ops, { newId, kinds: STATIC_KIND_LOOKUP, ...options });
  if (!result.ok) throw new Error(`refused: ${result.code} ${result.reason}`);
  return result;
}

export function refused(
  program: ProgramV4,
  ops: readonly PatchOp[],
  options: Partial<PatchOptions> = {},
): Extract<PatchResult, { ok: false }> {
  const result = applyPatch(program, ops, { newId, kinds: STATIC_KIND_LOOKUP, ...options });
  if (result.ok) throw new Error('expected a refusal');
  return result;
}

export function nodeAt(program: ProgramV4, key: string): GraphNode {
  const found = program.nodes.find((node) => node.key === key);
  if (found === undefined) throw new Error(`no node ${key}`);
  return found;
}

export function toOf(program: ProgramV4, key: string, port: string): string | undefined {
  return nodeAt(program, key).to?.[port];
}

export function normal(program: ProgramV4): ProgramV4 {
  const nodes = [...program.nodes].sort((left, right) => (left.key < right.key ? -1 : 1));
  return { ...program, nodes };
}

export function expectStructured(program: ProgramV4): void {
  const result = structureProgram(program, STATIC_KIND_LOOKUP);
  expect(result.ok ? [] : result.problems.map((problem) => problem.message)).toEqual([]);
}

export function expectUndo(program: ProgramV4, ops: readonly PatchOp[]): ProgramV4 {
  const done = ok(program, ops, { kinds: STATIC_KIND_LOOKUP, allowProblems: true });
  const back = ok(done.program, done.inverse, { kinds: STATIC_KIND_LOOKUP, allowProblems: true });
  expect(normal(back.program)).toEqual(normal(program));
  return done.program;
}

export { idOf };
