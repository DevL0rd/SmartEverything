import {
  ERROR_CLASS,
  JSON_VALUE,
  compileWaitEventMatcher,
  waitUntilTimeError,
} from '@smarteverything/domain';
import type { FlowNode, NodeKind, PortValue, Scope } from '@smarteverything/domain';
import { z } from 'zod';
import { pinOf } from '../functions/calls';
import type { PlanOp } from './plan';
import type { At, PlanPorts } from './plan-parts';
import { MILLISECONDS, TEXT, VAR_SOURCE } from './plan-parts';

export const LOWER_PROBLEM_CODES = [
  'unknown_kind',
  'not_supported',
  'missing_port',
  'static_not_literal',
  'invalid_literal',
  'unknown_loop',
  'break_outside_loop',
] as const;

export const LOWER_PROBLEM = z.strictObject({
  nodeId: TEXT,
  key: TEXT,
  port: TEXT.optional(),
  code: z.enum(LOWER_PROBLEM_CODES),
  message: TEXT,
  expected: TEXT.optional(),
  received: TEXT.optional(),
  fix: TEXT.optional(),
});

export type LowerProblem = z.infer<typeof LOWER_PROBLEM>;

export type LowerProblemCode = LowerProblem['code'];

export type LowerKind = Pick<
  NodeKind,
  'id' | 'class' | 'inputs' | 'exits' | 'effect' | 'stateful' | 'reads'
>;

export interface Frame {
  readonly loops: readonly string[];
  readonly durable: boolean;
}

export interface ProblemDetail {
  readonly port?: string;
  readonly expected?: string;
  readonly received?: string;
  readonly fix?: string;
}

export interface Lowering {
  readonly frame: Frame;
  readonly report: (
    node: Pick<FlowNode, 'id' | 'key'>,
    code: LowerProblemCode,
    message: string,
    detail?: ProblemDetail,
  ) => void;
  readonly scope: (scope: Scope | undefined, frame: Frame) => PlanOp;
}

export interface Reader {
  readonly node: FlowNode;
  readonly kind: LowerKind;
  readonly low: Lowering;
  readonly at: At;
  readonly fixed: <T>(name: string, schema: z.ZodType<T>, fallback: T) => T;
  readonly port: (name: string) => PortValue;
  readonly maybe: (name: string) => PortValue | undefined;
  readonly rest: (omit?: readonly string[]) => PlanPorts;
  readonly problem: (code: LowerProblemCode, message: string, detail?: ProblemDetail) => void;
}

export type NodeLowering = (read: Reader) => PlanOp;

export function readerOf(low: Lowering, node: FlowNode, kind: LowerKind): Reader {
  const at = { id: node.id, key: node.key };
  const problem = (code: LowerProblemCode, message: string, detail?: ProblemDetail): void => {
    low.report(node, code, message, detail);
  };
  const decl = (name: string): LowerKind['inputs'][number] | undefined =>
    kind.inputs.find((port) => port.name === name);
  const fixed = <T>(name: string, schema: z.ZodType<T>, fallback: T): T => {
    const given = node.ports?.[name];
    if (given !== undefined && !('lit' in given)) {
      problem('static_not_literal', `the port "${name}" is a fixed setting`, {
        port: name,
        expected: 'a typed-in value',
        fix: 'replace the formula with a fixed value',
      });
      return fallback;
    }
    const raw = given === undefined ? decl(name)?.default : given.lit;
    return raw === undefined ? absent(name, fallback) : parseFixed(name, raw, schema, fallback);
  };
  const absent = <T>(name: string, fallback: T): T => {
    if (decl(name)?.required === true) {
      problem('missing_port', `the port "${name}" is needed`, { port: name });
    }
    return fallback;
  };
  const parseFixed = <T>(name: string, raw: unknown, schema: z.ZodType<T>, fallback: T): T => {
    const parsed = schema.safeParse(raw);
    if (parsed.success) return parsed.data;
    problem('invalid_literal', `the port "${name}" holds a value that does not fit`, {
      port: name,
      received: JSON.stringify(raw),
    });
    return fallback;
  };
  const port = (name: string): PortValue => {
    const given = node.ports?.[name];
    if (given !== undefined) return given;
    const standard = decl(name)?.default;
    if (standard !== undefined) return { lit: standard };
    problem('missing_port', `the port "${name}" is needed`, { port: name });
    return { lit: null };
  };
  const rest = (omit: readonly string[] = []): PlanPorts =>
    Object.fromEntries(Object.entries(node.ports ?? {}).filter(([name]) => !omit.includes(name)));
  return { node, kind, low, at, fixed, port, maybe: (name) => node.ports?.[name], rest, problem };
}

const FLAG = z.boolean();
const OPTIONAL_TEXT = TEXT.optional();
const OPTIONAL_JSON = JSON_VALUE.optional();
const TIMEOUT = MILLISECONDS.optional();

export function effectFields(read: Reader): {
  at: At;
  policy: FlowNode['policy'];
  kind: string;
  params: PlanPorts;
  retry: 'idempotent' | 'relative' | 'external';
  budget: 'none' | 'command' | 'effects' | 'effects_person' | 'effects_if_durable';
} {
  const { effect } = read.kind;
  if (effect === undefined) {
    read.problem('not_supported', `${read.kind.id} has no effect class`);
  }
  return {
    at: read.at,
    policy: read.node.policy,
    kind: read.node.kind,
    params: read.rest(),
    retry: effect?.retry ?? 'idempotent',
    budget: effect?.budget ?? 'none',
  };
}

const lowerEffect: NodeLowering = (read) => ({ op: 'effect', ...effectFields(read) });

const lowerCompute: NodeLowering = (read) => ({
  op: 'compute',
  at: read.at,
  kind: read.node.kind,
  ports: read.rest(),
});

const lowerRead: NodeLowering = (read) => ({
  op: 'read',
  at: read.at,
  policy: read.node.policy,
  kind: read.node.kind,
  ports: read.rest(),
  reads: [...(read.kind.reads?.(read.rest()) ?? [])],
});

const ERROR_SCOPE = 'onError';

function exitScopes(read: Reader): Record<string, PlanOp> | undefined {
  const named = Object.entries(read.node.scopes ?? {}).filter(([name]) => name !== ERROR_SCOPE);
  if (named.length === 0) return undefined;
  return Object.fromEntries(
    named.map(([name, scope]) => [name, read.low.scope(scope, read.low.frame)]),
  );
}

const lowerState: NodeLowering = (read) => ({
  op: 'state_op',
  at: read.at,
  policy: read.node.policy,
  kind: read.node.kind,
  ports: read.rest(),
  exits: [...read.kind.exits],
  scopes: exitScopes(read),
});

const EDGE = z.enum(['wrap', 'clamp']);

function setVar(mode: 'set' | 'change'): NodeLowering {
  return (read) => ({
    op: 'set_var',
    at: read.at,
    policy: read.node.policy,
    mode,
    source: read.fixed('source', VAR_SOURCE, 'run'),
    name: read.fixed('name', OPTIONAL_TEXT, undefined),
    value: read.fixed('value', OPTIONAL_TEXT, undefined),
    to: mode === 'set' ? read.port('to') : undefined,
    change:
      mode === 'change'
        ? {
            op: read.fixed('op', TEXT, ''),
            amount: read.maybe('amount'),
            field: read.fixed('field', OPTIONAL_TEXT, undefined),
            edge: read.fixed('edge', EDGE, 'wrap'),
            steps: read.fixed('steps', z.array(JSON_VALUE).optional(), undefined),
          }
        : undefined,
    retry: read.kind.effect?.retry ?? 'idempotent',
    budget: read.kind.effect?.budget ?? 'none',
  });
}

const lowerCall: NodeLowering = (read) => ({
  op: 'call',
  at: read.at,
  policy: read.node.policy,
  fn: read.fixed('fn', TEXT, ''),
  pin: pinOf(read.node),
  inputs: read.rest(['fn', 'pin']),
  detached: false,
});

const lowerRun: NodeLowering = (read) => ({
  op: 'run',
  at: read.at,
  policy: read.node.policy,
  automation: read.fixed('automation', TEXT, ''),
  wait: read.fixed('wait', FLAG, false),
  allowSelf: read.fixed('allowSelf', FLAG, false),
  inputs: read.rest(['automation', 'wait', 'allowSelf']),
  detached: true,
});

type WaitSpec = Extract<PlanOp, { op: 'wait' }>['wait'];

function waitOp(read: Reader, wait: WaitSpec): PlanOp {
  return {
    op: 'wait',
    at: read.at,
    policy: read.node.policy,
    durable: read.low.frame.durable,
    wait,
    scopes: exitScopes(read),
  };
}

const lowerWait: NodeLowering = (read) =>
  waitOp(read, {
    kind: 'duration',
    duration: read.port('duration'),
    ifLate: read.fixed('ifLate', z.enum(['run', 'skip', 'fail']), 'run'),
  });

const lowerWaitUntilTime: NodeLowering = (read) => {
  const at = read.maybe('at');
  const clock = read.fixed('clock', OPTIONAL_JSON, undefined);
  const timeError = waitUntilTimeError({ at, clock });
  if (timeError !== null) read.problem('invalid_literal', timeError, { port: 'at' });
  return waitOp(read, {
    kind: 'until_instant',
    at,
    clock,
    ifLate: read.fixed('ifLate', z.enum(['skip', 'run']), 'skip'),
    graceMs: read.fixed('grace', z.int().min(0), 0),
  });
};

const MATCHER_PORTS = ['source', 'kind', 'subject', 'field', 'match'] as const;

const lowerWaitEvent: NodeLowering = (read) => {
  const values = Object.fromEntries(
    MATCHER_PORTS.map((name) => [name, read.fixed(name, OPTIONAL_JSON, undefined)]),
  );
  const matcher = compileWaitEventMatcher(values);
  if (!matcher.ok) read.problem('invalid_literal', matcher.error, { port: 'source' });
  return waitOp(read, {
    kind: 'event',
    matcher: matcher.ok ? matcher.matcher : { source: '', kind: '' },
    timeoutMs: read.fixed('timeout', TIMEOUT, undefined),
  });
};

const lowerWaitCondition: NodeLowering = (read) =>
  waitOp(read, {
    kind: 'condition',
    condition: read.port('condition'),
    holdMs: read.fixed('hold', TIMEOUT, undefined),
    timeoutMs: read.fixed('timeout', TIMEOUT, undefined),
  });

const ANSWER_OPTIONS = z.array(TEXT).min(2).max(4);

const lowerAsk: NodeLowering = (read) => {
  const options = read.fixed('options', ANSWER_OPTIONS, []);
  const defaultAnswer = read.fixed('defaultAnswer', OPTIONAL_TEXT, undefined);
  if (defaultAnswer !== undefined && !options.includes(defaultAnswer)) {
    read.problem(
      'invalid_literal',
      'the answer to use when time runs out is not one of the buttons',
      {
        port: 'defaultAnswer',
        received: defaultAnswer,
        expected: options.join(', '),
      },
    );
  }
  return waitOp(read, {
    kind: 'answer',
    person: read.port('person'),
    question: read.port('question'),
    options,
    timeoutMs: read.fixed('timeout', TIMEOUT, undefined),
    defaultAnswer,
  });
};

const lowerReturn: NodeLowering = (read) => ({
  op: 'return',
  at: read.at,
  exit: read.fixed('exit', OPTIONAL_TEXT, undefined),
  values: read.rest(['exit']),
});

const lowerStop: NodeLowering = (read) => ({
  op: 'stop',
  at: read.at,
  message: read.maybe('message'),
  failed: read.fixed('failed', FLAG, false),
  cancelSelf: read.fixed('cancelSelf', FLAG, false),
});

const lowerFail: NodeLowering = (read) => ({
  op: 'fail',
  at: read.at,
  class: read.fixed('class', ERROR_CLASS, 'Failed'),
  message: read.maybe('message'),
  cause: read.maybe('cause'),
});

const lowerBreakpoint: NodeLowering = (read) => ({ op: 'breakpoint', at: read.at });

const BY_ID: Readonly<Record<string, NodeLowering>> = {
  'fn.call': lowerCall,
  'automation.run': lowerRun,
  'var.set': setVar('set'),
  'var.change': setVar('change'),
  'flow.wait': lowerWait,
  'flow.wait_until_time': lowerWaitUntilTime,
  'flow.wait_event': lowerWaitEvent,
  'flow.wait_condition': lowerWaitCondition,
  'notify.ask': lowerAsk,
  'flow.return': lowerReturn,
  'flow.stop': lowerStop,
  'flow.fail': lowerFail,
  'debug.breakpoint': lowerBreakpoint,
};

const BY_CLASS: Readonly<Partial<Record<LowerKind['class'], NodeLowering>>> = {
  effect: lowerEffect,
  pure: lowerCompute,
  read: lowerRead,
};

export function leafLowering(kind: LowerKind): NodeLowering | undefined {
  return BY_ID[kind.id] ?? (kind.stateful === true ? lowerState : BY_CLASS[kind.class]);
}
