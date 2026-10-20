import type { z } from 'zod';
import type { FlowNode, InputPort, OutputPort, Scope, TriggerNode, Variable } from './node';
import { TRIGGER_KIND_PREFIX } from './node';
import type { RunPolicy } from './policy';
import type { PathSegment, VisitedNode } from './scope';
import { visitNodes } from './scope';

export interface RuleIssue {
  readonly path: readonly PathSegment[];
  readonly message: string;
}

interface ProgramBase {
  readonly inputs: readonly InputPort[];
  readonly outputs: readonly OutputPort[];
  readonly variables: readonly Variable[];
  readonly body: Scope;
}

export type StructuredProgram =
  | (ProgramBase & {
      readonly kind: 'automation';
      readonly triggers: readonly TriggerNode[];
      readonly policy: RunPolicy;
      readonly onFailure?: Scope | undefined;
    })
  | (ProgramBase & {
      readonly kind: 'function';
      readonly flavour: 'pure' | 'action';
      readonly exits: readonly string[];
    });

export const STATEFUL_KIND_IDS: ReadonlySet<string> = new Set([
  'timing.cooldown',
  'timing.hysteresis',
  'timing.debounce',
  'timing.rate_limit',
  'timing.quiet_hours',
  'state.counter',
  'state.timer',
  'state.machine',
  'state.lock',
  'state.remember',
]);

interface ScopeShape {
  readonly required: readonly string[];
  readonly optional: readonly string[];
  readonly minimum?: number;
}

const LOOP_SHAPE: ScopeShape = { required: ['body'], optional: [] };

const SCOPE_SHAPES: ReadonlyMap<string, ScopeShape> = new Map([
  ['flow.if', { required: [], optional: ['else'] }],
  ['flow.switch', { required: [], optional: ['default'] }],
  ['flow.try', { required: ['try'], optional: ['finally'] }],
  ['flow.parallel', { required: [], optional: [], minimum: 2 }],
  ['flow.for_each', LOOP_SHAPE],
  ['flow.repeat', LOOP_SHAPE],
  ['flow.for_range', LOOP_SHAPE],
  ['flow.while', LOOP_SHAPE],
  ['flow.do_until', LOOP_SHAPE],
  ['flow.forever', LOOP_SHAPE],
  ['flow.sequence', LOOP_SHAPE],
]);

const OUTPUT_KINDS: ReadonlySet<string> = new Set([
  'flow.if',
  'flow.switch',
  'flow.try',
  'flow.parallel',
]);

const FUNCTION_INSTANCE_KIND = 'fn.call';
const ERROR_SCOPE = 'onError';

interface Named {
  readonly value: string;
  readonly path: readonly PathSegment[];
}

function repeats(entries: readonly Named[], label: string): readonly RuleIssue[] {
  const seen = new Set<string>();
  const issues: RuleIssue[] = [];
  for (const entry of entries) {
    if (seen.has(entry.value)) {
      issues.push({
        path: entry.path,
        message: `${label} "${entry.value}" is used more than once`,
      });
    }
    seen.add(entry.value);
  }
  return issues;
}

function bodyNodes(program: StructuredProgram): readonly VisitedNode[] {
  const body = visitNodes(program.body, ['body']);
  if (program.kind === 'function' || program.onFailure === undefined) return body;
  return [...body, ...visitNodes(program.onFailure, ['onFailure'])];
}

function rowIds(visited: VisitedNode): readonly Named[] {
  const { node, path } = visited;
  return [
    ...(node.branches ?? []).map((row, index) => ({
      value: row.id,
      path: [...path, 'branches', index, 'id'],
    })),
    ...(node.cases ?? []).map((row, index) => ({
      value: row.id,
      path: [...path, 'cases', index, 'id'],
    })),
    ...(node.catches ?? []).map((row, index) => ({
      value: row.id,
      path: [...path, 'catches', index, 'id'],
    })),
  ];
}

function triggersOf(program: StructuredProgram): readonly TriggerNode[] {
  return program.kind === 'automation' ? program.triggers : [];
}

function identityIssues(
  program: StructuredProgram,
  nodes: readonly VisitedNode[],
): readonly RuleIssue[] {
  const triggers = triggersOf(program).map((trigger, index) => ({ trigger, index }));
  const ids = [
    ...triggers.map(({ trigger, index }) => ({
      value: trigger.id,
      path: ['triggers', index, 'id'],
    })),
    ...nodes.flatMap((visited) => [
      { value: visited.node.id, path: [...visited.path, 'id'] },
      ...rowIds(visited),
    ]),
  ];
  const keys = [
    ...triggers.map(({ trigger, index }) => ({
      value: trigger.key,
      path: ['triggers', index, 'key'],
    })),
    ...nodes.map((visited) => ({ value: visited.node.key, path: [...visited.path, 'key'] })),
  ];
  return [...repeats(ids, 'id'), ...repeats(keys, 'key')];
}

function listed(
  list: readonly { readonly name: string }[],
  field: string,
  label: string,
): readonly RuleIssue[] {
  return repeats(
    list.map((entry, index) => ({ value: entry.name, path: [field, index, 'name'] })),
    label,
  );
}

function nameIssues(program: StructuredProgram): readonly RuleIssue[] {
  const exits =
    program.kind === 'function'
      ? repeats(
          program.exits.map((exit, index) => ({ value: exit, path: ['exits', index] })),
          'exit',
        )
      : [];
  return [
    ...listed(program.inputs, 'inputs', 'input'),
    ...listed(program.outputs, 'outputs', 'output'),
    ...listed(program.variables, 'variables', 'variable'),
    ...exits,
  ];
}

function presence(
  present: boolean,
  expected: boolean,
  path: readonly PathSegment[],
  message: string,
): readonly RuleIssue[] {
  return present === expected ? [] : [{ path, message }];
}

function rowIssues(node: FlowNode, path: readonly PathSegment[]): readonly RuleIssue[] {
  return [
    ...presence(
      node.branches !== undefined,
      node.kind === 'flow.if',
      [...path, 'branches'],
      'branches belong to flow.if and flow.if needs them',
    ),
    ...presence(
      node.cases !== undefined,
      node.kind === 'flow.switch',
      [...path, 'cases'],
      'cases belong to flow.switch and flow.switch needs them',
    ),
    ...(node.catches !== undefined && node.kind !== 'flow.try'
      ? [{ path: [...path, 'catches'], message: 'catches belong to flow.try only' }]
      : []),
    ...(node.outputs !== undefined && !OUTPUT_KINDS.has(node.kind)
      ? [
          {
            path: [...path, 'outputs'],
            message:
              'structured outputs belong to flow.if, flow.switch, flow.try and flow.parallel',
          },
        ]
      : []),
    ...(node.pin !== undefined && node.kind !== FUNCTION_INSTANCE_KIND
      ? [{ path: [...path, 'pin'], message: `a pin belongs to ${FUNCTION_INSTANCE_KIND} only` }]
      : []),
  ];
}

function shapeScopeIssues(
  names: readonly string[],
  shape: ScopeShape,
  path: readonly PathSegment[],
): readonly RuleIssue[] {
  const declared = [...shape.required, ...shape.optional];
  const missing = shape.required
    .filter((name) => !names.includes(name))
    .map((name) => ({ path: [...path, 'scopes'], message: `the scope "${name}" is required` }));
  if (shape.minimum !== undefined) {
    return names.length < shape.minimum
      ? [
          {
            path: [...path, 'scopes'],
            message: `at least ${String(shape.minimum)} scopes are needed`,
          },
        ]
      : [];
  }
  const unknown = names
    .filter((name) => !declared.includes(name))
    .map((name) => ({
      path: [...path, 'scopes', name],
      message: `the scope "${name}" is not one of: ${declared.join(', ')}`,
    }));
  return [...missing, ...unknown];
}

function scopeIssues(node: FlowNode, path: readonly PathSegment[]): readonly RuleIssue[] {
  const all = Object.keys(node.scopes ?? {});
  const routed = node.policy?.onError === 'route';
  const errorScope =
    all.includes(ERROR_SCOPE) && !routed
      ? [
          {
            path: [...path, 'scopes', ERROR_SCOPE],
            message: 'the onError scope needs the node policy onError "route"',
          },
        ]
      : [];
  const shape = SCOPE_SHAPES.get(node.kind);
  const names = all.filter((name) => name !== ERROR_SCOPE);
  return [...errorScope, ...(shape === undefined ? [] : shapeScopeIssues(names, shape, path))];
}

function shapeIssues(nodes: readonly VisitedNode[]): readonly RuleIssue[] {
  return nodes.flatMap(({ node, path }) => [...rowIssues(node, path), ...scopeIssues(node, path)]);
}

function containmentIssues(
  program: StructuredProgram,
  nodes: readonly VisitedNode[],
): readonly RuleIssue[] {
  return nodes.flatMap(({ node, path }) => {
    if (node.kind.startsWith(TRIGGER_KIND_PREFIX)) {
      return [
        { path: [...path, 'kind'], message: 'a trigger belongs in the triggers, not the body' },
      ];
    }
    if (program.kind === 'function' && STATEFUL_KIND_IDS.has(node.kind)) {
      return [
        {
          path: [...path, 'kind'],
          message: `${node.kind} keeps memory and cannot sit inside a Custom Node`,
        },
      ];
    }
    return [];
  });
}

function modeIssues(policy: RunPolicy): readonly RuleIssue[] {
  const waits = policy.mode === 'queue';
  const counted = policy.mode === 'queue' || policy.mode === 'parallel';
  return [
    ...(policy.max !== undefined && !counted
      ? [{ path: ['policy', 'max'], message: 'max belongs to the queue and parallel modes' }]
      : []),
    ...(policy.maxWait !== undefined && !waits
      ? [{ path: ['policy', 'maxWait'], message: 'maxWait belongs to the queue mode' }]
      : []),
  ];
}

function persistIssues(program: StructuredProgram): readonly RuleIssue[] {
  if (program.kind === 'automation' || program.flavour === 'action') return [];
  return program.variables.flatMap((variable, index) =>
    variable.persist === true
      ? [
          {
            path: ['variables', index, 'persist'],
            message: 'only an action Custom Node can keep data between runs',
          },
        ]
      : [],
  );
}

function inputIssues(program: StructuredProgram): readonly RuleIssue[] {
  if (program.kind !== 'automation' || program.triggers.length === 0) return [];
  return program.inputs.flatMap((input, index) =>
    input.required && input.default === undefined
      ? [
          {
            path: ['inputs', index, 'default'],
            message: `input "${input.name}" is required, so it needs a default when triggers start the run`,
          },
        ]
      : [],
  );
}

export function structuralIssues(program: StructuredProgram): readonly RuleIssue[] {
  const nodes = bodyNodes(program);
  return [
    ...identityIssues(program, nodes),
    ...nameIssues(program),
    ...shapeIssues(nodes),
    ...containmentIssues(program, nodes),
    ...(program.kind === 'automation' ? modeIssues(program.policy) : []),
    ...persistIssues(program),
    ...inputIssues(program),
  ];
}

export function structuralRules(program: StructuredProgram, context: z.RefinementCtx): void {
  for (const issue of structuralIssues(program)) {
    context.addIssue({ code: 'custom', path: [...issue.path], message: issue.message });
  }
}
