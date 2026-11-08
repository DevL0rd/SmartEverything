import type { NodeKindLookup } from '@smarteverything/domain';
import type { ProgramV4 } from '@smarteverything/domain';
import { structuredOf, type StructuredOf } from '@smarteverything/flow/graph/structured-of';
import type { Program } from '@smarteverything/flow/program/walk';

const cache = new WeakMap<ProgramV4, StructuredOf>();

export function structuredFor(program: ProgramV4, kinds: NodeKindLookup): StructuredOf {
  const known = cache.get(program);
  if (known !== undefined) return known;
  const made = structuredOf(program, kinds);
  cache.set(program, made);
  return made;
}

export function treeFor(program: ProgramV4, kinds: NodeKindLookup): Program | null {
  const found = structuredFor(program, kinds);
  return found.kind === 'structured' ? found.tree : null;
}
