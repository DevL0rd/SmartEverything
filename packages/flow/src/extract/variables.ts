import type { FlowNode, Variable } from '@smarteverything/domain';
import type { NodeEntry } from '../program/lookup';
import type { Program } from '../program/walk';
import { refuse } from './result';

const VARIABLE_KINDS: ReadonlySet<string> = new Set(['var.get', 'var.set', 'var.change']);
const WRITING_KINDS: ReadonlySet<string> = new Set(['var.set', 'var.change']);
const DEFAULT_SOURCE = 'run';

export interface VariableUse {
  readonly variable: Variable;
  readonly written: boolean;
}

function literalText(node: FlowNode, port: string): string | undefined {
  const value = node.ports?.[port];
  return value !== undefined && 'lit' in value && typeof value.lit === 'string'
    ? value.lit
    : undefined;
}

function nodeUse(node: FlowNode): { readonly name: string; readonly written: boolean } | undefined {
  if (!VARIABLE_KINDS.has(node.kind)) return undefined;
  const source =
    node.ports?.['source'] === undefined ? DEFAULT_SOURCE : literalText(node, 'source');
  if (source === 'home') return undefined;
  if (source === 'automation') {
    refuse(
      'persistent',
      'persistent variables stay in the automation; pass a value reference instead',
    );
  }
  const name = literalText(node, 'name');
  if (source !== DEFAULT_SOURCE || name === undefined) {
    refuse('dynamic', `${node.key} picks its variable with an expression`);
  }
  return { name, written: WRITING_KINDS.has(node.kind) };
}

function declared(program: Program, name: string): Variable {
  const variable = program.variables.find((entry) => entry.name === name);
  if (variable === undefined) refuse('unknown_variable', `there is no variable named ${name}`);
  if (variable.persist === true) {
    refuse(
      'persistent',
      'persistent variables stay in the automation; pass a value reference instead',
    );
  }
  return variable;
}

export function variableUses(
  entries: readonly NodeEntry[],
  program: Program,
  referenced: readonly string[],
): readonly VariableUse[] {
  const uses = new Map<string, boolean>();
  for (const name of referenced) uses.set(name, uses.get(name) ?? false);
  for (const entry of entries) {
    const use = nodeUse(entry.node);
    if (use !== undefined) uses.set(use.name, use.written || (uses.get(use.name) ?? false));
  }
  return [...uses].map(([name, written]) => ({ variable: declared(program, name), written }));
}
