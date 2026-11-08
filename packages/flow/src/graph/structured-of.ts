import type { NodeKindLookup, ProgramV4 } from '@smarteverything/domain';
import type { Program } from '../program/walk';
import { placeValues } from './place-values';
import type { GraphProblem } from './problem-types';
import { structureProgram, type StructureMap } from './structure';

export type StructuredOf =
  | { readonly kind: 'structured'; readonly tree: Program; readonly map: StructureMap }
  | { readonly kind: 'unstructured'; readonly problems: readonly GraphProblem[] };

export function structuredOf(program: ProgramV4, kinds: NodeKindLookup): StructuredOf {
  const result = structureProgram(program, kinds);
  if (!result.ok) return { kind: 'unstructured', problems: result.problems };
  const placed = placeValues(result, kinds);
  return { kind: 'structured', tree: placed.tree, map: placed.map };
}
