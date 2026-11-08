import type {
  AutomationV3,
  AutomationV4,
  FunctionV3,
  FunctionV4,
  NodeKindLookup,
  ProgramV4,
  Scope,
} from '@smarteverything/domain';
import type { GraphProblem } from '@smarteverything/flow/graph/problem-types';
import { structuredOf } from '@smarteverything/flow/graph/structured-of';
import { flowBase, treeOf } from '@smarteverything/flow/graph/tree-of';
import type { Program } from '@smarteverything/flow/program/walk';

export class UnstructuredStoredProgramError extends Error {
  override readonly name = 'UnstructuredStoredProgramError';

  constructor(readonly problems: readonly GraphProblem[]) {
    super(`The program is not a valid graph: ${problems.map((found) => found.message).join(' ')}`);
  }
}

function automationOnly(tree: Program): AutomationV3 {
  if (tree.kind !== 'automation') throw new TypeError('The tree is not an automation.');
  return tree;
}

function functionOnly(tree: Program): FunctionV3 {
  if (tree.kind !== 'function') throw new TypeError('The tree is not a Custom Node.');
  return tree;
}

export function structuredProgram(program: ProgramV4, kinds: NodeKindLookup): Program {
  const structured = structuredOf(program, kinds);
  if (structured.kind === 'unstructured')
    throw new UnstructuredStoredProgramError(structured.problems);
  return structured.tree;
}

function flatScope(program: ProgramV4): Scope {
  return { nodes: program.nodes.map(flowBase) };
}

export type StructuredAutomation =
  | { readonly ok: true; readonly tree: AutomationV3 }
  | { readonly ok: false; readonly problems: readonly GraphProblem[] };

export function readAutomation(program: AutomationV4, kinds: NodeKindLookup): StructuredAutomation {
  const structured = structuredOf(program, kinds);
  if (structured.kind === 'unstructured') return { ok: false, problems: structured.problems };
  return { ok: true, tree: automationOnly(structured.tree) };
}

export function structuredAutomation(program: AutomationV4, kinds: NodeKindLookup): AutomationV3 {
  const read = readAutomation(program, kinds);
  if (!read.ok) throw new UnstructuredStoredProgramError(read.problems);
  return read.tree;
}

export function structuredFunction(program: FunctionV4, kinds: NodeKindLookup): FunctionV3 {
  return functionOnly(structuredProgram(program, kinds));
}

export function flatAutomation(program: AutomationV4): AutomationV3 {
  return automationOnly(treeOf(program, flatScope(program), undefined));
}

export function flatFunction(program: FunctionV4): FunctionV3 {
  return functionOnly(treeOf(program, flatScope(program), undefined));
}
