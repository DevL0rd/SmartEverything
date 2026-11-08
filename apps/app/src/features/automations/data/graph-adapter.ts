import type { NodeKindLookup } from '@smarteverything/domain';
import type {
  AutomationFunctionDetail,
  AutomationRevisionRow,
  StoredAutomationRow,
  AutomationV3,
  AutomationV4,
  FunctionV3,
  FunctionV4,
} from '@smarteverything/domain';
import type { GraphProblem } from '@smarteverything/flow/graph/problem-types';
import type { StructureMap } from '@smarteverything/flow/graph/structure';
import { structuredOf } from '@smarteverything/flow/graph/structured-of';

export interface AutomationRow extends Omit<StoredAutomationRow, 'definition'> {
  readonly definition: AutomationV3;
  readonly graph: AutomationV4;
  readonly map: StructureMap;
}

export interface RevisionRow extends Omit<AutomationRevisionRow, 'definition'> {
  readonly definition: AutomationV3;
  readonly graph: AutomationV4;
  readonly map: StructureMap;
}

export interface FunctionDetail extends Omit<AutomationFunctionDetail, 'program'> {
  readonly program: FunctionV3;
  readonly graph: FunctionV4;
  readonly map: StructureMap;
}

export type Adapted<T> =
  | { readonly kind: 'ready'; readonly value: T }
  | { readonly kind: 'unstructured'; readonly problems: readonly GraphProblem[] };

export class UnstructuredProgramError extends Error {
  override readonly name = 'UnstructuredProgramError';

  constructor(readonly problems: readonly GraphProblem[]) {
    super(
      problems.length === 0
        ? 'This program does not turn into steps.'
        : problems.map((problem) => problem.message).join(' '),
    );
  }
}

export interface Structure<G, T> {
  readonly graph: G;
  readonly tree: T;
  readonly map: StructureMap;
}

export function structureAutomation(
  graph: AutomationV4,
  kinds: NodeKindLookup,
): Adapted<Structure<AutomationV4, AutomationV3>> {
  const result = structuredOf(graph, kinds);
  if (result.kind === 'unstructured') return result;
  if (result.tree.kind !== 'automation') return { kind: 'unstructured', problems: [] };
  return { kind: 'ready', value: { graph, tree: result.tree, map: result.map } };
}

function functionStructure(
  graph: FunctionV4,
  kinds: NodeKindLookup,
): Adapted<Structure<FunctionV4, FunctionV3>> {
  const result = structuredOf(graph, kinds);
  if (result.kind === 'unstructured') return result;
  if (result.tree.kind !== 'function') return { kind: 'unstructured', problems: [] };
  return { kind: 'ready', value: { graph, tree: result.tree, map: result.map } };
}

export function adaptAutomationRow(
  row: StoredAutomationRow,
  kinds: NodeKindLookup,
): Adapted<AutomationRow> {
  const found = structureAutomation(row.definition, kinds);
  if (found.kind === 'unstructured') return found;
  const { graph, tree, map } = found.value;
  return { kind: 'ready', value: { ...row, definition: tree, graph, map } };
}

function readyOrThrow<T>(adapted: Adapted<T>): T {
  if (adapted.kind === 'unstructured') throw new UnstructuredProgramError(adapted.problems);
  return adapted.value;
}

export function adaptRevision(row: AutomationRevisionRow, kinds: NodeKindLookup): RevisionRow {
  const { graph, tree, map } = readyOrThrow(structureAutomation(row.definition, kinds));
  return { ...row, definition: tree, graph, map };
}

export function adaptFunction(
  detail: AutomationFunctionDetail,
  kinds: NodeKindLookup,
): FunctionDetail {
  const { graph, tree, map } = readyOrThrow(functionStructure(detail.program, kinds));
  return { ...detail, program: tree, graph, map };
}
