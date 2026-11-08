import type { z } from 'zod';
import { ERROR_EXIT_PORT } from '../automation-nodes/error-port';
import {
  canRouteOnError,
  execClassOf,
  execPortsOf,
  fallibleOf,
  isErrorExitWired,
  type NodeKindLookup,
} from '../automation-nodes/exec-ports';
import type { GraphNode } from './graph';
import type { InputPort, OutputPort, TriggerNode, Variable } from './node';
import { TRIGGER_KIND_PREFIX } from './node';
import type { RunPolicy } from './policy';
import type { PathSegment } from './scope';
import { STATEFUL_KIND_IDS, structuralIssues } from './structure-rules';
import type { RuleIssue } from './structure-rules';

export type GraphRuleCode =
  | 'duplicate_id'
  | 'duplicate_key'
  | 'start_count'
  | 'failure_count'
  | 'rows_on_wrong_kind'
  | 'rows_missing'
  | 'paths_too_few'
  | 'path_name_duplicate'
  | 'path_name_reserved'
  | 'outputs_on_wrong_kind'
  | 'pin_on_wrong_kind'
  | 'trigger_in_nodes'
  | 'sequence_removed'
  | 'memory_in_function'
  | 'route_on_control'
  | 'error_exit_on_infallible'
  | 'undeclared_port'
  | 'unknown_target'
  | 'target_not_exec'
  | 'wire_into_start'
  | 'program_rule';

export interface GraphRuleIssue extends RuleIssue {
  readonly code: GraphRuleCode;
}

interface GraphProgramBase {
  readonly inputs: readonly InputPort[];
  readonly outputs: readonly OutputPort[];
  readonly variables: readonly Variable[];
  readonly nodes: readonly GraphNode[];
}

export type GraphRuleProgram =
  | (GraphProgramBase & {
      readonly kind: 'automation';
      readonly triggers: readonly TriggerNode[];
      readonly policy: RunPolicy;
    })
  | (GraphProgramBase & {
      readonly kind: 'function';
      readonly flavour: 'pure' | 'action';
      readonly exits: readonly string[];
    });

interface NodeAt {
  readonly node: GraphNode;
  readonly path: readonly PathSegment[];
}

interface Named {
  readonly value: string;
  readonly path: readonly PathSegment[];
}

const FLOW_SEQUENCE = 'flow.sequence';
const OUTPUT_KINDS: ReadonlySet<string> = new Set([
  'flow.if',
  'flow.switch',
  'flow.try',
  'flow.parallel',
]);
const RESERVED_PATH_NAME = 'onError';

function issue(
  code: GraphRuleCode,
  path: readonly PathSegment[],
  message: string,
): readonly GraphRuleIssue[] {
  return [{ code, path, message }];
}

function nodesAt(program: GraphRuleProgram): readonly NodeAt[] {
  return program.nodes.map((node, index) => ({ node, path: ['nodes', index] }));
}

function repeated(
  entries: readonly Named[],
  label: string,
  code: GraphRuleCode,
): readonly GraphRuleIssue[] {
  const seen = new Set<string>();
  const issues: GraphRuleIssue[] = [];
  for (const entry of entries) {
    if (seen.has(entry.value) && entry.path[0] === 'nodes') {
      issues.push(...issue(code, entry.path, `${label} "${entry.value}" is used more than once`));
    }
    seen.add(entry.value);
  }
  return issues;
}

function rowIdsOf({ node, path }: NodeAt): readonly Named[] {
  const rows = [
    ...(node.branches ?? []).map((row, index) => ({ row, part: 'branches', index })),
    ...(node.cases ?? []).map((row, index) => ({ row, part: 'cases', index })),
    ...(node.catches ?? []).map((row, index) => ({ row, part: 'catches', index })),
  ];
  return rows.map(({ row, part, index }) => ({
    value: row.id,
    path: [...path, part, index, 'id'],
  }));
}

function identityIssues(program: GraphRuleProgram): readonly GraphRuleIssue[] {
  const triggers = program.kind === 'automation' ? program.triggers : [];
  const nodes = nodesAt(program);
  const ids = [
    ...triggers.map((trigger, index) => ({ value: trigger.id, path: ['triggers', index, 'id'] })),
    ...nodes.flatMap((at) => [{ value: at.node.id, path: [...at.path, 'id'] }, ...rowIdsOf(at)]),
  ];
  const keys = [
    ...triggers.map((trigger, index) => ({ value: trigger.key, path: ['triggers', index, 'key'] })),
    ...nodes.map((at) => ({ value: at.node.key, path: [...at.path, 'key'] })),
  ];
  return [...repeated(ids, 'id', 'duplicate_id'), ...repeated(keys, 'key', 'duplicate_key')];
}

function kindsAt(program: GraphRuleProgram, kind: string): readonly NodeAt[] {
  return nodesAt(program).filter((at) => at.node.kind === kind);
}

function extraIssues(
  found: readonly NodeAt[],
  allowed: number,
  code: GraphRuleCode,
  message: string,
): readonly GraphRuleIssue[] {
  return found.slice(allowed).flatMap((at) => issue(code, [...at.path, 'kind'], message));
}

function startIssues(program: GraphRuleProgram): readonly GraphRuleIssue[] {
  const starts = kindsAt(program, 'flow.start');
  const missing =
    starts.length === 0
      ? issue('start_count', ['nodes'], 'a graph needs exactly one Start node (flow.start)')
      : [];
  const failures = kindsAt(program, 'flow.on_failure');
  const failureLimit = program.kind === 'automation' ? 1 : 0;
  const failureMessage =
    program.kind === 'automation'
      ? 'an automation has at most one On failure node'
      : 'only an automation has an On failure node, a Custom Node does not';
  return [
    ...missing,
    ...extraIssues(starts, 1, 'start_count', 'a graph has exactly one Start node (flow.start)'),
    ...extraIssues(failures, failureLimit, 'failure_count', failureMessage),
  ];
}

interface RowSpec {
  readonly part: 'branches' | 'cases' | 'catches';
  readonly owner: string;
  readonly required: boolean;
}

const ROW_SPECS: readonly RowSpec[] = [
  { part: 'branches', owner: 'flow.if', required: true },
  { part: 'cases', owner: 'flow.switch', required: true },
  { part: 'catches', owner: 'flow.try', required: false },
];

function presenceIssue(
  node: GraphNode,
  path: readonly PathSegment[],
  spec: RowSpec,
): readonly GraphRuleIssue[] {
  const { part, owner, required } = spec;
  const present = node[part] !== undefined;
  if (node.kind === owner) {
    return required && !present
      ? issue('rows_missing', [...path, part], `${owner} node "${node.key}" needs ${part}`)
      : [];
  }
  return present
    ? issue(
        'rows_on_wrong_kind',
        [...path, part],
        `${part} belong to ${owner} only, and node "${node.key}" is ${node.kind}`,
      )
    : [];
}

function pathIssues({ node, path }: NodeAt): readonly GraphRuleIssue[] {
  if (node.paths === undefined) {
    return node.kind === 'flow.parallel'
      ? issue('paths_too_few', [...path, 'paths'], `Do together "${node.key}" needs paths`)
      : [];
  }
  if (node.kind !== 'flow.parallel') {
    return issue(
      'rows_on_wrong_kind',
      [...path, 'paths'],
      `paths belong to flow.parallel only, and node "${node.key}" is ${node.kind}`,
    );
  }
  const names = node.paths.map((row, index) => ({
    value: row.name,
    path: [...path, 'paths', index, 'name'],
  }));
  const reserved = names
    .filter((name) => name.value === RESERVED_PATH_NAME)
    .flatMap((name) =>
      issue('path_name_reserved', name.path, `a path cannot be named ${RESERVED_PATH_NAME}`),
    );
  const seen = new Set<string>();
  const duplicated = names.flatMap((name) => {
    const again = seen.has(name.value);
    seen.add(name.value);
    return again
      ? issue('path_name_duplicate', name.path, `path name "${name.value}" is used more than once`)
      : [];
  });
  const few =
    node.paths.length < 2
      ? issue(
          'paths_too_few',
          [...path, 'paths'],
          `Do together "${node.key}" needs two or more paths`,
        )
      : [];
  return [...few, ...reserved, ...duplicated];
}

function rowIssues(at: NodeAt): readonly GraphRuleIssue[] {
  const { node, path } = at;
  return [...ROW_SPECS.flatMap((spec) => presenceIssue(node, path, spec)), ...pathIssues(at)];
}

function kindIssues(program: GraphRuleProgram, { node, path }: NodeAt): readonly GraphRuleIssue[] {
  const kindPath = [...path, 'kind'];
  return [
    ...(node.kind.startsWith(TRIGGER_KIND_PREFIX)
      ? issue('trigger_in_nodes', kindPath, 'a trigger belongs in the triggers, not the nodes')
      : []),
    ...(node.kind === FLOW_SEQUENCE
      ? issue(
          'sequence_removed',
          kindPath,
          `node "${node.key}" is Steps (flow.sequence), which no longer exists; wire its steps one after another instead`,
        )
      : []),
    ...(program.kind === 'function' && STATEFUL_KIND_IDS.has(node.kind)
      ? issue(
          'memory_in_function',
          kindPath,
          `${node.kind} keeps memory and cannot sit inside a Custom Node`,
        )
      : []),
    ...(node.outputs !== undefined && !OUTPUT_KINDS.has(node.kind)
      ? issue(
          'outputs_on_wrong_kind',
          [...path, 'outputs'],
          'structured outputs belong to flow.if, flow.switch, flow.try and flow.parallel',
        )
      : []),
    ...(node.pin !== undefined && node.kind !== 'fn.call'
      ? issue('pin_on_wrong_kind', [...path, 'pin'], 'a pin belongs to fn.call only')
      : []),
  ];
}

function routeIssues({ node, path }: NodeAt, kinds: NodeKindLookup): readonly GraphRuleIssue[] {
  const routed = node.policy?.onError === 'route';
  const wired = isErrorExitWired(node);
  if ((!routed && !wired) || !kinds.has(node.kind) || canRouteOnError(node.kind, kinds)) return [];
  const at = routed ? [...path, 'policy', 'onError'] : [...path, 'to', ERROR_EXIT_PORT];
  if (execClassOf(node.kind, kinds) === 'step' && !fallibleOf(node.kind, kinds)) {
    return issue(
      'error_exit_on_infallible',
      at,
      `node "${node.key}" (${node.kind}) cannot fail, so it has no If it fails exit`,
    );
  }
  return routed
    ? issue(
        'route_on_control',
        at,
        `node "${node.key}" (${node.kind}) cannot route its errors; only a plain step has an If it fails exit`,
      )
    : [];
}

function targetIssues(
  target: string,
  path: readonly PathSegment[],
  byKey: ReadonlyMap<string, GraphNode>,
  kinds: NodeKindLookup,
): readonly GraphRuleIssue[] {
  const node = byKey.get(target);
  if (node === undefined) {
    return issue('unknown_target', path, `"${target}" does not name a node of this graph`);
  }
  if (!kinds.has(node.kind)) return [];
  const targetClass = execClassOf(node.kind, kinds);
  if (targetClass === 'start' || targetClass === 'failure') {
    return issue(
      'wire_into_start',
      path,
      `nothing can be wired into "${target}", it is where a run begins`,
    );
  }
  return targetClass === 'value'
    ? issue('target_not_exec', path, `"${target}" is a value card, so no step can lead into it`)
    : [];
}

function declaredPortIssue(
  node: GraphNode,
  port: string,
  path: readonly PathSegment[],
  kinds: NodeKindLookup,
): readonly GraphRuleIssue[] {
  const declared = execPortsOf(node.kind, node, kinds).outputs.map((out) => out.port);
  if (declared.includes(port)) return [];
  const known =
    declared.length === 0
      ? 'it has no exec exits'
      : `its exits are: ${declared.filter((name) => !name.includes(':')).join(', ')}`;
  return issue(
    'undeclared_port',
    path,
    `node "${node.key}" (${node.kind}) has no exit "${port}", ${known}`,
  );
}

function wireIssues(
  { node, path }: NodeAt,
  byKey: ReadonlyMap<string, GraphNode>,
  kinds: NodeKindLookup,
): readonly GraphRuleIssue[] {
  const named = Object.entries(node.to ?? {}).flatMap(([port, target]) => [
    ...(kinds.has(node.kind) ? declaredPortIssue(node, port, [...path, 'to', port], kinds) : []),
    ...targetIssues(target, [...path, 'to', port], byKey, kinds),
  ]);
  const rows = [
    ...(node.branches ?? []).map((row, index) => ({ to: row.to, at: ['branches', index] })),
    ...(node.cases ?? []).map((row, index) => ({ to: row.to, at: ['cases', index] })),
    ...(node.catches ?? []).map((row, index) => ({ to: row.to, at: ['catches', index] })),
    ...(node.paths ?? []).map((row, index) => ({ to: row.to, at: ['paths', index] })),
  ].flatMap(({ to, at }) =>
    to === undefined ? [] : targetIssues(to, [...path, ...at, 'to'], byKey, kinds),
  );
  return [...named, ...rows];
}

function nodeIssues(program: GraphRuleProgram, kinds: NodeKindLookup): readonly GraphRuleIssue[] {
  const byKey = new Map(program.nodes.map((node) => [node.key, node]));
  return nodesAt(program).flatMap((at) => [
    ...rowIssues(at),
    ...kindIssues(program, at),
    ...routeIssues(at, kinds),
    ...wireIssues(at, byKey, kinds),
  ]);
}

function programIssues(program: GraphRuleProgram): readonly GraphRuleIssue[] {
  return structuralIssues({ ...program, body: { nodes: [] } }).map((found) => ({
    ...found,
    code: 'program_rule',
  }));
}

export function graphRuleIssues(
  program: GraphRuleProgram,
  kinds: NodeKindLookup,
): readonly GraphRuleIssue[] {
  return [
    ...programIssues(program),
    ...identityIssues(program),
    ...startIssues(program),
    ...nodeIssues(program, kinds),
  ];
}

export function graphRules(
  program: GraphRuleProgram,
  context: z.RefinementCtx,
  kinds: NodeKindLookup,
): void {
  for (const found of graphRuleIssues(program, kinds)) {
    context.addIssue({
      code: 'custom',
      path: [...found.path],
      message: found.message,
      params: { graphRule: found.code },
    });
  }
}
