import type { FlowType, RefKind } from '@smarteverything/domain';
import { entryReferences, programLevelReferences } from '../check/references';
import type { CheckContext } from '../check/shapes';
import { entriesOf } from '../check/shapes';
import { resolveTypes } from '../check/types';
import type { NodeEntry, ProgramIndex } from '../program/lookup';
import type { Program } from '../program/walk';
import { controlFacts } from './control';
import type { InputSpec, VariableSpec } from './inputs';
import { buildInputs, needsOf } from './inputs';
import type { OutputSpec } from './outputs';
import { buildOutputs } from './outputs';
import type { Region } from './region';
import { knownKind } from './region';
import { variableUses } from './variables';

export interface FixedReference {
  readonly key: string;
  readonly port: string;
  readonly of: RefKind;
}

export interface Boundary {
  readonly inputs: readonly InputSpec[];
  readonly variables: readonly VariableSpec[];
  readonly outputs: readonly OutputSpec[];
  readonly exits: readonly string[];
  readonly flavour: 'pure' | 'action';
  readonly early: boolean;
  readonly fixed: readonly FixedReference[];
  readonly derived: ReadonlyMap<string, string>;
  readonly outputNames: ReadonlyMap<string, string>;
}

function refKindOf(type: FlowType): RefKind | undefined {
  if (type.t === 'ref') return type.of;
  return type.t === 'optional' || type.t === 'list' ? refKindOf(type.of) : undefined;
}

function fixedReferences(
  entries: readonly NodeEntry[],
  ctx: CheckContext,
): readonly FixedReference[] {
  return entries.flatMap(({ node }) =>
    knownKind(node, ctx.kinds).inputs.flatMap((decl) => {
      const of = refKindOf(decl.type);
      const value = node.ports?.[decl.name];
      return of !== undefined && value !== undefined && 'lit' in value
        ? [{ key: node.key, port: decl.name, of }]
        : [];
    }),
  );
}

export function analyseBoundary(
  program: Program,
  index: ProgramIndex,
  region: Region,
  ctx: CheckContext,
): Boundary {
  const typed = resolveTypes(index, ctx).typed;
  const entries = index.nodes.filter((entry) => region.keys.has(entry.node.key));
  const control = controlFacts(entries, { index, region, program }, ctx.kinds);
  const inner = entries.flatMap((entry) => entryReferences(entry));
  const needs = needsOf(inner, region.keys, index);
  const uses = variableUses(entries, program, needs.variableNames);
  const inputs = buildInputs(needs, uses, typed);
  const outside = [
    ...entriesOf(index)
      .filter((entry) => !region.keys.has(entry.node.key))
      .flatMap((entry) => entryReferences(entry)),
    ...programLevelReferences(program),
  ];
  const top = new Set(region.nodes.map((node) => node.key));
  const outputs = buildOutputs(
    { outside, top, inside: region.keys },
    inputs.variables,
    typed,
    control.early,
  );
  const pure = entries.every((entry) => knownKind(entry.node, ctx.kinds).class === 'pure');
  return {
    inputs: inputs.specs,
    variables: inputs.variables,
    outputs: outputs.specs,
    exits: pure ? ['done'] : control.exits,
    flavour: pure ? 'pure' : 'action',
    early: control.early,
    fixed: fixedReferences(entries, ctx),
    derived: inputs.derived,
    outputNames: outputs.names,
  };
}
